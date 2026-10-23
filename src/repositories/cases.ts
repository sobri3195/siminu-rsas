import { db } from "../storage/db";
import type { LinkKind } from "../types";
import { now } from "../utils";
export const sourceRoute = (kind: LinkKind, row: Record<string, unknown>) =>
  kind === "dispositions" && row.digital
    ? "/disposisi/" + row.id
    : kind === "notes"
      ? "/nota-dinas/" + row.id
      : kind === "letters"
        ? "/surat-masuk/" + row.id
        : kind === "drafts"
          ? "/naskah/" + row.id
          : kind === "minutes"
            ? "/notulen/" + row.id
            : kind === "events"
              ? "/agenda"
              : kind === "outgoing"
                ? "/surat-keluar"
                : row.minutesId
                  ? "/notulen/" + row.minutesId
                  : row.letterId
                    ? "/surat-masuk/" + row.letterId
                    : "/tugas";
export async function linkToCase(
  caseId: string,
  links: { kind: LinkKind; id: string }[],
) {
  await db.transaction("rw", db.tables, async () => {
    const bundle = await db.caseFiles.get(caseId);
    if (!bundle) throw Error("Berkas kegiatan tidak ditemukan.");
    for (const link of links)
      if (!(await db.table(link.kind).get(link.id)))
        throw Error("Sumber hubungan tidak ditemukan.");
    const map = new Map(bundle.links.map((l) => [l.kind + ":" + l.id, l]));
    for (const link of links) map.set(link.kind + ":" + link.id, link);
    await db.caseFiles.update(caseId, {
      links: [...map.values()],
      updatedAt: now(),
    });
  });
}
export async function unlinkFromCase(
  caseId: string,
  kind: LinkKind,
  sourceId: string,
) {
  await db.transaction("rw", db.caseFiles, async () => {
    const bundle = await db.caseFiles.get(caseId);
    if (bundle)
      await db.caseFiles.update(caseId, {
        links: bundle.links.filter((l) => l.kind !== kind || l.id !== sourceId),
        updatedAt: now(),
      });
  });
}
