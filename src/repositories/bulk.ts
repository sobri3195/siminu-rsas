import { db } from "../storage/db";
import { archive } from "./workflow";
import { linkToCase } from "./cases";
export async function bulkLetters(
  ids: string[],
  action: "label" | "case" | "archive",
  author: string,
  options: { label?: string; caseId?: string },
) {
  const results: {
    id: string;
    status: "Berhasil" | "Gagal";
    reason: string;
  }[] = [];
  for (const letterId of new Set(ids)) {
    try {
      if (action === "archive") await archive(letterId, author);
      else if (action === "case") {
        if (!options.caseId) throw Error("Pilih berkas kegiatan.");
        await linkToCase(options.caseId, [{ kind: "letters", id: letterId }]);
      } else {
        if (!options.label?.trim()) throw Error("Label wajib diisi.");
        await db.transaction("rw", db.letters, async () => {
          const l = await db.letters.get(letterId);
          if (!l) throw Error("Surat tidak ditemukan.");
          await db.letters.update(letterId, {
            labels: [...new Set([...(l.labels || []), options.label!.trim()])],
          });
        });
      }
      results.push({
        id: letterId,
        status: "Berhasil",
        reason:
          action === "archive"
            ? "Kewajiban selesai; surat diarsipkan"
            : action === "case"
              ? "Ditautkan tanpa menyalin dokumen"
              : "Label ditambahkan",
      });
    } catch (e) {
      results.push({
        id: letterId,
        status: "Gagal",
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}
