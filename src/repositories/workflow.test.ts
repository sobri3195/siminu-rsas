import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import { db } from "../storage/db";
import { seed, samplePdf } from "../storage/seed";
import { register, issue, taskAction, archive, delegate } from "./workflow";
import { id, now, today } from "../utils";
import type { Disposition, IncomingLetter, CompletionReport } from "../types";
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
});
function letter(): IncomingLetter {
  return {
    id: id(),
    agenda: "1000/SM/2026",
    sender: "Pengirim demo",
    number: "B/1/2026",
    date: today(),
    received: today(),
    subject: "Uji alur administrasi",
    kind: "Surat dinas",
    urgency: "Biasa",
    classification: "Biasa",
    summary: "Uji",
    status: "Terdaftar",
    attachmentIds: [],
    createdAt: now(),
  };
}
function disposition(lid: string): Disposition {
  return {
    id: id(),
    letterId: lid,
    giver: "Kepala Demo",
    recipients: ["a", "b", "c"].map((u, i) => ({
      unitId: u,
      unitName: "Unit " + u,
      userId: "user-" + u,
      kind: i === 2 ? "Tembusan" : "Utama",
      instruction: "Tindak lanjuti",
      deadline: today(),
    })),
    instructions: ["Tindak lanjuti"],
    notes: "",
    deadline: today(),
    review: true,
    createdAt: now(),
  };
}
const report = (taskId: string): CompletionReport => ({
  id: id(),
  taskId,
  action: "Koordinasi",
  date: today(),
  result: "Selesai dilaksanakan",
  obstacles: "",
  next: "",
  attachmentIds: [],
  createdAt: now(),
});
describe("Alur wajib surat sampai arsip", () => {
  it("dua unit wajib, hasil diperiksa, tembusan tidak menghalangi; berkas bertahan setelah buka ulang DB", async () => {
    const l = letter();
    await register(
      l,
      [new File([samplePdf("Uji")], "uji.pdf", { type: "application/pdf" })],
      "Petugas",
    );
    await db.letters.update(l.id, { status: "Menunggu disposisi" });
    const d = disposition(l.id);
    await issue(d, "Kepala");
    const tasks = await db.tasks.where({ letterId: l.id }).toArray();
    expect(tasks).toHaveLength(2);
    await expect(issue(d, "Kepala")).rejects.toThrow("sudah diterbitkan");
    for (const [i, t] of tasks.entries()) {
      await taskAction(t.id, "read", "Unit");
      await taskAction(t.id, "accept", "Unit");
      await taskAction(t.id, "progress", "Unit", "siap");
      expect((await db.tasks.get(t.id))?.status).toBe("Diproses");
      await taskAction(t.id, "submit", "Unit", "", report(t.id));
      expect((await db.letters.get(l.id))?.status).toBe("Dalam tindak lanjut");
      if (i === 0) {
        await taskAction(t.id, "return", "Kepala", "Lengkapi bukti");
        expect((await db.tasks.get(t.id))?.status).toBe("Perlu perbaikan");
        await taskAction(t.id, "submit", "Unit", "", report(t.id));
      }
      await taskAction(t.id, "approve", "Kepala");
      expect((await db.letters.get(l.id))?.status).toBe(
        i === 0 ? "Dalam tindak lanjut" : "Selesai",
      );
    }
    await archive(l.id, "Petugas");
    expect((await db.letters.get(l.id))?.status).toBe("Diarsipkan");
    db.close();
    await db.open();
    const attachment = await db.attachments.get(l.attachmentIds[0]);
    expect(attachment?.blob.size).toBeGreaterThan(100);
    expect((await db.letters.get(l.id))?.status).toBe("Diarsipkan");
  });
  it("mencegah agenda ganda dan pengarsipan dini", async () => {
    const l = letter();
    await register(l, [], "P");
    await expect(register({ ...l, id: id() }, [], "P")).rejects.toThrow(
      "agenda",
    );
    await issue(disposition(l.id), "K");
    await expect(archive(l.id, "P")).rejects.toThrow("kewajiban");
  });
  it("mempertahankan riwayat penerima saat unit dinonaktifkan dan disposisi direvisi", async () => {
    const l = letter();
    await register(l, [], "P");
    const d = disposition(l.id);
    await issue(d, "K");
    await db.units.add({ id: "a", name: "Nama baru", active: false, order: 1 });
    expect((await db.tasks.where({ unitId: "a" }).first())?.unitName).toBe(
      "Unit a",
    );
    await issue(
      { ...disposition(l.id), revisionOf: d.id, reason: "Koreksi tenggat" },
      "K",
    );
    expect((await db.dispositions.get(d.id))?.cancelled).toBe(true);
    expect(await db.tasks.where({ dispositionId: d.id }).count()).toBe(2);
  });
  it("delegasi mempertahankan induk dan mencegah siklus", async () => {
    const l = letter();
    await register(l, [], "P");
    const d = disposition(l.id);
    await issue(d, "K");
    const t = (await db.tasks.where({ unitId: "a" }).first())!;
    await db.units.bulkAdd([
      { id: "child", name: "Bawahan", parentId: "a", active: true, order: 1 },
      { id: "a", name: "Induk", parentId: "child", active: true, order: 0 },
    ]);
    await delegate(t, "child", "Unit");
    const child = (await db.tasks.where({ unitId: "child" }).first())!;
    expect(child.parentId).toBe(t.id);
    await expect(delegate(child, "a", "Unit")).rejects.toThrow("siklus");
    expect((await db.tasks.get(t.id))?.status).toBe("Belum dibaca");
  });
  it("seed hanya saat kosong, minimal data dan PDF valid", async () => {
    await seed();
    expect(await db.letters.count()).toBeGreaterThanOrEqual(30);
    expect(await db.outgoing.count()).toBeGreaterThanOrEqual(10);
    await seed();
    expect(await db.letters.count()).toBe(32);
    const blob = (await db.attachments.toArray())[0].blob;
    expect(await blob.text()).toMatch(/^%PDF-1.4/);
    expect(await blob.text()).toContain("%%EOF");
  });
});
