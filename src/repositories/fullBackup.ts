import Dexie from "dexie";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { z } from "zod";
import { db, type AppDatabase } from "../storage/db";
import { backupSchema, schemas } from "./backup";
import {
  dispositionSchemas,
  dispositionContentSchema,
} from "./dispositionSchemas";
import { notaSchemas } from "./notaSchemas";
import { stage3Schemas } from "./stage3Schemas";
import { id, now } from "../utils";
const MAX_TOTAL = 150 * 1024 * 1024,
  MAX_FILE = 30 * 1024 * 1024,
  MAX_COUNT = 2500;
const fileSchema = z.object({
  id: z.string().min(1),
  path: z.string(),
  name: z.string(),
  type: z.string(),
  letterId: z.string(),
  bytes: z.number().int().nonnegative().max(MAX_FILE),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const manifestSchema = z.object({
  format: z.literal("siminu-rsas-backup"),
  schemaVersion: z.union([
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  appVersion: z.string(),
  createdAt: z.iso.datetime(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  metadata: z.object({
    path: z.literal("metadata.json"),
    sha256: z.string(),
    bytes: z.number().int().nonnegative().max(MAX_FILE),
  }),
  files: z.array(fileSchema).max(MAX_COUNT),
});
export type PackageManifest = z.infer<typeof manifestSchema>;
export type Metadata = z.infer<typeof backupSchema>["tables"];
export interface ValidatedPackage {
  preview?: Record<string, string | undefined>;
  manifest: PackageManifest;
  tables: Metadata;
  attachments: {
    id: string;
    letterId: string;
    name: string;
    type: string;
    blob: Blob;
  }[];
}
export async function checksum(bytes: Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export const metadataTables = Object.keys(schemas) as (keyof Metadata)[];
export async function createFullBackup(database: AppDatabase = db) {
  const snapshot = await database.transaction(
    "r",
    database.tables,
    async () => {
      const tables: Record<string, unknown[]> = {};
      for (const name of metadataTables)
        tables[name] = await database.table(name).toArray();
      return { tables, attachments: await database.attachments.toArray() };
    },
  );
  const metadata = strToU8(
    JSON.stringify({ version: 1, tables: snapshot.tables }),
  );
  const entries: Record<string, Uint8Array> = { "metadata.json": metadata };
  const files: PackageManifest["files"] = [];
  for (const [index, a] of snapshot.attachments.entries()) {
    const bytes = new Uint8Array(await a.blob.arrayBuffer());
    if (bytes.length > MAX_FILE)
      throw Error("Lampiran melebihi batas paket 30 MB per berkas.");
    const path = `files/${String(index).padStart(6, "0")}.bin`;
    entries[path] = bytes;
    files.push({
      id: a.id,
      letterId: a.letterId,
      name: a.name,
      type: a.type,
      path,
      bytes: bytes.length,
      sha256: await checksum(bytes),
    });
  }
  const manifest: PackageManifest = {
    format: "siminu-rsas-backup",
    schemaVersion: 5,
    appVersion: "5.0.0",
    createdAt: now(),
    counts: Object.fromEntries(
      Object.entries(snapshot.tables).map(([k, v]) => [k, v.length]),
    ),
    metadata: {
      path: "metadata.json",
      sha256: await checksum(metadata),
      bytes: metadata.length,
    },
    files,
  };
  entries["manifest.json"] = strToU8(JSON.stringify(manifest));
  const packed = zipSync(entries, { level: 0 });
  if (packed.length > MAX_TOTAL)
    throw Error(
      "Paket melebihi batas 150 MB. Kurangi ukuran lampiran sebelum mencoba kembali.",
    );
  return new Blob([Uint8Array.from(packed)], { type: "application/zip" });
}
// Inspect the central directory before allocating decompressed entries.
function inspectZip(data: Uint8Array) {
  if (data.length > MAX_TOTAL) throw Error("Ukuran ZIP melebihi batas 150 MB.");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw Error("ZIP tidak lengkap atau rusak.");
  const count = view.getUint16(end + 10, true),
    offset = view.getUint32(end + 16, true);
  if (count > MAX_COUNT + 2 || count === 65535)
    throw Error("Jumlah berkas ZIP tidak didukung.");
  let cursor = offset,
    total = 0;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      throw Error("Direktori ZIP rusak.");
    const flags = view.getUint16(cursor + 8, true),
      size = view.getUint32(cursor + 24, true),
      len = view.getUint16(cursor + 28, true);
    if (flags & 1 || size > MAX_FILE)
      throw Error("ZIP terenkripsi atau berkas terlalu besar.");
    total += size;
    if (total > MAX_TOTAL) throw Error("Isi ZIP melebihi batas 150 MB.");
    const path = strFromU8(data.slice(cursor + 46, cursor + 46 + len));
    if (
      names.has(path) ||
      !/^(manifest\.json|metadata\.json|files\/\d{6}\.bin)$/.test(path)
    )
      throw Error("Nama berkas ZIP tidak valid atau ganda.");
    names.add(path);
    cursor +=
      46 +
      len +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true);
  }
  return names;
}
export function validateReferences(
  tables: Metadata,
  attachments: { id: string; letterId: string }[],
) {
  const sets = Object.fromEntries(
    Object.entries(tables).map(([k, v]) => [
      k,
      new Set(v.map((row) => row.id)),
    ]),
  );
  const files = new Set(attachments.map((a) => a.id));
  const owners = new Map(attachments.map((a) => [a.id, a.letterId]));
  const agendaKeys = tables.letters.map(
    (l) => `${l.received.slice(0, 4)}:${l.register || "SM"}:${l.agenda}`,
  );
  if (new Set(agendaKeys).size !== agendaKeys.length)
    throw Error("Nomor agenda ganda dalam register dan tahun yang sama.");
  const ref = (table: string, value: string | undefined) => {
    if (value && !sets[table]?.has(value))
      throw Error(`Referensi ${table} hilang: ${value}`);
  };
  for (const [name, rows] of Object.entries(tables))
    if (new Set(rows.map((r) => r.id)).size !== rows.length)
      throw Error(`ID ganda: ${name}`);
  for (const l of tables.letters)
    ref("units", l.targetUnitId as string | undefined);
  for (const l of tables.letters)
    for (const aid of l.attachmentIds)
      if (!files.has(aid) || owners.get(aid) !== l.id)
        throw Error(`Lampiran surat hilang atau pemilik tidak cocok: ${aid}`);
  for (const l of tables.outgoing) {
    ref("letters", l.incomingId as string | undefined);
    ref("drafts", l.draftId as string | undefined);
    ref("notes", l.noteId as string | undefined);
    for (const aid of (l.attachmentIds as string[] | undefined) || [])
      if (
        !files.has(aid) ||
        (owners.get(aid) !== l.id &&
          owners.get(aid) !== l.draftId &&
          owners.get(aid) !== l.noteId)
      )
        throw Error(
          `Lampiran surat keluar hilang atau pemilik tidak cocok: ${aid}`,
        );
  }
  for (const a of attachments)
    if (
      !sets.letters.has(a.letterId) &&
      !sets.outgoing.has(a.letterId) &&
      !sets.minutes.has(a.letterId) &&
      !sets.drafts.has(a.letterId) &&
      !sets.notes.has(a.letterId)
    )
      throw Error("Pemilik lampiran tidak ditemukan.");
  for (const d of tables.dispositions) {
    ref("letters", d.letterId);
    ref("dispositions", d.revisionOf as string | undefined);
    ref("dispositions", d.parentId as string | undefined);
    for (const r of d.recipients) {
      ref("units", r.unitId);
      ref("users", r.userId);
    }
  }
  for (const t of tables.tasks) {
    ref("letters", t.letterId);
    ref("minutes", t.minutesId as string | undefined);
    ref("events", t.agendaId as string | undefined);
    ref("dispositions", t.dispositionId);
    ref("units", t.unitId);
    ref("users", t.userId);
    ref("tasks", t.parentId as string | undefined);
  }
  for (const d of tables.dispositions.filter((d) => d.digital)) {
    const c = dispositionContentSchema.parse({
      letterId: d.letterId,
      giverId: d.issuerId,
      giver: d.giver,
      giverPosition: d.issuerPosition,
      mode: d.mode,
      recipients: d.recipients,
      instructions: d.instructions,
      notes: d.notes,
      deadline: d.deadline,
      reportRequired: d.reportRequired,
      review: d.review,
      reviewerId: d.reviewerId,
    });
    ref("users", c.giverId);
    ref("users", c.reviewerId);
    if (!Number.isInteger(d.version) || !Number.isInteger(d.revision))
      throw Error("Nomor versi/revisi disposisi digital tidak valid.");
    if (
      new Set(c.recipients.map((r) => r.userId)).size !== c.recipients.length ||
      new Set(c.recipients.map((r) => r.id)).size !== c.recipients.length
    )
      throw Error("Penerima disposisi ganda.");
    if (
      c.mode === "Untuk diketahui" &&
      c.recipients.some((r) => r.kind !== "Tembusan")
    )
      throw Error("Disposisi informasi memiliki kewajiban.");
    if (
      !tables.dispositionVersions.some(
        (v) =>
          v.dispositionId === d.id &&
          v.version === d.version &&
          v.snapshot.giver === d.giver &&
          v.snapshot.issuerId === d.issuerId,
      )
    )
      throw Error("Snapshot disposisi terkini hilang/tidak cocok.");
    for (const r of c.recipients) {
      ref("positions", r.positionId);
      if (
        !tables.recipientReceipts.some(
          (x) =>
            x.dispositionId === d.id &&
            x.recipientId === r.id &&
            x.userId === r.userId &&
            !x.retired,
        )
      )
        throw Error("Status baca penerima hilang.");
    }
  }
  const dvKeys = tables.dispositionVersions.map(
    (v) => v.dispositionId + ":" + v.version,
  );
  if (new Set(dvKeys).size !== dvKeys.length)
    throw Error("Versi disposisi ganda.");
  for (const v of tables.dispositionVersions) {
    ref("dispositions", v.dispositionId);
    ref("users", v.userId);
    ref("users", v.snapshot.issuerId as string);
    ref("users", v.snapshot.reviewerId as string);
    ref("letters", v.snapshot.letterId);
    if (v.snapshot.id !== v.dispositionId || v.snapshot.version !== v.version)
      throw Error("Identitas snapshot disposisi tidak cocok.");
    for (const r of v.snapshot.recipients) {
      ref("users", r.userId);
      ref("units", r.unitId);
      ref("positions", r.positionId);
    }
  }
  for (const r of tables.recipientReceipts) {
    ref("dispositions", r.dispositionId);
    ref("users", r.userId);
    ref("units", r.unitId);
    if (
      !tables.dispositionVersions.some(
        (v) =>
          v.dispositionId === r.dispositionId &&
          v.snapshot.recipients.some(
            (p) => p.id === r.recipientId && p.userId === r.userId,
          ),
      )
    )
      throw Error("Sumber penerima/status baca tidak cocok.");
  }
  for (const draft of tables.dispositionDrafts) {
    ref("letters", draft.content.letterId);
    ref("users", draft.authorId);
    ref("users", draft.content.giverId);
    ref("users", draft.content.reviewerId);
    ref("dispositions", draft.sourceId);
    ref("dispositions", draft.publishedId);
    for (const r of draft.content.recipients) {
      ref("users", r.userId);
      ref("units", r.unitId);
      ref("positions", r.positionId);
    }
  }
  for (const o of tables.dispositionOutputs) {
    ref("dispositions", o.dispositionId);
    ref("tasks", o.taskId);
    ref("users", o.userId);
    ref(o.kind, o.targetId);
    if (
      o.taskId &&
      !tables.tasks.some(
        (t) => t.id === o.taskId && t.dispositionId === o.dispositionId,
      )
    )
      throw Error("Tugas keluaran tidak sesuai disposisi.");
    const target = tables[o.kind].find((t) => t.id === o.targetId);
    if (
      o.kind === "notes" &&
      target &&
      "content" in target &&
      (target.content as { dispositionId?: string }).dispositionId !==
        o.dispositionId
    )
      throw Error("Referensi Nota Dinas keluaran tidak cocok.");
  }
  for (const t of tables.tasks.filter((t) => t.digital)) {
    ref("users", t.issuerId as string);
    ref("users", t.reviewerId as string);
    const d = tables.dispositions.find((d) => d.id === t.dispositionId);
    if (!d?.digital || d.letterId !== t.letterId)
      throw Error("Sumber tugas digital tidak sesuai.");
    if (!Number.isInteger(t.revision))
      throw Error("Revisi tugas digital tidak valid.");
    if (
      t.parentId &&
      !tables.tasks.some(
        (p) =>
          p.id === t.parentId &&
          p.dispositionId === t.dispositionId &&
          p.letterId === t.letterId,
      )
    )
      throw Error("Induk delegasi tidak sesuai.");
    if (
      !t.parentId &&
      !tables.dispositionVersions.some(
        (v) =>
          v.dispositionId === t.dispositionId &&
          v.snapshot.recipients.some(
            (r) =>
              r.id === t.recipientId &&
              r.userId === t.userId &&
              r.kind !== "Tembusan",
          ),
      )
    )
      throw Error("Tugas wajib tidak sesuai penerima.");
  }
  for (const r of tables.reports) {
    ref("tasks", r.taskId);
    for (const aid of r.attachmentIds)
      if (!files.has(aid)) throw Error("Bukti hasil hilang.");
  }
  for (const d of tables.drafts) {
    ref("templates", d.templateId);
    ref("users", d.authorId);
    ref("units", d.unitId);
    ref("outgoing", d.outgoingId as string | undefined);
    for (const uid of d.reviewerIds) ref("users", uid);
    for (const aid of d.attachmentIds)
      if (!files.has(aid)) throw Error("Lampiran naskah hilang.");
  }
  const versionKeys = tables.draftVersions.map(
    (v) => `${v.draftId}:${v.version}`,
  );
  if (new Set(versionKeys).size !== versionKeys.length)
    throw Error("Versi naskah ganda.");
  for (const draft of tables.drafts)
    if (
      !tables.draftVersions.some(
        (v) => v.draftId === draft.id && v.version === draft.version,
      )
    )
      throw Error("Snapshot versi naskah terkini tidak ditemukan.");
  for (const v of tables.draftVersions) {
    ref("drafts", v.draftId);
    ref("users", v.authorId);
  }
  for (const v of tables.draftDecisions) {
    ref("drafts", v.draftId);
    ref("users", v.userId);
  }
  const numberKeys = tables.noteNumbers.map((r) => r.id);
  if (new Set(numberKeys).size !== numberKeys.length)
    throw Error("Nomor nota ganda.");
  const outgoingNumbers = tables.outgoing
    .filter((r) => r.number)
    .map((r) => r.number);
  if (new Set(outgoingNumbers).size !== outgoingNumbers.length)
    throw Error(
      "Konflik nomor surat keluar; periksa paket dari perangkat lain.",
    );
  const currentNumbers = tables.notes
    .filter((r) => r.officialNumber)
    .map((r) => r.officialNumber);
  if (new Set(currentNumbers).size !== currentNumbers.length)
    throw Error("Konflik nomor nota dinas antarperangkat.");
  const noteContentRefs = (
    c: Metadata["notes"][number]["content"],
    nid: string,
  ) => {
    ref("units", c.unitId);
    ref("letters", c.letterId);
    ref("dispositions", c.dispositionId);
    ref("tasks", c.taskId);
    const d = tables.dispositions.find((d) => d.id === c.dispositionId),
      t = tables.tasks.find((t) => t.id === c.taskId);
    if (d && c.letterId && d.letterId !== c.letterId)
      throw Error("Hubungan disposisi nota tidak cocok.");
    if (
      t &&
      ((c.letterId && t.letterId !== c.letterId) ||
        (c.dispositionId && t.dispositionId !== c.dispositionId))
    )
      throw Error("Hubungan tugas nota tidak cocok.");
    if (new Set(c.attachments.map((a) => a.id)).size !== c.attachments.length)
      throw Error("Lampiran nota ganda.");
    for (const a of c.attachments)
      if (!files.has(a.id) || owners.get(a.id) !== nid)
        throw Error("Lampiran nota hilang atau pemilik tidak cocok.");
  };
  for (const n of tables.notes) {
    ref("users", n.authorId);
    ref("outgoing", n.outgoingId);
    if (
      n.outgoingId &&
      !tables.outgoing.some(
        (o) =>
          o.id === n.outgoingId &&
          o.noteId === n.id &&
          o.noteVersion === n.version &&
          o.number === n.officialNumber,
      )
    )
      throw Error("Sumber Surat Keluar nota tidak cocok.");
    if (
      n.reviewIndex > n.reviewerIds.length ||
      new Set(n.reviewerIds).size !== n.reviewerIds.length
    )
      throw Error("Urutan pemeriksaan nota tidak valid.");
    if (
      ["Disetujui", "Bernomor", "Tercatat dikirim"].includes(n.status) &&
      n.approvedVersion !== n.version
    )
      throw Error("Tahap nota memerlukan persetujuan versi terkini.");
    if (
      ["Bernomor", "Tercatat dikirim"].includes(n.status) &&
      (!n.officialNumber || !n.content.signer.date)
    )
      throw Error("Nota bernomor memerlukan nomor dan tanggal.");
    if (
      n.status === "Tercatat dikirim" &&
      (!n.outgoingId || !n.sentAt || !n.sentVia)
    )
      throw Error("Catatan pengiriman nota tidak lengkap.");
    if (n.status === "Dibatalkan" && !n.cancelledReason?.trim())
      throw Error("Alasan pembatalan nota hilang.");
    for (const uid of n.reviewerIds) ref("users", uid);
    noteContentRefs(n.content, n.id);
    if (
      !tables.noteVersions.some(
        (v) =>
          v.noteId === n.id &&
          v.version === n.version &&
          JSON.stringify(v.content) === JSON.stringify(n.content),
      )
    )
      throw Error("Snapshot nota terkini hilang/tidak cocok.");
    if (n.approvedVersion !== undefined && n.approvedVersion !== n.version)
      throw Error("Persetujuan nota merujuk versi lama.");
    if (
      n.officialNumber &&
      !tables.noteNumbers.some(
        (r) =>
          r.id === n.officialNumber &&
          r.noteId === n.id &&
          r.version === n.version,
      )
    )
      throw Error("Reservasi nomor nota hilang.");
  }
  for (const v of tables.noteVersions) {
    ref("notes", v.noteId);
    ref("users", v.userId);
    noteContentRefs(v.content, v.noteId);
  }
  for (const r of tables.noteReviews) {
    ref("notes", r.noteId);
    ref("users", r.userId);
    if (
      !tables.noteVersions.some(
        (v) => v.noteId === r.noteId && v.version === r.version,
      )
    )
      throw Error("Versi catatan pemeriksaan nota hilang.");
  }
  for (const p of tables.noteProfiles) ref("units", p.unitId);
  for (const r of tables.noteNumbers) {
    ref("notes", r.noteId);
    if (
      !tables.noteVersions.some(
        (v) =>
          v.noteId === r.noteId &&
          v.version === r.version &&
          v.officialNumber === r.id,
      )
    )
      throw Error("Snapshot nomor nota hilang.");
    if (
      tables.outgoing.some(
        (o) =>
          o.number === r.id &&
          (o.noteId !== r.noteId || o.noteVersion !== r.version),
      )
    )
      throw Error("Konflik nomor nota dengan surat keluar lain.");
  }
  for (const o of tables.outgoing)
    if (o.noteId) {
      const v = tables.noteVersions.find(
        (v) =>
          v.noteId === o.noteId &&
          v.version === o.noteVersion &&
          v.officialNumber === o.number,
      );
      if (!v) throw Error("Sumber/versi surat keluar nota hilang.");
    }
  for (const m of tables.minutes) {
    ref("events", m.agendaId as string | undefined);
    ref("letters", m.letterId as string | undefined);
    for (const d of m.decisions) {
      ref("users", d.userId);
      ref("units", d.unitId);
      ref("tasks", d.taskId);
    }
    for (const aid of m.attachmentIds)
      if (!files.has(aid) || owners.get(aid) !== m.id)
        throw Error("Lampiran notulen hilang.");
  }
  for (const c of tables.caseFiles) for (const l of c.links) ref(l.kind, l.id);
  for (const page of tables.searchPages)
    if (!files.has(page.attachmentId))
      throw Error("Sumber indeks PDF tidak ditemukan.");
  for (const p of tables.progress) ref("tasks", p.taskId);
  for (const row of [
    ...tables.activities,
    ...tables.comments,
    ...tables.notifications,
  ]) {
    ref("letters", row.letterId);
    ref("minutes", row.minutesId as string | undefined);
    ref("tasks", row.taskId as string | undefined);
    ref("dispositions", row.dispositionId as string | undefined);
    ref("users", row.userId as string | undefined);
    if (
      row.dispositionVersion &&
      row.dispositionId &&
      !tables.dispositionVersions.some(
        (v) =>
          v.dispositionId === row.dispositionId &&
          v.version === row.dispositionVersion,
      )
    )
      throw Error("Versi tindakan disposisi hilang.");
  }
  for (const e of tables.events) {
    ref("dispositions", e.dispositionId as string | undefined);
    ref("tasks", e.taskId as string | undefined);
    ref("letters", e.letterId as string | undefined);
    ref("users", e.userId as string | undefined);
    ref("users", e.invitedUserId as string | undefined);
    ref("users", e.representativeId as string | undefined);
    for (const uid of (e.participants as string[] | undefined) || [])
      ref("users", uid);
  }
  for (const u of tables.units) {
    ref("units", u.parentId);
    ref("users", u.userId);
  }
  for (const u of tables.users) ref("units", u.unitId);
  for (const p of tables.positions) {
    ref("units", p.unitId);
    ref("users", p.userId as string | undefined);
  }
  for (const rows of [tables.tasks, tables.units, tables.dispositions]) {
    const map = new Map(rows.map((r) => [r.id, r]));
    for (const row of rows) {
      const seen = new Set([row.id]);
      let parent = row.parentId as string | undefined;
      while (parent) {
        if (seen.has(parent)) throw Error("Hierarki siklik dalam cadangan.");
        seen.add(parent);
        parent = map.get(parent)?.parentId as string | undefined;
      }
    }
  }
}
export async function validateFullBackup(
  blob: Blob,
): Promise<ValidatedPackage> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const names = inspectZip(bytes);
  const entries = unzipSync(bytes);
  if (!entries["manifest.json"] || !entries["metadata.json"])
    throw Error("Manifest atau metadata tidak ditemukan.");
  const manifest = manifestSchema.parse(
    JSON.parse(strFromU8(entries["manifest.json"])),
  );
  if (
    entries["metadata.json"].length !== manifest.metadata.bytes ||
    (await checksum(entries["metadata.json"])) !== manifest.metadata.sha256
  )
    throw Error("Checksum metadata tidak cocok.");
  const raw = JSON.parse(strFromU8(entries["metadata.json"]));
  if (manifest.schemaVersion === 2)
    for (const name of Object.keys(stage3Schemas)) raw.tables[name] ??= [];
  if (manifest.schemaVersion < 4)
    for (const name of Object.keys(notaSchemas)) raw.tables[name] ??= [];
  if (manifest.schemaVersion < 5)
    for (const name of Object.keys(dispositionSchemas)) raw.tables[name] ??= [];
  const tables = backupSchema.parse(raw).tables;
  for (const name of metadataTables)
    if (
      (manifest.counts[name] ??
        ((manifest.schemaVersion === 2 && name in stage3Schemas) ||
        (manifest.schemaVersion < 4 && name in notaSchemas) ||
        (manifest.schemaVersion < 5 && name in dispositionSchemas)
          ? 0
          : undefined)) !== tables[name].length
    )
      throw Error(`Jumlah ${name} tidak cocok dengan manifest.`);
  if (
    new Set(manifest.files.map((f) => f.id)).size !== manifest.files.length ||
    new Set(manifest.files.map((f) => f.path)).size !== manifest.files.length
  )
    throw Error("ID atau path lampiran ganda.");
  if (names.size !== manifest.files.length + 2)
    throw Error("Jumlah berkas ZIP tidak cocok dengan manifest.");
  const attachments = [];
  for (const f of manifest.files) {
    const bytes = entries[f.path];
    if (
      !bytes ||
      bytes.length !== f.bytes ||
      (await checksum(bytes)) !== f.sha256
    )
      throw Error(`Checksum atau ukuran lampiran tidak cocok: ${f.name}`);
    attachments.push({
      id: f.id,
      letterId: f.letterId,
      name: f.name,
      type: f.type,
      blob: new Blob([Uint8Array.from(bytes)], { type: f.type }),
    });
  }
  validateReferences(tables, attachments);
  return { manifest, tables, attachments };
}
export async function findConflicts(pkg: ValidatedPackage) {
  const snapshot: Record<string, string | undefined> = {};
  const conflicts: { table: string; id: string; label: string }[] = [];
  for (const name of metadataTables) {
    for (const row of pkg.tables[name]) {
      const local = await db.table(name).get(row.id);
      snapshot[`${name}:${row.id}`] = local ? JSON.stringify(local) : undefined;
      if (local && JSON.stringify(local) !== JSON.stringify(row))
        conflicts.push({
          table: name,
          id: row.id,
          label: String(
            "subject" in row ? row.subject : "name" in row ? row.name : row.id,
          ),
        });
    }
  }
  for (const a of pkg.attachments) {
    const local = await db.attachments.get(a.id);
    snapshot[`attachments:${a.id}`] = local
      ? JSON.stringify([
          local.name,
          local.type,
          local.letterId,
          await checksum(new Uint8Array(await local.blob.arrayBuffer())),
        ])
      : undefined;
    if (
      local &&
      (local.name !== a.name ||
        (await checksum(new Uint8Array(await local.blob.arrayBuffer()))) !==
          (await checksum(new Uint8Array(await a.blob.arrayBuffer()))))
    )
      conflicts.push({ table: "attachments", id: a.id, label: a.name });
  }
  if (
    pkg.preview &&
    Object.keys(snapshot).some((key) => snapshot[key] !== pkg.preview![key])
  )
    throw Error(
      "Data lokal berubah setelah ringkasan dibuka. Pilih ulang paket untuk meninjau konflik terbaru.",
    );
  pkg.preview = snapshot;
  return conflicts;
}
export async function restoreFullBackup(
  pkg: ValidatedPackage,
  mode: "merge" | "replace",
  choices: Record<string, "local" | "import">,
) {
  let restored = 0,
    skipped = 0;
  const conflicts = await findConflicts(pkg);
  for (const c of conflicts)
    if (mode === "merge" && !choices[`${c.table}:${c.id}`])
      throw Error("Pilih penyelesaian untuk setiap konflik.");
  await db.transaction("rw", db.tables, async () => {
    // The write transaction also protects the automatic snapshot from other tabs.
    for (const name of metadataTables)
      for (const row of pkg.tables[name]) {
        const local = await db.table(name).get(row.id);
        if (
          (local ? JSON.stringify(local) : undefined) !==
          pkg.preview?.[`${name}:${row.id}`]
        )
          throw Error(
            "Data berubah di tab lain. Tinjau ulang paket sebelum melanjutkan.",
          );
      }
    for (const a of pkg.attachments) {
      const local = await db.attachments.get(a.id);
      const signature = local
        ? JSON.stringify([
            local.name,
            local.type,
            local.letterId,
            await Dexie.waitFor(
              (async () =>
                checksum(new Uint8Array(await local.blob.arrayBuffer())))(),
            ),
          ])
        : undefined;
      if (signature !== pkg.preview?.[`attachments:${a.id}`])
        throw Error("Lampiran berubah di tab lain. Tinjau ulang paket.");
    }
    const recovery =
      mode === "replace" ? await Dexie.waitFor(createFullBackup()) : undefined;
    const final: Record<string, unknown[]> = {};
    for (const name of metadataTables) {
      const existing = mode === "replace" ? [] : await db.table(name).toArray();
      const map = new Map(existing.map((r) => [r.id, r]));
      for (const row of pkg.tables[name]) {
        if (
          mode === "merge" &&
          map.has(row.id) &&
          choices[`${name}:${row.id}`] !== "import"
        ) {
          skipped++;
          continue;
        }
        map.set(row.id, row);
        restored++;
      }
      final[name] = [...map.values()];
    }
    const localAttachments =
      mode === "replace" ? [] : await db.attachments.toArray();
    const attachments = new Map(localAttachments.map((a) => [a.id, a]));
    for (const a of pkg.attachments) {
      if (
        mode === "merge" &&
        attachments.has(a.id) &&
        choices[`attachments:${a.id}`] !== "import"
      ) {
        skipped++;
        continue;
      }
      attachments.set(a.id, a);
      restored++;
    }
    const validated = backupSchema.parse({ version: 1, tables: final }).tables;
    validateReferences(validated, [...attachments.values()]);
    if (recovery)
      await db.recovery.add({
        id: id(),
        createdAt: now(),
        blob: recovery,
        name: "cadangan-sebelum-penggantian.zip",
      });
    if (mode === "replace")
      for (const name of [...metadataTables, "attachments"])
        await db.table(name).clear();
    for (const name of metadataTables)
      await db.table(name).bulkPut(validated[name]);
    await db.attachments.bulkPut([...attachments.values()]);
  });
  return { restored, skipped, conflicts: conflicts.length };
}
