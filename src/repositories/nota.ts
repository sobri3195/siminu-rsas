import { db } from "../storage/db";
import { id, now, today } from "../utils";
import { noteContentSchema, notaSchemas } from "./notaSchemas";
import type {
  ServiceNote,
  NoteContent,
  NoteFormat,
  NoteTemplate,
  NoteProfile,
  NoteVersion,
  User,
  Attachment,
} from "../types";

export const defaultNoteFormat: NoteFormat = {
  heading: "RSAU Prof. dr. ABDULRACHMAN SALEH\nINFORMASI TEKNOLOGI",
  font: "Times New Roman",
  fontSize: 12,
  lineSpacing: 1.15,
  paragraphAfter: 6,
  signatureSpace: 22,
  top: 20,
  bottom: 20,
  left: 25,
  right: 20,
  numberPattern: "B/{register}-{seq}/{month}/{year}/{unit}",
  register: "ND",
  unitCode: "IT",
  verified: false,
  source: "",
};
export const blankSigner = () => ({
  title: "",
  name: "",
  rank: "",
  serviceNumber: "",
  city: "Jakarta",
  date: "",
});
export async function ensureNota() {
  await db.transaction(
    "rw",
    [db.noteTemplates, db.noteProfiles, db.units],
    async () => {
      if (!(await db.noteTemplates.count())) {
        const names = [
          "Permohonan pengembangan sistem",
          "Permohonan persetujuan kegiatan",
          "Laporan pelaksanaan kegiatan",
          "Laporan inventarisasi perangkat",
          "Permohonan pemeliharaan",
          "Usulan kerja sama",
          "Nota dinas kosong",
        ];
        await db.noteTemplates.bulkAdd(
          names.map((name, i): NoteTemplate => ({
            id: "nota-template-" + i,
            name,
            instructions:
              i === 6
                ? "Isi identitas, dasar yang benar-benar tersedia, uraian, dan penandatangan."
                : "Ganti seluruh teks dalam [kurung siku]. Cantumkan dasar, biaya, dan hasil hanya jika tersedia dari pengguna.",
            category:
              i === 2 || i === 3
                ? "Laporan"
                : i === 5
                  ? "Usulan"
                  : "Permohonan",
            body: {
              subject: i === 6 ? "" : "[isi perihal] " + name,
              basis: [""],
              opening: i === 6 ? "" : "[isi pembukaan]",
              discussion:
                i === 6 ? "" : "[isi uraian sesuai data yang tersedia]",
              request: i === 6 ? "" : "[isi permohonan atau rekomendasi]",
              closing:
                "Demikian disampaikan, atas perhatian Bapak/Ibu diucapkan terima kasih.",
            },
          })),
        );
      }
      if (!(await db.noteProfiles.count())) {
        const unit = (await db.units.toArray()).find((u) =>
          /SIMRS|\bIT\b/i.test(u.name),
        );
        await db.noteProfiles.add({
          id: "nota-profile-it",
          name: "IT / Kasubinstalyangadar — periksa format",
          unitId: unit?.id || "",
          from: "Kepala IT / Kasubinstalyangadar",
          signer: {
            title: "Kepala IT / Kasubinstalyangadar",
            name: "dr. Muhammad Sobri Maulana",
            rank: "Kapten Kes",
            serviceNumber: "NRP 3222107950555311",
            city: "Jakarta",
            date: "",
          },
          format: defaultNoteFormat,
        });
      }
    },
  );
}
export function emptyNote(unitId: string, profile?: NoteProfile): NoteContent {
  return {
    unitId,
    category: "Permohonan",
    to: "Yth. Kepala RSAU Prof. dr. Abdulrachman Saleh",
    from: profile?.from || "",
    subject: "",
    conceptDate: today(),
    conceptNumber: "",
    urgency: "Biasa",
    classification: "Biasa",
    basis: [""],
    opening: "",
    discussion: "",
    request: "",
    closing: "",
    copies: "",
    signer: profile ? { ...profile.signer, date: "" } : blankSigner(),
    format: profile
      ? structuredClone(profile.format)
      : {
          ...defaultNoteFormat,
          heading: "RSAU Prof. dr. ABDULRACHMAN SALEH",
          unitCode: "UNIT",
        },
    attachments: [],
    letterId: "",
    dispositionId: "",
    taskId: "",
  };
}
const editable = (n: ServiceNote) =>
  ["Draf", "Perlu perbaikan"].includes(n.status);
