import type { SearchPage } from "../types";
import { db } from "../storage/db";
import { now } from "../utils";
import { checksum } from "./fullBackup";
export async function indexPDF(attachmentId: string) {
  const file = await db.attachments.get(attachmentId);
  if (!file) throw Error("Berkas tidak ditemukan.");
  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  )
    throw Error("Pilih PDF untuk ekstraksi lokal.");
  try {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    const sourceChecksum = await checksum(bytes);
    const loading = pdfjs.getDocument({
      data: bytes,
      enableXfa: false,
      useWorkerFetch: false,
    });
    try {
      const pdf = await loading.promise;
      if (pdf.numPages > 500)
        throw Error("Batas ekstraksi lokal adalah 500 halaman per berkas.");
      const pages: (SearchPage & { sourceChecksum: string })[] = [];
      for (let page = 1; page <= pdf.numPages; page++) {
        const p = await pdf.getPage(page);
        const content = await p.getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .trim();
        pages.push({
          id: `${attachmentId}:${page}`,
          attachmentId,
          page,
          text,
          status: text ? ("text" as const) : ("scan" as const),
          sourceChecksum,
          indexedAt: now(),
        });
        p.cleanup();
      }
      await db.transaction("rw", [db.searchPages, db.attachments], async () => {
        if (!(await db.attachments.get(attachmentId)))
          throw Error("Sumber lampiran berubah atau dihapus.");
        await db.searchPages.where({ attachmentId }).delete();
        await db.searchPages.bulkPut(pages);
      });
      return {
        pages: pages.length,
        scan: pages.filter((p) => p.status === "scan").length,
      };
    } finally {
      await loading.destroy();
    }
  } catch (e) {
    await db.transaction("rw", [db.searchPages, db.attachments], async () => {
      if (!(await db.attachments.get(attachmentId))) return;
      await db.searchPages.where({ attachmentId }).delete();
      await db.searchPages.put({
        id: `${attachmentId}:0`,
        attachmentId,
        page: 0,
        text: "",
        status: "error",
        message: String(e),
        indexedAt: now(),
      });
    });
    throw e;
  }
}
export interface SearchResult {
  id: string;
  title: string;
  text: string;
  kind: string;
  href: string;
  page?: number;
}
export async function searchLocal(query: string): Promise<SearchResult[]> {
  const q = query.trim().toLocaleLowerCase("id");
  if (q.length < 2) return [];
  const all = await db.transaction("r", db.tables, async () => ({
    letters: await db.letters.toArray(),
    outgoing: await db.outgoing.toArray(),
    drafts: await db.drafts.toArray(),
    notes: await db.notes.toArray(),
    dispositions: await db.dispositions.toArray(),
    reports: await db.reports.toArray(),
    tasks: await db.tasks.toArray(),
    minutes: await db.minutes.toArray(),
    pages: await db.searchPages.toArray(),
    files: await db.attachments.toArray(),
  }));
  const rows: SearchResult[] = [];
  for (const l of all.letters)
    rows.push({
      id: "letter:" + l.id,
      title: l.subject,
      text: [l.agenda, l.number, l.sender, l.summary, l.subject].join(" · "),
      kind: "Surat masuk",
      href: "/surat-masuk/" + l.id,
    });
  for (const l of all.outgoing)
    rows.push({
      id: "out:" + l.id,
      title: l.subject,
      text: [l.number, l.subject, l.recipient].join(" · "),
      kind: "Surat keluar",
      href: "/surat-keluar",
    });
  for (const n of all.notes)
    rows.push({
      id: "note:" + n.id,
      title: n.content.subject,
      text: [
        n.officialNumber,
        n.content.to,
        n.content.from,
        ...n.content.basis,
        n.content.opening,
        n.content.discussion,
        n.content.request,
        n.content.closing,
      ].join(" · "),
      kind: "Nota Dinas",
      href: "/nota-dinas/" + n.id,
    });
  for (const d of all.drafts)
    rows.push({
      id: "draft:" + d.id,
      title: d.content.subject,
      text: Object.values(d.content).join(" · "),
      kind: "Isi naskah",
      href: "/naskah/" + d.id,
    });
  for (const d of all.dispositions)
    rows.push({
      id: "disposition:" + d.id,
      title:
        all.letters.find((l) => l.id === d.letterId)?.subject || "Disposisi",
      text: [
        d.notes,
        ...d.instructions,
        ...d.recipients.map((r) => r.instruction),
      ].join(" · "),
      kind: "Catatan disposisi",
      href: "/surat-masuk/" + d.letterId,
    });
  for (const r of all.reports) {
    const task = all.tasks.find((t) => t.id === r.taskId);
    rows.push({
      id: "report:" + r.id,
      title: task?.instruction || "Laporan hasil",
      text: [r.action, r.result, r.obstacles, r.next].join(" · "),
      kind: "Laporan hasil",
      href: task?.minutesId
        ? "/notulen/" + task.minutesId
        : "/surat-masuk/" + task?.letterId,
    });
  }
  for (const m of all.minutes)
    rows.push({
      id: "minutes:" + m.id,
      title: m.title,
      text: [
        m.title,
        m.participants,
        m.discussion,
        ...m.decisions.map((d) => d.text),
      ].join(" · "),
      kind: "Notulen",
      href: "/notulen/" + m.id,
    });
  for (const p of all.pages.filter((p) => p.status === "text")) {
    const file = all.files.find((f) => f.id === p.attachmentId);
    if (!file) continue;
    const letter = all.letters.find((l) => l.id === file.letterId);
    rows.push({
      id: "pdf:" + p.id,
      title: file.name,
      text: p.text,
      kind: "Isi PDF",
      page: p.page,
      href: letter
        ? "/surat-masuk/" + letter.id
        : all.minutes.some((m) => m.id === file.letterId)
          ? "/notulen/" + file.letterId
          : all.notes.some((n) => n.id === file.letterId)
            ? "/nota-dinas/" + file.letterId
            : all.drafts.some((d) => d.id === file.letterId)
              ? "/naskah/" + file.letterId
              : "/surat-keluar",
    });
  }
  return rows.filter((r) =>
    (r.title + " " + r.text).toLocaleLowerCase("id").includes(q),
  );
}
