import { checkDraftForSubmission, issueMailNumber } from "./mail";
import { db } from "../storage/db";
import type {
  DraftContent,
  DraftKind,
  OfficialDraft,
  DraftDecision,
} from "../types";
import { draftKinds } from "../types";
import { id, now, today } from "../utils";
import { z } from "zod";
export const contentSchema = z.object({
  conceptNumber: z.string().optional(),
  address: z.string().optional(),
  opening: z.string().optional(),
  referenceText: z.string().optional(),
  attachmentCount: z.string().optional(),
  font: z.enum(["Times New Roman", "Arial"]).optional(),
  margin: z.enum(["20", "25", "30"]).optional(),
  heading: z.string(),
  number: z.string(),
  date: z.iso.date(),
  to: z.string(),
  from: z.string(),
  subject: z.string().min(3, "Perihal minimal 3 karakter."),
  basis: z.string(),
  body: z.string(),
  closing: z.string(),
  copies: z.string(),
  signer: z.string(),
});
export const emptyContent = (): DraftContent => ({
  heading: "RSAU Prof. dr. Abdulrachman Saleh",
  number: "",
  date: today(),
  to: "",
  from: "",
  subject: "Naskah baru",
  basis: "",
  body: "",
  closing: "",
  copies: "",
  signer: "",
});
export async function ensureTemplates() {
  await db.transaction("rw", [db.templates, db.settings], async () => {
    const existing = new Set((await db.templates.toArray()).map((t) => t.kind));
    const settings = await db.settings.get("main");
    await db.templates.bulkPut(
      (
        await Promise.all(
          draftKinds.map(async (kind, i) => ({
            id: `template-${i}`,
            name: `${kind} — generik (bukan format resmi)`,
            kind,
            official: false,
            content: {
              ...emptyContent(),
              heading: settings?.hospital || emptyContent().heading,
              signer: [settings?.official, settings?.rank, settings?.nrp]
                .filter(Boolean)
                .join(" · "),
              subject: kind,
              body:
                kind === "Template kosong"
                  ? ""
                  : "[Isi naskah disusun oleh pengguna.]",
            },
            updatedAt: now(),
          })),
        )
      ).filter((t) => !existing.has(t.kind)),
    );
  });
}
async function decision(
  d: OfficialDraft,
  action: DraftDecision["action"],
  userId: string,
  note: string,
) {
  await db.draftDecisions.add({
    id: id(),
    draftId: d.id,
    version: d.version,
    action,
    userId,
    note,
    createdAt: now(),
    snapshot: {
      content: d.content,
      attachmentIds: d.attachmentIds,
      incomingIds: d.incomingIds || [],
      stage: d.stage,
    },
  });
}
export async function createDraft(
  templateId: string,
  userId: string,
  unitId: string,
  integrated = false,
) {
  return db.transaction(
    "rw",
    [db.templates, db.drafts, db.draftVersions],
    async () => {
      const template = await db.templates.get(templateId);
      if (!template) throw Error("Template tidak ditemukan.");
      const d: OfficialDraft = {
        id: id(),
        integrated,
        incomingIds: [],
        templateId,
        templateOfficial: template.official,
        templateName: template.name,
        templateUpdatedAt: template.updatedAt,
        kind: template.kind,
        content: { ...template.content, date: today(), number: "" },
        unitId,
        authorId: userId,
        reviewerIds: [],
        reviewIndex: 0,
        version: 1,
        revision: 1,
        stage: "Draf",
        attachmentIds: [],
        createdAt: now(),
        updatedAt: now(),
      };
      await db.drafts.add(d);
      await db.draftVersions.add({
        id: id(),
        draftId: d.id,
        version: 1,
        content: d.content,
        authorId: userId,
        reason: "Pembuatan draf",
        createdAt: now(),
      });
      return d;
    },
  );
}
export async function saveDraft(
  draftId: string,
  expected: number,
  content: DraftContent,
  userId: string,
  reason = "Simpan draf otomatis",
) {
  const valid = contentSchema.parse(content);
  return db.transaction(
    "rw",
    [db.drafts, db.draftVersions, db.draftDecisions, db.outgoing],
    async () => {
      const old = await db.drafts.get(draftId);
      if (!old) throw Error("Naskah tidak ditemukan.");
      if (old.revision !== expected)
        throw Error(
          "Konflik revisi: naskah berubah di tab lain. Input dipertahankan; muat versi terbaru sebelum melanjutkan.",
        );
      if (
        old.integrated &&
        ["Pengiriman", "Tercatat dikirim", "Diarsipkan"].includes(old.stage)
      )
        throw Error(
          "Surat terbit dikunci. Buat revisi beralasan terlebih dahulu.",
        );
      if (
        JSON.stringify(old.content) === JSON.stringify(valid) &&
        !reason.startsWith("Pemulihan")
      )
        return old;
      const next: OfficialDraft = {
        ...old,
        content: { ...valid, number: "" },
        version: old.version + 1,
        revision: old.revision + 1,
        stage: old.stage === "Perbaikan" ? "Perbaikan" : "Draf",
        reviewingVersion: undefined,
        approvedVersion: undefined,
        reviewIndex: 0,
        updatedAt: now(),
      };
      if (old.approvedVersion) {
        await decision(
          old,
          "Persetujuan tidak berlaku",
          userId,
          `Isi berubah; persetujuan versi ${old.approvedVersion} tidak berlaku untuk versi ${next.version}.`,
        );
        next.outgoingId = undefined; // Keep previously numbered/sent records as history.
      }
      await db.drafts.put(next);
      await db.draftVersions.add({
        id: id(),
        draftId,
        version: next.version,
        content: next.content,
        attachmentIds: next.attachmentIds,
        incomingIds: next.incomingIds,
        stage: next.stage,
        authorId: userId,
        reason,
        createdAt: now(),
      });
      return next;
    },
  );
}
export async function draftAction(
  draftId: string,
  expected: number,
  action: "submit" | "return" | "review" | "approve" | "number",
  userId: string,
  note = "",
  reviewerIds: string[] = [],
) {
  return db.transaction("rw", db.tables, async () => {
    const d = await db.drafts.get(draftId);
    const user = await db.users.get(userId);
    if (!d || !user?.active)
      throw Error("Naskah atau pengguna aktif tidak tersedia.");
    if (d.revision !== expected)
      throw Error("Versi sudah berubah. Tinjau ulang sebelum keputusan.");
    const admin = user.role === "Admin Sistem";
    let event: DraftDecision["action"];
    if (action === "submit") {
      if (d.integrated) await checkDraftForSubmission(d);
      if (
        !["Draf", "Perbaikan"].includes(d.stage) ||
        !d.content.body.trim() ||
        !d.content.to.trim()
      )
        throw Error("Isi dan tujuan wajib lengkap sebelum diajukan.");
      if (
        !reviewerIds.length ||
        new Set(reviewerIds).size !== reviewerIds.length
      )
        throw Error("Pilih pemeriksa berurutan tanpa duplikat.");
      for (const uid of reviewerIds) {
        const reviewer = await db.users.get(uid);
        if (
          !reviewer?.active ||
          (reviewer.unitId !== d.unitId &&
            !["Admin Sistem", "Kepala RSAU"].includes(reviewer.role))
        )
          throw Error("Pemeriksa harus aktif dan sesuai unit naskah.");
      }
      d.reviewerIds = reviewerIds;
      d.reviewIndex = 0;
      d.stage = "Pemeriksaan";
      d.reviewingVersion = d.version;
      event = "Diajukan";
    } else if (action === "review" || action === "return") {
      if (
        !["Pemeriksaan", "Persetujuan"].includes(d.stage) ||
        d.reviewingVersion !== d.version
      )
        throw Error("Versi ini tidak sedang diperiksa.");
      const allowed =
        d.stage === "Pemeriksaan"
          ? d.reviewerIds[d.reviewIndex] === userId
          : user.role === "Kepala RSAU";
      if (!admin && !allowed)
        throw Error("Keputusan hanya untuk pemeriksa yang sedang bertugas.");
      if (action === "return") {
        if (!note.trim()) throw Error("Catatan koreksi wajib diisi.");
        d.stage = "Perbaikan";
        d.approvedVersion = undefined;
        event = "Dikembalikan";
      } else {
        if (d.stage !== "Pemeriksaan")
          throw Error("Tahap paraf pemeriksa sudah selesai.");
        d.reviewIndex++;
        if (d.reviewIndex >= d.reviewerIds.length) d.stage = "Persetujuan";
        event = "Paraf simulasi";
      }
    } else if (action === "approve") {
      if (!admin && user.role !== "Kepala RSAU")
        throw Error("Persetujuan memerlukan peran Kepala RSAU.");
      if (d.stage !== "Persetujuan" || d.reviewingVersion !== d.version)
        throw Error("Periksa versi terkini terlebih dahulu.");
      d.approvedVersion = d.version;
      d.stage = "Penomoran";
      event = "Disetujui simulasi";
    } else {
      if (!admin && user.role !== "Petugas Urtu/Administrasi")
        throw Error("Penomoran memerlukan petugas administrasi.");
      if (d.stage !== "Penomoran" || d.approvedVersion !== d.version)
        throw Error("Penomoran hanya untuk versi yang disetujui.");
      if (d.integrated) {
        await issueMailNumber(d, userId, note);
      } else {
        const key = `outgoing:${d.content.date.slice(0, 4)}`;
        const seq = await db.sequences.get(key);
        let n = (seq?.value || 0) + 1;
        const used = new Set(
          (await db.outgoing.toArray()).map((o) => o.number),
        );
        while (
          used.has(
            `B/${String(n).padStart(4, "0")}/RSAS/${d.content.date.slice(0, 4)}`,
          )
        )
          n++;
        await db.sequences.put({ id: key, value: n });
        d.content = {
          ...d.content,
          number: `B/${String(n).padStart(4, "0")}/RSAS/${d.content.date.slice(0, 4)}`,
        };
        d.stage = "Pengiriman";
        const out = {
          id: d.outgoingId || id(),
          draftId: d.id,
          draftVersion: d.version,
          subject: d.content.subject,
          recipient: d.content.to,
          number: d.content.number,
          status: "Pengiriman",
          kind: d.kind,
          unitId: d.unitId,
          attachmentIds: d.attachmentIds,
          createdAt: now(),
        };
        await db.outgoing.put(out);
        d.outgoingId = out.id;
      }
      event = "Diberi nomor";
    }
    d.revision++;
    d.updatedAt = now();
    await db.drafts.put(d);
    await decision(d, event, userId, note);
    return d;
  });
}
export async function restoreDraftVersion(
  draftId: string,
  version: number,
  expected: number,
  userId: string,
  reason: string,
) {
  if (!reason.trim()) throw Error("Alasan pemulihan wajib diisi.");
  return db.transaction("rw", db.tables, async () => {
    const old = await db.draftVersions.where({ draftId, version }).first();
    if (!old) throw Error("Versi tidak ditemukan.");
    const next = await saveDraft(
      draftId,
      expected,
      old.content,
      userId,
      "Pemulihan versi " + version + ": " + reason,
    );
    if (next.integrated) {
      next.attachmentIds = [...(old.attachmentIds || [])];
      next.incomingIds = [...(old.incomingIds || [])];
      await db.drafts.put(next);
      await db.draftVersions
        .where({ draftId, version: next.version })
        .modify({
          attachmentIds: next.attachmentIds,
          incomingIds: next.incomingIds,
        });
    }
    return next;
  });
}
