import Dexie from "dexie";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { z } from "zod";
import { db, type AppDatabase } from "../storage/db";
import { backupSchema, schemas } from "./backup";
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
  schemaVersion: z.literal(2),
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
    schemaVersion: 2,
    appVersion: "2.0.0",
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
    for (const aid of l.attachmentIds)
      if (!files.has(aid) || owners.get(aid) !== l.id)
        throw Error(`Lampiran surat hilang atau pemilik tidak cocok: ${aid}`);
  for (const l of tables.outgoing) {
    ref("letters", l.incomingId as string | undefined);
    for (const aid of (l.attachmentIds as string[] | undefined) || [])
      if (!files.has(aid) || owners.get(aid) !== l.id)
        throw Error(
          `Lampiran surat keluar hilang atau pemilik tidak cocok: ${aid}`,
        );
  }
  for (const a of attachments)
    if (!sets.letters.has(a.letterId) && !sets.outgoing.has(a.letterId))
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
    ref("dispositions", t.dispositionId);
    ref("units", t.unitId);
    ref("users", t.userId);
    ref("tasks", t.parentId as string | undefined);
  }
  for (const r of tables.reports) {
    ref("tasks", r.taskId);
    for (const aid of r.attachmentIds)
      if (!files.has(aid)) throw Error("Bukti hasil hilang.");
  }
  for (const p of tables.progress) ref("tasks", p.taskId);
  for (const row of [
    ...tables.activities,
    ...tables.comments,
    ...tables.notifications,
  ])
    ref("letters", row.letterId);
  for (const e of tables.events) {
    ref("letters", e.letterId as string | undefined);
    ref("users", e.userId as string | undefined);
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
  const tables = backupSchema.parse(
    JSON.parse(strFromU8(entries["metadata.json"])),
  ).tables;
  for (const name of metadataTables)
    if (manifest.counts[name] !== tables[name].length)
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
