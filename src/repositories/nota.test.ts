import "fake-indexeddb/auto";
import { beforeEach, it, expect } from "vitest";
import Dexie from "dexie";
import { db, createDatabase } from "../storage/db";
import { seed } from "../storage/seed";
import {
  ensureNota,
  createNote,
  saveNote,
  noteAction,
  restoreNote,
  duplicateNote,
  noteChecklist,
  saveNoteProfile,
} from "./nota";
import {
  createFullBackup,
  validateFullBackup,
  restoreFullBackup,
  findConflicts,
  validateReferences,
  checksum,
} from "./fullBackup";
import { richBlocks, inlineRuns, noteDocx } from "./notaDocument";
import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
import { notaSchemas } from "./notaSchemas";
import type { ServiceNote } from "../types";
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await seed();
  await ensureNota();
});
async function filled() {
  const n = await createNote("nota-template-6", "user-0", "unit-19");
  return saveNote(
    n.id,
    n.revision,
    {
      ...n.content,
      subject: "Permohonan pengembangan SIMINU RSAS",
      basis: [
        "Catatan kebutuhan tim IT, contoh pengujian.",
        "Surat penugasan contoh dari pengguna.",
      ],
      opening: "Bersama ini disampaikan kebutuhan sistem.",
      discussion:
        "**Pengembangan** administrasi.\n1. Pencatatan.\n2. Pemeriksaan.\n| Modul | Kebutuhan |\n| --- | --- |\n| Nota | Offline |",
      request: "Mohon arahan atas usulan pengembangan.",
      signer: { ...n.content.signer, date: "2026-10-23" },
    },
    "user-0",
  );
}
async function approved(n: ServiceNote) {
  n = await noteAction(n.id, n.revision, "submit", "user-0", {
    reviewers: ["user-3"],
  });
  n = await noteAction(n.id, n.revision, "review", "user-3");
  return noteAction(n.id, n.revision, "approve", "user-2");
}
it("profil IT hanya menjadi nilai awal unit terkait; pengaturan tidak mengubah konsep lama", async () => {
  const a = await createNote("nota-template-6", "user-0", "unit-19"),
    b = await createNote("nota-template-6", "user-0", "unit-10");
  expect(a.content.signer.name).toContain("Sobri");
  expect(b.content.signer.name).toBe("");
  const p = (await db.noteProfiles.toArray())[0];
  await saveNoteProfile(
    { ...p, signer: { ...p.signer, name: "Pejabat baru" } },
    "user-0",
  );
  expect((await db.notes.get(a.id))?.content.signer.name).toContain("Sobri");
});
it("pengajuan diblokir placeholder, pengirim kosong, dan lampiran disebut tetapi hilang", async () => {
  let n = await filled();
  for (const change of [
    { subject: "[isi perihal]" },
    { from: "" },
    { discussion: "Lihat lampiran untuk uraian." },
  ]) {
    n = await saveNote(n.id, n.revision, { ...n.content, ...change }, "user-0");
    expect(noteChecklist(n.content).some((x) => !x.ok)).toBe(true);
    await expect(
      noteAction(n.id, n.revision, "submit", "user-0", {
        reviewers: ["user-3"],
      }),
    ).rejects.toThrow();
  }
});
it("alur dikembalikan/revisi/disetujui mengunci isi; persetujuan lama tidak berlaku pada revisi baru", async () => {
  let n = await filled(),
    v = n.version;
  n = await noteAction(n.id, n.revision, "submit", "user-0", {
    reviewers: ["user-3"],
  });
  await expect(
    noteAction(n.id, n.revision, "approve", "user-2"),
  ).rejects.toThrow(/Selesaikan/);
  n = await noteAction(n.id, n.revision, "comment", "user-3", {
    section: "Uraian",
    note: "Rincikan kebutuhan",
  });
  n = await noteAction(n.id, n.revision, "return", "user-3", {
    note: "Tambahkan rincian",
  });
  n = await saveNote(
    n.id,
    n.revision,
    { ...n.content, discussion: n.content.discussion + "\nRincian tambahan." },
    "user-0",
  );
  n = await approved(n);
  expect(n.approvedVersion).toBe(n.version);
  await expect(
    saveNote(
      n.id,
      n.revision,
      { ...n.content, subject: "Perubahan langsung" },
      "user-0",
    ),
  ).rejects.toThrow(/terkunci/);
  n = await noteAction(n.id, n.revision, "revise", "user-0", {
    note: "Pembaruan kebutuhan",
  });
  expect(n.approvedVersion).toBeUndefined();
  expect(n.status).toBe("Draf");
  expect(n.version).toBeGreaterThan(v);
  expect(await db.noteReviews.where({ noteId: n.id }).count()).toBeGreaterThan(
    5,
  );
  expect(
    (await db.noteVersions.where({ noteId: n.id, version: v }).first())?.content
      .discussion,
  ).not.toContain("tambahan");
});
it("penomoran paralel memberi nomor unik secara transaksional; pembatalan tidak menggunakan ulang nomor", async () => {
  let a = await approved(await filled()),
    b = await approved(await filled());
  const results = await Promise.all([
    noteAction(a.id, a.revision, "number", "user-1", { date: "2026-10-23" }),
    noteAction(b.id, b.revision, "number", "user-1", { date: "2026-10-23" }),
  ]);
  [a, b] = results;
  expect(new Set(results.map((n) => n.officialNumber)).size).toBe(2);
  expect(a.officialNumber).toMatch(/^B\/ND-\d{4}\/X\/2026\/IT$/);
  a = await noteAction(a.id, a.revision, "cancel", "user-0", {
    note: "Kebutuhan dibatalkan",
  });
  const c = await approved(await filled()),
    numbered = await noteAction(c.id, c.revision, "number", "user-1", {
      date: "2026-10-23",
    });
  expect(numbered.officialNumber).not.toBe(a.officialNumber);
  expect(await db.noteNumbers.count()).toBe(3);
});
it("revision number menolak penyimpanan tab lama dan hanya satu aksi penomoran dokumen yang sama", async () => {
  let n = await filled();
  const stale = n;
  n = await saveNote(
    n.id,
    n.revision,
    { ...n.content, subject: "Isi dari tab pertama" },
    "user-0",
  );
  await expect(
    saveNote(
      stale.id,
      stale.revision,
      { ...stale.content, subject: "Tab lama" },
      "user-0",
    ),
  ).rejects.toThrow(/Konflik revisi/);
  n = await approved(n);
  const results = await Promise.allSettled([
    noteAction(n.id, n.revision, "number", "user-1", { date: "2026-10-23" }),
    noteAction(n.id, n.revision, "number", "user-1", { date: "2026-10-23" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.noteNumbers.count()).toBe(1);
});
it("pendaftaran Surat Keluar idempoten; pengiriman manual dan arsip mempertahankan sumber versi", async () => {
  let n = await approved(await filled());
  n = await noteAction(n.id, n.revision, "number", "user-1", {
    date: "2026-10-23",
  });
  n = await noteAction(n.id, n.revision, "register", "user-1");
  n = await noteAction(n.id, n.revision, "register", "user-1");
  expect(
    (await db.outgoing.toArray()).filter((o) => o.noteId === n.id),
  ).toHaveLength(1);
  n = await noteAction(n.id, n.revision, "send", "user-1", {
    note: "Diterima sekretariat",
    channel: "Diserahkan langsung",
  });
  expect(n.status).toBe("Tercatat dikirim");
  n = await noteAction(n.id, n.revision, "archive", "user-0");
  expect(n.status).toBe("Diarsipkan");
  expect((await db.outgoing.get(n.outgoingId!))?.status).toBe("Diarsipkan");
});
it("pemulihan selalu menambah versi; duplikat tidak membawa nomor, persetujuan, atau ID lampiran sumber", async () => {
  let n = await filled();
  const old = (await db.noteVersions
    .where({ noteId: n.id, version: n.version })
    .first())!;
  n = await restoreNote(n.id, n.revision, old.id, "user-0", "Pulihkan");
  expect(n.version).toBe(old.version + 1);
  const clone = await duplicateNote(n.id, "user-0");
  expect(clone.id).not.toBe(n.id);
  expect(clone.officialNumber).toBe("");
  expect(clone.content.signer.date).toBe("");
});
it("DOCX berisi teks editable, tabel berheader ulang, font hitam dan blok tanda tangan keepNext", async () => {
  const n = await filled(),
    blob = await noteDocx(n, [], true),
    files = unzipSync(new Uint8Array(await blob.arrayBuffer())),
    xml = strFromU8(files["word/document.xml"]);
  expect(xml).toContain("SIMINU RSAS");
  expect(xml).toContain("<w:tbl>");
  expect(xml).toContain("w:tblHeader");
  expect(xml).toContain("w:keepNext");
  expect(xml).toContain("DRAF");
  expect(xml).toContain('w:val="000000"');
  expect(xml).not.toContain("**Pengembangan**");
  expect(richBlocks("<script>alert(1)</script>")[0]).toEqual({
    kind: "paragraph",
    text: "<script>alert(1)</script>",
    list: undefined,
  });
  expect(inlineRuns("**Tebal** _miring_").some((x) => x.bold)).toBe(true);
});
it("ZIP v4 memulihkan nota, komentar, profil, template, nomor, snapshot dan Blob; referensi/nomor konflik ditolak", async () => {
  let n = await filled();
  const fid = "nota-attachment";
  n = await saveNote(
    n.id,
    n.revision,
    {
      ...n.content,
      attachments: [
        {
          id: fid,
          title: "Bukti kebutuhan",
          caption: "Keterangan",
          source: "Perangkat pengguna",
          inline: false,
          width: 150,
          rotation: 0,
          crop: { top: 0, right: 0, bottom: 0, left: 0 },
        },
      ],
    },
    "user-0",
    [
      {
        id: fid,
        letterId: n.id,
        name: "bukti.pdf",
        type: "application/pdf",
        blob: new Blob(["%PDF-1.4 contoh"]),
      },
    ],
  );
  n = await approved(n);
  n = await noteAction(n.id, n.revision, "number", "user-1", {
    date: "2026-10-23",
  });
  n = await noteAction(n.id, n.revision, "register", "user-1");
  const pkg = await validateFullBackup(await createFullBackup());
  expect(pkg.manifest.schemaVersion).toBe(6);
  expect(pkg.tables.noteVersions.length).toBeGreaterThan(4);
  expect(pkg.tables.noteTemplates).toHaveLength(7);
  expect(pkg.tables.noteReviews.length).toBeGreaterThan(2);
  await db.notes.clear();
  await db.noteVersions.clear();
  await db.noteReviews.clear();
  await db.noteNumbers.clear();
  await db.outgoing.where("id").equals(n.outgoingId!).delete();
  await db.attachments.delete(fid);
  await findConflicts(pkg);
  await restoreFullBackup(pkg, "replace", {});
  expect((await db.notes.get(n.id))?.officialNumber).toBe(n.officialNumber);
  expect(await (await db.attachments.get(fid))?.blob.text()).toBe(
    "%PDF-1.4 contoh",
  );
  const bad = structuredClone(pkg.tables);
  bad.notes[0].content.taskId = "missing-task";
  expect(() => validateReferences(bad, pkg.attachments)).toThrow(/Referensi/);
  const wrongSource = structuredClone(pkg.tables);
  wrongSource.notes[0].outgoingId = wrongSource.outgoing.find(
    (o) => !o.noteId,
  )!.id;
  expect(() => validateReferences(wrongSource, pkg.attachments)).toThrow(
    /Sumber Surat Keluar/,
  );
  const conflict = structuredClone(pkg.tables);
  conflict.outgoing.push({
    ...conflict.outgoing[0],
    id: "other-id",
    number: n.officialNumber,
  });
  expect(() => validateReferences(conflict, pkg.attachments)).toThrow(
    /Konflik nomor/,
  );
});
it("migrasi skema 3 ke 4 mempertahankan surat, naskah generik, dan Blob lama", async () => {
  const name = "nota-migration-" + crypto.randomUUID(),
    old = new Dexie(name);
  const newTables = [
    "notes",
    "noteVersions",
    "noteReviews",
    "noteTemplates",
    "noteProfiles",
    "noteNumbers",
  ];
  old
    .version(3)
    .stores(
      Object.fromEntries(
        db.tables
          .filter((t) => !newTables.includes(t.name))
          .map((t) => [
            t.name,
            [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(
              ",",
            ),
          ]),
      ),
    );
  const l = (await db.letters.get("letter-0"))!;
  await old.table("letters").add(l);
  await old
    .table("drafts")
    .add({ id: "legacy-draft", content: { body: "Naskah lama" } });
  await old.table("attachments").add({
    id: "old",
    letterId: l.id,
    name: "asli.pdf",
    blob: new Blob(["isi lama"]),
  });
  old.close();
  const next = createDatabase(name);
  await next.open();
  expect(await next.letters.get(l.id)).toEqual(l);
  expect((await next.drafts.get("legacy-draft"))?.content.body).toBe(
    "Naskah lama",
  );
  expect(await (await next.attachments.get("old"))?.blob.text()).toBe(
    "isi lama",
  );
  expect(await next.notes.count()).toBe(0);
  next.close();
  await Dexie.delete(name);
});

it("paket ZIP skema 3 tetap dapat dipulihkan dengan tabel Nota Dinas kosong", async () => {
  const zip = unzipSync(
    new Uint8Array(await (await createFullBackup()).arrayBuffer()),
  );
  const meta = JSON.parse(strFromU8(zip["metadata.json"])),
    manifest = JSON.parse(strFromU8(zip["manifest.json"]));
  for (const name of Object.keys(notaSchemas)) {
    delete meta.tables[name];
    delete manifest.counts[name];
  }
  manifest.schemaVersion = 3;
  manifest.appVersion = "3.0.0";
  zip["metadata.json"] = strToU8(JSON.stringify(meta));
  manifest.metadata.bytes = zip["metadata.json"].length;
  manifest.metadata.sha256 = await checksum(zip["metadata.json"]);
  zip["manifest.json"] = strToU8(JSON.stringify(manifest));
  const pkg = await validateFullBackup(
    new Blob([Uint8Array.from(zipSync(zip))]),
  );
  expect(pkg.tables.notes).toEqual([]);
  expect(pkg.tables.letters).toHaveLength(32);
  expect(pkg.tables.noteProfiles).toEqual([]);
  await findConflicts(pkg);
  await restoreFullBackup(pkg, "replace", {});
  await ensureNota();
  expect(await db.letters.count()).toBe(32);
  expect(await db.noteTemplates.count()).toBe(7);
});
