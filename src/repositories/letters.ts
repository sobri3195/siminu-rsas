import { assertReplyClosed } from "./mail";
import { z } from "zod";
import { db } from "../storage/db";
import type { IncomingLetter } from "../types";
import { id, now } from "../utils";
type Metadata = Pick<
  IncomingLetter,
  | "sender"
  | "number"
  | "date"
  | "received"
  | "agenda"
  | "subject"
  | "kind"
  | "urgency"
  | "classification"
  | "summary"
  | "institution"
  | "physicalLocation"
>;
export async function correctLetter(
  letterId: string,
  expectedRevision: number,
  patch: Metadata,
  reason: string,
  author: string,
) {
  if (!reason.trim()) throw Error("Alasan koreksi wajib diisi.");
  if (
    !patch.agenda.trim() ||
    !z.iso.date().safeParse(patch.date).success ||
    !z.iso.date().safeParse(patch.received).success
  )
    throw Error("Nomor agenda dan tanggal surat/diterima wajib valid.");
  if (!patch.subject.trim() || !patch.sender.trim() || !patch.number.trim())
    throw Error("Identitas surat wajib lengkap.");
  await db.transaction("rw", [db.letters, db.activities], async () => {
    const old = await db.letters.get(letterId);
    if (!old) throw Error("Surat tidak ditemukan.");
    if ((old.revision || 1) !== expectedRevision)
      throw Error(
        "Konflik edit: tab lain sudah mengubah surat. Input Anda dipertahankan. Muat ulang data sebelum menyimpan kembali.",
      );
    if (
      await db.letters
        .filter(
          (l) =>
            l.id !== letterId &&
            l.agenda === patch.agenda &&
            l.received.slice(0, 4) === patch.received.slice(0, 4) &&
            (l.register || "SM") === (old.register || "SM"),
        )
        .count()
    )
      throw Error("Nomor agenda sudah digunakan pada register dan tahun ini.");
    const after = {
      ...old,
      ...patch,
      year: patch.received.slice(0, 4),
      revision: (old.revision || 1) + 1,
      updatedAt: now(),
    };
    await db.letters.put(after);
    await db.activities.add({
      id: id(),
      letterId,
      text: "Koreksi metadata: " + reason,
      author,
      createdAt: now(),
      before: old,
      after,
    });
  });
}
export async function cancelLetter(
  letterId: string,
  reason: string,
  author: string,
) {
  if (!reason.trim()) throw Error("Alasan penutupan wajib diisi.");
  await db.transaction("rw", db.tables, async () => {
    await assertReplyClosed(letterId);
    const letter = await db.letters.get(letterId);
    if (!letter) throw Error("Surat tidak ditemukan.");
    await db.dispositions
      .where({ letterId })
      .modify({ cancelled: true, reason });
    await db.tasks.where({ letterId }).modify((t) => {
      t.previousStatus = t.status;
      t.status = "Dibatalkan";
    });
    await db.letters.update(letterId, {
      status: "Diarsipkan",
      cancelledReason: reason,
      revision: (letter.revision || 1) + 1,
      updatedAt: now(),
    });
    await db.activities.add({
      id: id(),
      letterId,
      text: "Penutupan administratif beralasan: " + reason,
      author,
      createdAt: now(),
      before: letter,
      after: { status: "Diarsipkan", cancelledReason: reason },
    });
  });
}
export async function toggleFavorite(letterId: string) {
  await db.transaction("rw", db.letters, async () => {
    const l = await db.letters.get(letterId);
    if (l) await db.letters.update(letterId, { favorite: !l.favorite });
  });
}
