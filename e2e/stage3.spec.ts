import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("rsas-data-mode", "demo"),
  );
});
async function all(page: import("@playwright/test").Page, table: string) {
  return page.evaluate(
    async (table) =>
      new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open("siminu-rsas-demo-v2");
        req.onsuccess = () => {
          const database = req.result;
          const tx = database.transaction(table);
          const q = tx.objectStore(table).getAll();
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
          tx.oncomplete = () => database.close();
        };
      }),
    table,
  );
}
test("naskah offline autosave, reload, paraf berjenjang, DOCX editable dan invalidasi persetujuan", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expect(
    page.getByText("Siap digunakan offline", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.goto("/naskah");
  await page.getByRole("button", { name: "Buat naskah", exact: true }).click();
  await page.getByLabel("Kepada", { exact: true }).fill("Kepala RSAU");
  await page
    .getByLabel("Perihal", { exact: true })
    .fill("Nota dinas pengujian offline");
  await page
    .getByLabel("Isi", { exact: true })
    .fill("Teks naskah dapat diedit di pengolah kata.");
  await expect
    .poll(async () => (await all(page, "drafts"))[0]?.content.body)
    .toBe("Teks naskah dapat diedit di pengolah kata.");
  await page.reload();
  await expect(page.getByLabel("Isi", { exact: true })).toHaveValue(
    "Teks naskah dapat diedit di pengolah kata.",
  );
  for (const uid of ["user-1", "user-2"]) {
    await page.getByLabel("Pemeriksa aktif sesuai unit").selectOption(uid);
    await page
      .getByRole("button", { name: "Tambahkan pemeriksa berurutan" })
      .click();
  }
  await page
    .getByRole("button", { name: "Ajukan pemeriksaan", exact: true })
    .click();
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: /Paraf simulasi versi/ }).click();
  await page.getByRole("button", { name: /Setujui simulasi versi/ }).click();
  await page
    .getByRole("button", { name: "Terbitkan nomor", exact: true })
    .click();
  await expect(page.getByLabel("Nomor (setelah persetujuan)")).toHaveValue(
    /^B\//,
  );
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor DOCX", exact: true }).click();
  const download = await waiting;
  await download.saveAs("test-results/nota-dinas-contoh.docx");
  const data = await readFile((await download.path())!);
  const xml = strFromU8(unzipSync(data)["word/document.xml"]);
  expect(xml).toContain("Teks naskah dapat diedit di pengolah kata.");
  expect(xml).toContain("w:t");
  await page
    .getByLabel("Isi", { exact: true })
    .fill("Isi berubah setelah persetujuan.");
  await expect
    .poll(async () => (await all(page, "drafts"))[0]?.stage)
    .toBe("Draf");
  expect((await all(page, "drafts"))[0].approvedVersion).toBeUndefined();
  await expect(
    page.getByText("Persetujuan tidak berlaku", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pratinjau A4" }).click();
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: "test-results/naskah-a4.pdf", format: "A4" });
});
test("agenda pimpinan memperingatkan benturan, ICS, notulen, keputusan idempoten dan berkas kegiatan", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await page.goto("/agenda");
  await expect(
    page.getByText("Siap digunakan offline", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  for (const title of ["Undangan pimpinan satu", "Undangan pimpinan dua"]) {
    await page
      .getByRole("button", { name: "Tambah kegiatan", exact: false })
      .click();
    await page.getByLabel("Nama kegiatan *").fill(title);
    await page.getByLabel("Tanggal *", { exact: true }).fill("2026-10-23");
    await page.getByLabel("Lokasi", { exact: true }).fill("Ruang Pimpinan");
    await page.getByLabel("Pejabat yang diundang").selectOption("user-2");
    await page
      .getByRole("button", { name: "Konfirmasi & simpan kegiatan" })
      .click();
    if (title.endsWith("dua")) {
      await expect(
        page.getByText("Benturan jadwal", { exact: true }),
      ).toBeVisible();
      await page
        .getByLabel(
          "Saya sudah meninjau benturan dan tetap menjadwalkan kegiatan",
        )
        .check();
      await page
        .getByRole("button", { name: "Konfirmasi & simpan kegiatan" })
        .click();
    }
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor kalender ICS" }).click();
  const ics = await readFile((await (await waiting).path())!, "utf8");
  expect(ics).toContain("DTSTART:20261023T010000Z");
  await page.goto("/notulen");
  await page.getByRole("button", { name: "Buat notulen", exact: true }).click();
  await page.getByLabel("Judul rapat *").fill("Notulen rapat pimpinan");
  await page
    .getByLabel("Pokok pembahasan")
    .fill("Pembahasan koordinasi dan hasil kegiatan.");
  await page.getByRole("button", { name: "Tambah keputusan" }).click();
  await page
    .getByLabel("Keputusan 1", { exact: true })
    .fill("Siapkan laporan kegiatan");
  await page.getByLabel("Penanggung jawab keputusan 1").selectOption("user-3");
  await page.getByLabel("Unit keputusan 1").selectOption("unit-19");
  await page
    .getByRole("button", { name: "Simpan notulen", exact: true })
    .click();
  for (let i = 0; i < 2; i++) {
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Konfirmasi buat tugas keputusan" })
      .click();
    await expect(
      page.getByText(/tugas dibuat, .*keputusan dilewati/),
    ).toBeVisible();
  }
  const minutes = (await all(page, "minutes"))[0];
  expect(
    (await all(page, "tasks")).filter((t) => t.minutesId === minutes.id),
  ).toHaveLength(1);
  const docDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor DOCX notulen" }).click();
  const savedDoc = await docDownload;
  await savedDoc.saveAs("test-results/notulen-contoh.docx");
  expect(
    strFromU8(
      unzipSync(await readFile((await savedDoc.path())!))["word/document.xml"],
    ),
  ).toContain("Siapkan laporan kegiatan");
  await page.goto("/berkas-kegiatan");
  await page.getByRole("button", { name: "Buat berkas kegiatan" }).click();
  await page
    .getByLabel("Nama kegiatan / perkara")
    .fill("Bundel rapat koordinasi");
  await page.getByRole("button", { name: "Simpan berkas" }).click();
  await page.getByLabel("Jenis sumber").selectOption("minutes");
  await page.getByLabel("Dokumen sumber").selectOption(minutes.id);
  await page.getByRole("button", { name: "Tautkan ke berkas" }).click();
  await expect(
    page.getByRole("heading", { name: "Pekerjaan terbuka · 1" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hapus hubungan" }).click();
  expect(await all(page, "minutes")).toHaveLength(1);
});
function scannedPDF() {
  const stream = "0.5 g 50 50 200 200 re f";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = pdf.length;
  pdf +=
    "xref\n0 5\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return pdf;
}
test("PDF.js worker mengekstrak teks offline dan memberi keterangan pada PDF tanpa lapisan teks", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith("http://127.0.0.1:4173")
    )
      external.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByText("Siap digunakan offline", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.evaluate(
    async (pdf) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("siminu-rsas-demo-v2");
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction(
            ["attachments", "letters"],
            "readwrite",
          );
          tx.objectStore("attachments").add({
            id: "pdf-scan-test",
            letterId: "letter-0",
            name: "pindai-tanpa-teks.pdf",
            type: "application/pdf",
            blob: new Blob([pdf], { type: "application/pdf" }),
          });
          const get = tx.objectStore("letters").get("letter-0");
          get.onsuccess = () =>
            tx.objectStore("letters").put({
              ...get.result,
              attachmentIds: [...get.result.attachmentIds, "pdf-scan-test"],
            });
          tx.oncomplete = () => {
            database.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    scannedPDF(),
  );
  await context.setOffline(true);
  await page.goto("/pencarian");
  await page.getByText("Indeks PDF lokal", { exact: false }).click();
  await page.getByRole("button", { name: "Indeks ulang isi PDF" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "33 PDF diekstrak, 0 gagal" }),
  ).toBeVisible({ timeout: 60000 });
  await expect(
    page.getByText(
      "Belum dapat dicari berdasarkan isi — tidak ada lapisan teks",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByLabel("Cari isi dokumen (minimal 2 karakter)")
    .fill("Dokumen fiktif");
  await expect(page.getByRole("heading", { name: "32 hasil" })).toBeVisible();
  await expect(
    page.getByText("Halaman 1", { exact: true }).first(),
  ).toBeVisible();
  expect(external).toEqual([]);
});
function xlsx() {
  const rows = [
    [
      "agenda",
      "pengirim",
      "nomor",
      "tanggal",
      "diterima",
      "perihal",
      "jenis",
      "derajat",
      "klasifikasi",
      "unit",
    ],
    [
      "0888/SM/2026",
      "Instansi Excel",
      "B/Excel",
      "2026-10-23",
      "2026-10-23",
      "Surat Excel valid",
      "Surat dinas",
      "Biasa",
      "Biasa",
      "unit-19",
    ],
    [
      "0889/SM/2026",
      "Instansi Excel",
      "B/buruk",
      "2026-02-31",
      "2026-02-31",
      "Surat Excel invalid",
      "Surat dinas",
      "Biasa",
      "Biasa",
      "unit-19",
    ],
  ];
  const entries = {
    "[Content_Types].xml":
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Register" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml":
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      rows
        .map(
          (row, i) =>
            `<row r="${i + 1}">` +
            row
              .map(
                (v, j) =>
                  `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t>${v}</t></is></c>`,
              )
              .join("") +
            "</row>",
        )
        .join("") +
      "</sheetData></worksheet>",
  };
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(entries).map(([k, v]) => [k, strToU8(v)]),
      ),
    ),
  );
}
test("XLSX tervalidasi tanpa menimpa data; arsip massal melaporkan item gagal dan berhasil", async ({
  page,
  context,
}) => {
  await page.goto("/impor-register");
  await expect(
    page.getByText("Siap digunakan offline", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page
    .getByLabel("Pilih Excel XLSX atau CSV (maksimal 8 MB)")
    .setInputFiles({
      name: "register.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: xlsx(),
    });
  await page.getByRole("button", { name: "Validasi & pratinjau" }).click();
  await expect(
    page.getByText("Tanggal harus valid (YYYY-MM-DD atau DD/MM/YYYY)", {
      exact: true,
    }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Konfirmasi impor metadata" }).click();
  await expect(
    page.getByRole("heading", { name: "1 berhasil · 1 dilewati" }),
  ).toBeVisible();
  expect(await all(page, "letters")).toHaveLength(33);
  await page.goto("/surat-masuk?size=50");
  await page.getByLabel("Pilih surat 0029/SM/2026", { exact: true }).check();
  await page.getByLabel("Pilih surat 0001/SM/2026", { exact: true }).check();
  await page.getByRole("button", { name: "Tinjau pemrosesan massal" }).click();
  await page.getByLabel("Tindakan massal").selectOption("archive");
  await page
    .getByRole("button", { name: "Konfirmasi proses dokumen valid" })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 berhasil · 1 gagal/dilewati" }),
  ).toBeVisible();
  await page.goto("/analisis");
  await expect(
    page.getByRole("heading", { name: "Analisis Waktu Proses" }),
  ).toBeVisible();
  await expect(
    page.getByText("Belum ada data lengkap", { exact: true }).first(),
  ).toBeVisible();
  await page.goto("/bantuan");
  await page
    .getByRole("button", { name: "Panduan: Membuat nota dinas" })
    .click();
  await page.getByRole("button", { name: "Langkah berikutnya" }).click();
  await expect(
    page.getByRole("heading", { name: "Isi dan simpan", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lewati panduan" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
