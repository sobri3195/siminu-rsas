import { db } from "./db";
import { id, now, today } from "../utils";
import type { Role, IncomingLetter } from "../types";
const names = [
  "Waka RSAU",
  "KA SPI",
  "KAKOM Mutu dan Akreditasi RS",
  "KAKOMKORDIK",
  "KAKOMPROF",
  "KAKOM Etik dan Kumkes RS",
  "KAKOMITE PPI",
  "KAPROGAR",
  "KAKU",
  "KABAGUM",
  "KA URTU",
  "KAUR BMN",
  "KA URDAL",
  "KA PERS",
  "KA JAM",
  "KAUR VER",
  "KAUR KLAIM",
  "KAUR RM dan INFOKES",
  "KAKU YANMASNON APBN",
  "KA SIMRS",
  "KA BAGDUKKES",
  "KA URRIKKES",
  "KA SUBBAGKESPREV",
  "KA BAGYANMEDWATINFEKSI",
  "KA BAGJANGMED",
  "KA INSTAL — Farmasi",
  "KA KLINIK — Umum",
];
export function samplePdf(subject: string) {
  const clean = subject.replace(/[^a-zA-Z0-9 .-]/g, " ");
  const stream = `BT /F1 16 Tf 50 780 Td (CONTOH / DEMO - SIMINU RSAS) Tj 0 -40 Td /F1 12 Tf (${clean}) Tj 0 -35 Td (Dokumen fiktif untuk demonstrasi administrasi.) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf +=
    `xref\n0 6\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}
export async function seed(includeSamples = true) {
  await db.transaction("rw", db.tables, async () => {
    if (await db.settings.count()) return;
    if (await db.letters.count())
      throw Error(
        "Data lama ditemukan tanpa pengaturan. Buat cadangan sebelum memperbaiki konfigurasi.",
      );
    const roles: Role[] = [
      "Admin Sistem",
      "Petugas Urtu/Administrasi",
      "Kepala RSAU",
      "Kepala Unit",
      "Pelaksana",
    ];
    await db.users.bulkAdd(
      roles.map((role, i) => ({
        id: `user-${i}`,
        name: [
          "Admin Demo",
          "Rani Demo",
          "dr. Aditya Demo",
          "Bima Demo",
          "Citra Demo",
        ][i],
        role,
        unitId: i === 3 || i === 4 ? "unit-19" : "unit-10",
        active: true,
      })),
    );
    await db.units.bulkAdd(
      names.map((name, i) => ({
        id: `unit-${i}`,
        name,
        active: true,
        order: i,
        userId: i === 19 ? "user-3" : "user-4",
        parentId: i === 25 ? "unit-19" : undefined,
      })),
    );
    await db.positions.bulkAdd(
      names.map((name, i) => ({
        id: `position-${i}`,
        name,
        unitId: `unit-${i}`,
        userId: i === 19 ? "user-3" : "user-4",
      })),
    );
    await db.settings.add({
      id: "main",
      official: "",
      rank: "",
      nrp: "",
      printDate: today(),
      timezone: "Asia/Jakarta",
      extraInstructions: "",
    });
    if (!includeSamples) return;
    const subjects = [
      "Undangan rapat koordinasi",
      "Permohonan dukungan kesehatan",
      "Persiapan akreditasi",
      "Pemeliharaan perangkat komputer",
      "Pengadaan alat tulis",
      "Pelaporan inventaris",
      "Kegiatan MCU",
      "Sosialisasi kebijakan administrasi",
    ];
    for (let i = 0; i < 32; i++) {
      const lid = `letter-${i}`,
        aid = `attachment-${i}`;
      const status: IncomingLetter["status"] =
        i < 5
          ? "Menunggu disposisi"
          : i < 8
            ? "Terdaftar"
            : i < 28
              ? "Dalam tindak lanjut"
              : i < 30
                ? "Selesai"
                : "Diarsipkan";
      const letter: IncomingLetter = {
        id: lid,
        agenda: `${String(i + 1).padStart(4, "0")}/SM/${today().slice(0, 4)}`,
        sender: [
          "Dinas Kesehatan Kota Demo",
          "Sekretariat Mitra Demo",
          "Tim Akreditasi Demo",
          "Bagian Umum Demo",
        ][i % 4],
        number: `B/${100 + i}/X/${today().slice(0, 4)}`,
        date: today(),
        received: today(),
        subject: subjects[i % 8],
        kind: i % 3 ? "Surat dinas" : "Undangan",
        urgency: i % 5 === 0 ? "Segera" : "Biasa",
        classification: "Biasa",
        summary: "Data fiktif untuk demonstrasi alur administrasi RSAS.",
        status,
        attachmentIds: [aid],
        createdAt: now(),
      };
      await db.letters.add(letter);
      await db.attachments.add({
        id: aid,
        letterId: lid,
        name: `contoh-surat-${i + 1}.pdf`,
        type: "application/pdf",
        blob: samplePdf(letter.subject),
      });
      if (i >= 8) {
        const did = id();
        const recipients = [19, 10, 2].map((u, k) => ({
          unitId: `unit-${u}`,
          unitName: names[u],
          userId: u === 19 ? "user-3" : "user-4",
          kind: (k === 2 ? "Tembusan" : k === 0 ? "Utama" : "Pendukung") as
            "Utama" | "Pendukung" | "Tembusan",
          instruction: "Tindak lanjuti dan laporkan hasil",
          deadline:
            i % 3 === 0
              ? new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
              : today(),
        }));
        await db.dispositions.add({
          id: did,
          letterId: lid,
          giver: "dr. Aditya Demo",
          recipients,
          instructions: ["Tindak lanjuti", "Laporkan"],
          notes: "Koordinasikan dengan unit terkait.",
          deadline: recipients[0].deadline,
          review: true,
          createdAt: now(),
        });
        for (const r of recipients.slice(0, 2))
          await db.tasks.add({
            id: id(),
            letterId: lid,
            dispositionId: did,
            unitId: r.unitId,
            unitName: r.unitName,
            userId: r.userId,
            instruction: r.instruction,
            deadline: r.deadline,
            status:
              i >= 28
                ? "Selesai"
                : (
                    [
                      "Belum dibaca",
                      "Diproses",
                      "Perlu perbaikan",
                      "Hasil dikirim",
                      "Diterima",
                    ] as const
                  )[i % 5],
            review: true,
            createdAt: now(),
          });
      }
      await db.activities.add({
        id: id(),
        letterId: lid,
        text: "Surat contoh diregistrasi",
        author: "Sistem Demo",
        createdAt: now(),
      });
    }
    for (let i = 0; i < 10; i++)
      await db.outgoing.add({
        id: id(),
        subject: subjects[i % 8],
        recipient: "Instansi Mitra Demo",
        number: i > 4 ? `B/${i + 1}/RSAS/${today().slice(0, 4)}` : "",
        status: [
          "Draf",
          "Pemeriksaan",
          "Persetujuan demo",
          "Penomoran",
          "Pengiriman",
          "Diarsipkan",
        ][i % 6],
        createdAt: now(),
      });
    await db.events.add({
      id: id(),
      title: "Rapat koordinasi administrasi",
      date: today(),
      location: "Ruang rapat RSAS",
    });
    await db.notifications.add({
      id: id(),
      text: "Selamat datang. Lima surat menunggu disposisi.",
      letterId: "letter-0",
      read: false,
      createdAt: now(),
    });
  });
}