async function actor(uid: string) {
  const u = await db.users.get(uid);
  if (!u?.active) throw Error("Pengguna tidak aktif.");
  return u;
}
function author(n: ServiceNote, u: User) {
  if (n.authorId !== u.id && u.role !== "Admin Sistem")
    throw Error("Hanya pembuat atau admin yang dapat mengubah konsep.");
}
async function checked(nid: string, rev: number) {
  const n = await db.notes.get(nid);
  if (!n) throw Error("Nota dinas tidak ditemukan.");
  if (n.revision !== rev)
    throw Error(
      "Konflik revisi: dokumen berubah di tab lain. Simpan salinan isi lalu muat versi terbaru.",
    );
  return n;
}
async function snapshot(n: ServiceNote, uid: string, reason: string) {
  const v: NoteVersion = {
    id: id(),
    noteId: n.id,
    version: n.version,
    status: n.status,
    officialNumber: n.officialNumber,
    content: structuredClone(n.content),
    userId: uid,
    reason,
    createdAt: now(),
  };
  await db.noteVersions.add(v);
}
async function audit(
  n: ServiceNote,
  uid: string,
  action: string,
  note = "",
  section = "Dokumen",
) {
  await db.noteReviews.add({
    id: id(),
    noteId: n.id,
    version: n.version,
    action,
    section,
    note,
    userId: uid,
    createdAt: now(),
  });
}
export async function createNote(
  templateId: string,
  uid: string,
  unitId: string,
  letterId = "",
) {
  return db.transaction("rw", db.tables, async () => {
    await actor(uid);
    if (!(await db.units.get(unitId))) throw Error("Unit tidak ditemukan.");
    const t = await db.noteTemplates.get(templateId);
    if (!t) throw Error("Template tidak ditemukan.");
    const profile = await db.noteProfiles.where({ unitId }).first();
    const content = {
      ...emptyNote(unitId, profile),
      ...structuredClone(t.body),
      category: t.category,
    };
    if (letterId) {
      const l = await db.letters.get(letterId);
      if (!l) throw Error("Surat sumber hilang.");
      content.letterId = l.id;
      content.subject = "Tindak lanjut: " + l.subject;
      content.basis = [
        l.number
          ? "Surat " +
            l.sender +
            " nomor " +
            l.number +
            " tanggal " +
            l.date +
            "."
          : "Surat masuk agenda " + l.agenda + ".",
      ];
    }
    const n: ServiceNote = {
      id: id(),
      content,
      authorId: uid,
      status: "Draf",
      version: 1,
      revision: 1,
      reviewerIds: [],
      reviewIndex: 0,
      officialNumber: "",
      createdAt: now(),
      updatedAt: now(),
    };
    await db.notes.add(n);
    await snapshot(n, uid, "Draf dibuat");
    return n;
  });
}
export function noteChecklist(
  c: NoteContent,
  officialNumber = "",
  stage = "Draf",
) {
  const strings = (v: unknown): string[] =>
    typeof v === "string"
      ? [v]
      : v && typeof v === "object"
        ? Object.values(v).flatMap(strings)
        : [];
  const placeholders = strings(c).some((v) => /\[[^\]\n]+\]/.test(v));
  const mentioned = /\blampiran\b/i.test(
    [c.opening, c.discussion, c.request].join(" "),
  );
  return [
    { label: "Tujuan terisi", ok: !!c.to.trim() },
    { label: "Pengirim terisi", ok: !!c.from.trim() },
    { label: "Perihal jelas", ok: c.subject.trim().length >= 5 },
    {
      label: "Isi tidak kosong",
      ok: !![c.opening, c.discussion, c.request].join("").trim(),
    },
    {
      label: "Penandatangan dipilih (jabatan dan nama)",
      ok: !!c.signer.name.trim() && !!c.signer.title.trim(),
    },
    { label: "Tidak ada placeholder tersisa", ok: !placeholders },
    {
      label: "Lampiran yang disebut tersedia dan berjudul",
      ok:
        (!mentioned || c.attachments.length > 0) &&
        c.attachments.every((a) => !!a.title.trim()),
    },
    {
      label: "Tanggal dan nomor sesuai tahap dokumen",
      ok:
        !!c.conceptDate &&
        (["Bernomor", "Tercatat dikirim"].includes(stage)
          ? !!officialNumber && !!c.signer.date
          : [
                "Draf",
                "Perlu perbaikan",
                "Diajukan",
                "Dalam pemeriksaan",
                "Disetujui",
              ].includes(stage)
            ? !officialNumber
            : true),
    },
  ];
}
async function references(c: NoteContent, nid: string) {
  if (!(await db.units.get(c.unitId)))
    throw Error("Unit pembuat tidak ditemukan.");
  const l = c.letterId ? await db.letters.get(c.letterId) : undefined;
  const d = c.dispositionId
    ? await db.dispositions.get(c.dispositionId)
    : undefined;
  const t = c.taskId ? await db.tasks.get(c.taskId) : undefined;
  if ((c.letterId && !l) || (c.dispositionId && !d) || (c.taskId && !t))
    throw Error("Sumber hubungan tidak ditemukan.");
  if (d && c.letterId && d.letterId !== c.letterId)
    throw Error("Disposisi bukan milik surat yang dipilih.");
  if (t && c.dispositionId && t.dispositionId !== c.dispositionId)
    throw Error("Tugas bukan milik disposisi yang dipilih.");
  if (t && c.letterId && t.letterId !== c.letterId)
    throw Error("Tugas bukan milik surat yang dipilih.");
  if (new Set(c.attachments.map((a) => a.id)).size !== c.attachments.length)
    throw Error("Lampiran ganda.");
  for (const a of c.attachments) {
    const f = await db.attachments.get(a.id);
    if (!f || f.letterId !== nid)
      throw Error("Lampiran hilang atau pemilik tidak sesuai.");
    if (a.inline && !/^image\/(png|jpeg)$/.test(f.type))
      throw Error("Hanya JPG/PNG dapat dimasukkan ke halaman lanjutan.");
  }
}
export async function saveNote(
  nid: string,
  rev: number,
  content: NoteContent,
  uid: string,
  files: Attachment[] = [],
  reason = "Simpan otomatis",
) {
  const c = noteContentSchema.parse(content);
  return db.transaction("rw", db.tables, async () => {
    const n = await checked(nid, rev);
    author(n, await actor(uid));
    if (!editable(n))
      throw Error("Dokumen terkunci. Buat revisi untuk mengubah isi.");
    for (const f of files) {
      if (f.letterId !== nid || (await db.attachments.get(f.id)))
        throw Error("ID lampiran tidak valid.");
      if (
        f.blob.size > 15 * 1024 * 1024 ||
        ![
          "application/pdf",
          "image/png",
          "image/jpeg",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ].includes(f.type)
      )
        throw Error(
          "Format lampiran tidak didukung atau berkas melebihi 15 MB.",
        );
      await db.attachments.add(f);
    }
    await references(c, nid);
    if (
      JSON.stringify(c) === JSON.stringify(n.content) &&
      !reason.startsWith("Dipulihkan:")
    )
      return n;
    n.content = c;
    n.version++;
    n.revision++;
    n.updatedAt = now();
    await db.notes.put(n);
    await snapshot(n, uid, reason);
    return n;
  });
}
export type NoteAction =
  | "submit"
  | "begin"
  | "comment"
  | "return"
  | "review"
  | "approve"
  | "revise"
  | "number"
  | "register"
  | "send"
  | "archive"
  | "cancel";
