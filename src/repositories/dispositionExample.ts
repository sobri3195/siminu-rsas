import { db, dataMode } from "../storage/db";
import { samplePdf } from "../storage/seed";
import { register } from "./workflow";
import {
  createDispositionDraft,
  saveDispositionDraft,
} from "./digitalDisposition";
import { today, now } from "../utils";
import type { DigitalRecipient } from "../types";
export async function prepareDispositionExample(uid: string) {
  if (dataMode !== "demo")
    throw Error("Contoh hanya untuk database mode demo.");
  return db.transaction("rw", db.tables, async () => {
    const actor = await db.users.get(uid);
    if (!actor || !["Admin Sistem", "Kepala RSAU"].includes(actor.role))
      throw Error("Pilih peran pimpinan/admin.");
    const existing = await db.dispositionDrafts.get("digital-example-draft");
    if (existing) return existing.id;
    const people = [
      {
        id: "digital-urtu",
        name: "Pejabat URTU (contoh)",
        unitId: "unit-10",
        role: "Kepala Unit" as const,
      },
      {
        id: "digital-pelaksana",
        name: "Pelaksana URTU (contoh)",
        unitId: "unit-10",
        role: "Pelaksana" as const,
      },
      {
        id: "digital-mutu",
        name: "Pejabat Mutu (contoh)",
        unitId: "unit-2",
        role: "Kepala Unit" as const,
      },
    ];
    for (const u of people) {
      if (!(await db.users.get(u.id)))
        await db.users.add({ ...u, active: true });
      if (!(await db.positions.get(u.id)))
        await db.positions.add({
          id: u.id,
          name:
            u.id === "digital-pelaksana"
              ? "Pelaksana URTU"
              : u.id === "digital-urtu"
                ? "KA URTU"
                : "Komite Mutu",
          unitId: u.unitId,
          userId: u.id,
          active: true,
        });
    }
    if (!(await db.letters.get("digital-example-letter")))
      await register(
        {
          id: "digital-example-letter",
          agenda: "",
          sender: "Tim administrasi (contoh)",
          number: "CONTOH/DD/2026",
          date: today(),
          received: today(),
          subject: "CONTOH — Koordinasi perbaikan administrasi digital",
          kind: "Surat dinas",
          urgency: "Biasa",
          classification: "Biasa",
          summary:
            "Data fiktif untuk alur URTU, SIMRS, Mutu, dan delegasi pelaksana.",
          status: "Menunggu disposisi",
          attachmentIds: [],
          createdAt: now(),
        },
        [
          new File(
            [samplePdf("Contoh Disposisi Digital RSAS")],
            "contoh-disposisi-digital.pdf",
            { type: "application/pdf" },
          ),
        ],
        actor.name,
        true,
      );
    const draft = await createDispositionDraft(
      "digital-example-letter",
      "user-2",
    );
    const recipients: DigitalRecipient[] = [];
    for (const [i, who] of [
      "digital-urtu",
      "user-3",
      "digital-mutu",
    ].entries()) {
      const u = (await db.users.get(who))!,
        unit = (await db.units.get(u.unitId))!,
        p = (await db.positions
          .filter((p) => p.userId === u.id)
          .filter((p) => p.unitId === unit.id)
          .first())!;
      recipients.push({
        id: "example-recipient-" + i,
        unitId: unit.id,
        unitName: unit.name,
        userId: u.id,
        userName: u.name,
        positionId: p.id,
        positionName: p.name,
        assignmentStart: "",
        assignmentEnd: "",
        kind: i === 0 ? "Utama" : i === 1 ? "Pendukung" : "Tembusan",
        instruction:
          i === 2 ? "Untuk diketahui" : "Pelajari dan laporkan hasilnya.",
        deadline: today(),
      });
    }
    const saved = await saveDispositionDraft(
      draft.id,
      draft.revision,
      {
        ...draft.content,
        recipients,
        reviewerId: "user-2",
        notes:
          "CONTOH: URTU mengonsolidasikan hasil pelaksana; SIMRS melaporkan hasil dan memperbaiki jika dikembalikan.",
        deadline: today(),
      },
      "",
      uid,
    );
    await db.dispositionDrafts.delete(saved.id);
    await db.dispositionDrafts.add({ ...saved, id: "digital-example-draft" });
    return "digital-example-draft";
  });
}