export async function noteAction(
  nid: string,
  rev: number,
  action: NoteAction,
  uid: string,
  opts: {
    note?: string;
    section?: string;
    reviewers?: string[];
    date?: string;
    channel?: string;
  } = {},
) {
  return db.transaction("rw", db.tables, async () => {
    const n = await checked(nid, rev),
      u = await actor(uid),
      memo = opts.note?.trim() || "";
    const admin = u.role === "Admin Sistem",
      reviewer = n.reviewerIds[n.reviewIndex] === uid;
    const approver = admin || u.role === "Kepala RSAU";
    const registrar = admin || u.role === "Petugas Urtu/Administrasi";
    let label = "";
    if (action === "submit") {
      author(n, u);
      if (!editable(n)) throw Error("Tahap tidak dapat diajukan.");
      const errors = noteChecklist(n.content, n.officialNumber).filter(
        (x) => !x.ok,
      );
      if (errors.length) throw Error(errors.map((x) => x.label).join("; "));
      await references(n.content, n.id);
      const ids = opts.reviewers || [];
      if (!ids.length || new Set(ids).size !== ids.length)
        throw Error("Pilih pemeriksa yang berbeda dalam urutan pemeriksaan.");
      for (const rid of ids) {
        const r = await actor(rid);
        if (
          r.unitId !== n.content.unitId &&
          !["Admin Sistem", "Kepala RSAU"].includes(r.role)
        )
          throw Error("Pemeriksa harus dari unit pembuat atau pimpinan/admin.");
      }
      n.reviewerIds = ids;
      n.reviewIndex = 0;
      n.status = "Diajukan";
      label = "Diajukan";
    } else if (["begin", "comment", "return", "review"].includes(action)) {
      if (
        !["Diajukan", "Dalam pemeriksaan"].includes(n.status) ||
        (!admin &&
          !reviewer &&
          !(
            ["return", "comment"].includes(action) &&
            approver &&
            n.reviewIndex === n.reviewerIds.length
          ))
      )
        throw Error("Tindakan hanya untuk pemeriksa aktif.");
      if (action === "begin") {
        n.status = "Dalam pemeriksaan";
        label = "Pemeriksaan dimulai";
      }
      if (action === "comment") {
        if (!memo) throw Error("Catatan wajib diisi.");
        label = "Catatan pemeriksaan";
      }
      if (action === "return") {
        if (!memo) throw Error("Alasan perbaikan wajib diisi.");
        n.status = "Perlu perbaikan";
        label = "Dikembalikan";
      }
      if (action === "review") {
        if (n.reviewIndex >= n.reviewerIds.length)
          throw Error("Seluruh pemeriksaan telah selesai.");
        n.reviewIndex++;
        n.status = "Dalam pemeriksaan";
        label = "Pemeriksaan selesai";
      }
    } else if (action === "approve") {
      if (
        !approver ||
        n.status !== "Dalam pemeriksaan" ||
        n.reviewIndex < n.reviewerIds.length
      )
        throw Error(
          "Selesaikan seluruh pemeriksaan; persetujuan hanya oleh Kepala RSAU atau admin.",
        );
      n.status = "Disetujui";
      n.approvedVersion = n.version;
      label = "Disetujui (simulasi)";
    } else if (action === "revise") {
      author(n, u);
      if (
        ![
          "Disetujui",
          "Bernomor",
          "Tercatat dikirim",
          "Dalam pemeriksaan",
          "Diajukan",
        ].includes(n.status)
      )
        throw Error("Tahap tidak dapat dibuat revisi.");
      if (!memo) throw Error("Alasan revisi wajib diisi.");
      await audit(
        n,
        uid,
        "Persetujuan/pemeriksaan lama tidak berlaku untuk revisi",
        memo,
      );
      n.status = "Draf";
      n.version++;
      n.approvedVersion = undefined;
      n.officialNumber = "";
      n.outgoingId = undefined;
      n.sentAt = undefined;
      n.sentVia = undefined;
      n.reviewIndex = 0;
      n.reviewerIds = [];
      n.content.signer.date = "";
      label = "Revisi baru";
    } else if (action === "number") {
      if (
        !registrar ||
        n.status !== "Disetujui" ||
        n.approvedVersion !== n.version
      )
        throw Error(
          "Penomoran hanya oleh petugas setelah versi ini disetujui.",
        );
      if (!opts.date)
        throw Error("Tanggal penandatanganan wajib dikonfirmasi petugas.");
      // Signing date is approved content: require it before submission rather than changing approved content.
      if (opts.date !== n.content.signer.date)
        throw Error(
          "Tanggal harus sesuai isi yang disetujui. Buat revisi jika perlu mengubah tanggal.",
        );
      const year = opts.date.slice(0, 4),
        month = Number(opts.date.slice(5, 7)),
        f = n.content.format;
      const key = "nota:" + f.register + ":" + f.unitCode + ":" + year;
      let seq = (await db.sequences.get(key))?.value || 0,
        number = "";
      const romans = [
        "I",
        "II",
        "III",
        "IV",
        "V",
        "VI",
        "VII",
        "VIII",
        "IX",
        "X",
        "XI",
        "XII",
      ];
      const used = new Set([
        ...(await db.noteNumbers.toArray()).map((x) => x.id),
        ...(await db.outgoing.toArray()).map((x) => x.number),
      ]);
      do {
        seq++;
        number = f.numberPattern
          .replaceAll("{seq}", String(seq).padStart(4, "0"))
          .replaceAll("{month}", romans[month - 1])
          .replaceAll("{year}", year)
          .replaceAll("{unit}", f.unitCode)
          .replaceAll("{register}", f.register);
      } while (used.has(number));
      await db.sequences.put({ id: key, value: seq });
      await db.noteNumbers.add({
        id: number,
        noteId: n.id,
        version: n.version,
        createdAt: now(),
      });
      n.officialNumber = number;
      n.status = "Bernomor";
      label = "Diberi nomor";
    } else if (action === "register") {
      if (
        !registrar ||
        !["Bernomor", "Tercatat dikirim", "Diarsipkan"].includes(n.status) ||
        !n.officialNumber
      )
        throw Error("Pendaftaran memerlukan nomor resmi dan petugas.");
      const oid = "nota-out:" + n.id + ":" + n.version;
      const existing = await db.outgoing.get(oid);
      if (existing) {
        if (existing.noteId !== n.id || existing.noteVersion !== n.version)
          throw Error("Konflik ID surat keluar.");
        return n;
      }
      if (
        (await db.outgoing.toArray()).some((o) => o.number === n.officialNumber)
      )
        throw Error("Konflik nomor dengan surat keluar lain.");
      await db.outgoing.add({
        id: oid,
        noteId: n.id,
        noteVersion: n.version,
        subject: n.content.subject,
        recipient: n.content.to,
        number: n.officialNumber,
        status: "Bernomor",
        documentDate: n.content.signer.date,
        unitId: n.content.unitId,
        kind: "Nota Dinas",
        incomingId: n.content.letterId || undefined,
        attachmentIds: n.content.attachments.map((a) => a.id),
        createdAt: now(),
        revision: 1,
      });
      n.outgoingId = oid;
      label = "Didaftarkan ke Surat Keluar";
    } else if (action === "send") {
      if (!registrar || n.status !== "Bernomor" || !n.outgoingId)
        throw Error("Daftarkan nota bernomor ke Surat Keluar terlebih dahulu.");
      if (!memo || !opts.channel?.trim())
        throw Error("Isi catatan dan saluran pengiriman manual.");
      n.status = "Tercatat dikirim";
      n.sentAt = now();
      n.sentVia = opts.channel;
      await db.outgoing.update(n.outgoingId, {
        status: "Terkirim",
        sentAt: n.sentAt,
        sentTo: opts.channel,
      });
      label = "Pengiriman manual dicatat";
    } else if (action === "archive") {
      author(n, u);
      if (!["Bernomor", "Tercatat dikirim", "Dibatalkan"].includes(n.status))
        throw Error(
          "Arsipkan setelah bernomor, pengiriman dicatat, atau dibatalkan.",
        );
      if (n.outgoingId)
        await db.outgoing.update(n.outgoingId, { status: "Diarsipkan" });
      n.archiveFrom = n.status;
      n.status = "Diarsipkan";
      label = "Diarsipkan";
    } else if (action === "cancel") {
      author(n, u);
      if (["Diarsipkan", "Dibatalkan"].includes(n.status))
        throw Error("Dokumen sudah ditutup.");
      if (!memo) throw Error("Alasan pembatalan wajib diisi.");
      if (n.outgoingId)
        await db.outgoing.update(n.outgoingId, { status: "Dibatalkan" });
      n.cancelledReason = memo;
      n.status = "Dibatalkan";
      label = "Dibatalkan";
    }
    n.revision++;
    n.updatedAt = now();
    await db.notes.put(n);
    await audit(n, uid, label, memo, opts.section);
    await snapshot(n, uid, label);
    return n;
  });
}
export async function restoreNote(
  nid: string,
  rev: number,
  vid: string,
  uid: string,
  reason: string,
) {
  if (!reason.trim()) throw Error("Alasan pemulihan wajib diisi.");
  return db.transaction("rw", db.tables, async () => {
    const old = await db.noteVersions.get(vid);
    if (old?.noteId !== nid) throw Error("Versi sumber tidak cocok.");
    const n = await checked(nid, rev);
    if (!editable(n))
      throw Error("Buat revisi sebelum memulihkan dokumen terkunci.");
    const content = structuredClone(old.content);
    content.signer.date = "";
    content.conceptNumber = "";
    return saveNote(nid, rev, content, uid, [], "Dipulihkan: " + reason);
  });
}
export async function duplicateNote(nid: string, uid: string) {
  return db.transaction("rw", db.tables, async () => {
    const source = await db.notes.get(nid);
    if (!source) throw Error("Nota sumber tidak ditemukan.");
    await actor(uid);
    const n: ServiceNote = {
      ...structuredClone(source),
      id: id(),
      authorId: uid,
      status: "Draf",
      version: 1,
      revision: 1,
      reviewerIds: [],
      reviewIndex: 0,
      approvedVersion: undefined,
      officialNumber: "",
      outgoingId: undefined,
      sentAt: undefined,
      sentVia: undefined,
      cancelledReason: undefined,
      archiveFrom: undefined,
      createdAt: now(),
      updatedAt: now(),
    };
    n.content.conceptNumber = "";
    n.content.signer.date = "";
    for (const a of n.content.attachments) {
      const f = await db.attachments.get(a.id);
      if (!f) throw Error("Lampiran sumber hilang.");
      a.id = id();
      await db.attachments.add({ ...f, id: a.id, letterId: n.id });
    }
    await db.notes.add(n);
    await snapshot(n, uid, "Duplikat dari " + nid);
    return n;
  });
}
export function templateContent(c: NoteContent, t: NoteTemplate): NoteContent {
  return {
    ...structuredClone(c),
    ...structuredClone(t.body),
    category: t.category,
  };
}
export async function saveNoteTemplate(t: NoteTemplate, uid: string) {
  if ((await actor(uid)).role !== "Admin Sistem")
    throw Error("Hanya admin dapat mengubah template.");
  await db.noteTemplates.put(notaSchemas.noteTemplates.parse(t));
}
export async function saveNoteProfile(p: NoteProfile, uid: string) {
  if ((await actor(uid)).role !== "Admin Sistem")
    throw Error("Hanya admin dapat mengubah profil.");
  const profile = notaSchemas.noteProfiles.parse(p);
  await db.transaction("rw", [db.noteProfiles, db.units], async () => {
    if (profile.unitId && !(await db.units.get(profile.unitId)))
      throw Error("Unit profil tidak ditemukan.");
    if (
      profile.unitId &&
      (await db.noteProfiles.where({ unitId: profile.unitId }).toArray()).some(
        (r) => r.id !== profile.id,
      )
    )
      throw Error(
        "Unit sudah memiliki profil; ubah profil yang tersedia atau lepaskan unit dari profil lama.",
      );
    await db.noteProfiles.put(profile);
  });
}
