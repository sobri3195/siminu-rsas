import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
async function all(page: Page, table: string) {
  return page.evaluate(
    async (table) =>
      new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open("siminu-rsas-demo-v2");
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction(table),
            q = tx.objectStore(table).getAll();
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
          tx.oncomplete = () => db.close();
        };
      }),
    table,
  );
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("rsas-data-mode", "demo"),
  );
});
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByText("Siap digunakan offline", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}
async function newSource(page: Page) {
  await page.goto("/surat-masuk/baru");
  await page
    .getByLabel("Pengirim *", { exact: true })
    .fill("Instansi Uji Terpadu");
  await page
    .getByLabel("Nomor surat *", { exact: true })
    .fill("SUMBER/TERPADU/1");
  await page
    .getByLabel("Perihal *", { exact: true })
    .fill("Permintaan jawaban terpadu (CONTOH)");
  await page
    .getByLabel("Instansi pengirim", { exact: true })
    .fill("Instansi Contoh");
  await page
    .getByLabel("Unit pengelola", { exact: true })
    .selectOption("unit-10");
  await page
    .getByLabel("Lokasi dokumen fisik", { exact: true })
    .fill("Lemari Surat A");
  await page.getByRole("button", { name: "Lanjutkan", exact: false }).click();
  await page
    .getByLabel("Pilih berkas (berkas pertama menjadi dokumen utama)", {
      exact: true,
    })
    .setInputFiles("examples/disposisi-digital-contoh.pdf");
  await page.getByRole("button", { name: "Lanjutkan", exact: false }).click();
  await page
    .getByRole("button", { name: "Simpan & registrasi", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await all(page, "letters")).some((l) => l.number === "SUMBER/TERPADU/1"),
    )
    .toBe(true);
  const l = (await all(page, "letters")).find(
    (l) => l.number === "SUMBER/TERPADU/1",
  );
  await page.goto("/surat-masuk/" + l.id);
  return l;
}
async function prepare(page: Page) {
  await page
    .getByRole("button", { name: "Nilai kebutuhan balasan", exact: true })
    .click();
  await page
    .getByLabel("Keputusan balasan", { exact: true })
    .selectOption("Perlu balasan");
  await page
    .getByLabel("Unit penanggung jawab", { exact: true })
    .selectOption("unit-10");
  await page.getByLabel("PIC penyusun", { exact: true }).selectOption("user-1");
  await page.getByLabel("Tenggat balasan", { exact: true }).fill("2026-10-30");
  await page
    .getByLabel("Arahan penyusunan", { exact: true })
    .fill("Susun jawaban berdasarkan data pengguna.");
  await page
    .getByLabel("Pemeriksa balasan", { exact: true })
    .selectOption("user-2");
  await page
    .getByLabel("Alasan / sumber penugasan atau penutupan", { exact: true })
    .fill("Penilaian administrasi contoh");
  await page
    .getByRole("button", { name: "Simpan penilaian", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Buat Balasan", exact: true }).click();
  await page
    .getByLabel("Jenis dan template balasan", { exact: true })
    .selectOption("template-5");
  await page
    .getByRole("button", { name: "Simpan konsep balasan", exact: true })
    .click();
  await expect(page).toHaveURL(/\/naskah\//);
}
async function saved(page: Page) {
  await expect
    .poll(async () => {
      const d = (await all(page, "drafts"))[0];
      return d?.content.body;
    })
    .not.toBe("[Isi naskah disusun oleh pengguna.]");
  await expect(
    page.getByRole("button", { name: "Simpan sekarang", exact: true }),
  ).toBeDisabled();
}
async function completeReview(page: Page) {
  await page
    .getByRole("button", { name: "Ajukan pemeriksaan", exact: true })
    .click();
  await page.getByRole("button", { name: /Paraf simulasi versi/ }).click();
  await page.getByRole("button", { name: /Setujui simulasi versi/ }).click();
}
test("alur surat masuk sampai dua tujuan, penerimaan terpisah, arsip, DOCX, ZIP dan offline", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const outside: string[] = [];
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith("http://127.0.0.1:4173")
    )
      outside.push(r.url());
  });
  await ready(page);
  const png = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 900;
      c.height = 520;
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, 900, 520);
      g.strokeStyle = "#000";
      g.strokeRect(20, 20, 860, 480);
      g.fillStyle = "#000";
      g.font = "36px serif";
      g.fillText("LAMPIRAN CONTOH / DEMO", 80, 150);
      g.font = "24px serif";
      g.fillText("Berkas pengujian — bukan bukti kegiatan nyata", 80, 250);
      return c.toDataURL("image/png").split(",")[1];
    }),
    "base64",
  );
  await context.setOffline(true);
  const source = await newSource(page);
  await prepare(page);
  const editor = page.url();
  await expect(page.getByLabel("Kepada", { exact: true })).toHaveValue(
    source.sender,
  );
  expect((await all(page, "drafts"))[0].attachmentIds).toHaveLength(0);
  await page
    .getByLabel("Isi", { exact: true })
    .fill(
      "**Jawaban pengguna**\n1. Data telah diperiksa pada contoh ini.\n| Uraian | Keterangan |\n| Status | Contoh |",
    );
  await page
    .getByLabel("Identitas penandatangan", { exact: true })
    .fill("Pejabat Penandatangan (CONTOH)");
  await saved(page);
  await page
    .getByLabel("Tambahkan lampiran balasan", { exact: true })
    .setInputFiles([
      { name: "bukti-contoh.png", mimeType: "image/png", buffer: png },
      {
        name: "lampiran-teks.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Lampiran teks asli — CONTOH"),
      },
    ]);
  await expect
    .poll(async () => (await all(page, "drafts"))[0].attachmentIds.length)
    .toBe(2);
  await page
    .getByRole("button", { name: "Judul, caption, urutan", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Judul lampiran", { exact: true })
    .fill("Lampiran gambar contoh");
  await page
    .getByLabel("Caption lampiran", { exact: true })
    .fill("Gambar uji contoh, bukan bukti kegiatan nyata.");
  await page.getByLabel("Urutan lampiran (mulai 1)", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Simpan identitas lampiran", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Isi", { exact: true })).toHaveValue(
    /Jawaban pengguna/,
  );
  await page
    .getByRole("button", { name: "Ajukan pemeriksaan", exact: true })
    .click();
  await page
    .getByLabel("Catatan koreksi / keputusan / pemulihan", { exact: true })
    .fill("Perbaiki perihal dan pembukaan.");
  await page
    .getByRole("button", { name: "Kembalikan untuk perbaikan", exact: true })
    .click();
  await page
    .getByLabel("Pembukaan", { exact: true })
    .fill("Menindaklanjuti surat yang telah dipilih.");
  await expect(
    page.getByRole("button", { name: "Simpan sekarang", exact: true }),
  ).toBeDisabled();
  await completeReview(page);
  await page
    .getByRole("button", { name: "Terbitkan nomor", exact: true })
    .click();
  await expect(
    page.getByLabel("Nomor (setelah persetujuan)", { exact: true }),
  ).toHaveValue(/^B\//);
  await expect(page.getByLabel("Isi", { exact: true })).toBeDisabled();
  const docxEvent = page.waitForEvent("download", { timeout: 15000 });
  await page.getByRole("button", { name: "Ekspor DOCX", exact: true }).click();
  const docx = await docxEvent;
  await docx.saveAs("test-results/surat-terpadu-contoh.docx");
  const zip = unzipSync(await readFile((await docx.path())!));
  expect(strFromU8(zip["word/document.xml"])).toContain("Jawaban pengguna");
  expect(strFromU8(zip["word/document.xml"])).toContain("<w:tbl>");
  const xml = strFromU8(zip["word/document.xml"]);
  expect(xml.indexOf("lampiran-teks.txt")).toBeLessThan(
    xml.indexOf("Lampiran gambar contoh"),
  );
  expect(Object.keys(zip).some((k) => k.startsWith("word/media/"))).toBe(true);
  await page.screenshot({
    path: "test-results/surat-terpadu-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pratinjau A4", exact: true }).click();
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: "test-results/surat-terpadu-cetak.pdf",
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  const d = (await all(page, "drafts"))[0];
  await page.goto("/buku-ekspedisi?surat=" + encodeURIComponent(d.outgoingId));
  await page
    .getByLabel("Tujuan tambahan", { exact: true })
    .fill("Tujuan kedua");
  await page
    .getByLabel("Alamat tujuan", { exact: true })
    .fill("Alamat tujuan kedua");
  await page
    .getByRole("button", { name: "Tambah tujuan", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Catat percobaan pengiriman",
      exact: true,
    }),
  ).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", { name: "Catat percobaan pengiriman", exact: true })
      .nth(i)
      .click();
    await page
      .getByLabel("Nama penerima / pihak tujuan", { exact: true })
      .fill("Petugas penerima " + (i + 1));
    if (i === 0)
      await page
        .getByLabel("Bukti pengiriman (maksimal 20 MB per berkas)", {
          exact: true,
        })
        .setInputFiles({
          name: "resi.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("BUKTI EKSPEDISI"),
        });
    await page
      .getByRole("button", { name: "Simpan catatan pengiriman", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: "Catat penerimaan", exact: true })
    .first()
    .click();
  await page.getByLabel("Bukti penerimaan", { exact: true }).setInputFiles({
    name: "terima.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("BUKTI TERIMA"),
  });
  await page
    .getByRole("button", { name: "Simpan penerimaan", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await all(page, "dispatches")).filter((d) => d.status === "Diterima"),
  ).toHaveLength(1);
  expect(
    (await all(page, "dispatches")).filter(
      (d) => d.status === "Tercatat dikirim",
    ),
  ).toHaveLength(1);
  await page.goto("/rangkaian/" + source.id);
  await expect(
    page.getByText("Balasan:", { exact: false }).first(),
  ).toContainText("Selesai");
  await page
    .getByRole("button", { name: "Arsipkan sumber rangkaian", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await all(page, "letters")).find((l) => l.id === source.id)?.status,
    )
    .toBe("Diarsipkan");
  await page.goto("/surat-keluar");
  await page
    .getByLabel("Lokasi dokumen fisik arsip", { exact: true })
    .fill("Lemari Keluar B");
  await page
    .getByRole("row")
    .filter({ hasText: "Balasan: " + source.subject })
    .getByRole("button", { name: "Arsipkan", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await all(page, "outgoing")).find((o) => o.id === d.outgoingId)
          ?.status,
    )
    .toBe("Diarsipkan");
  await page.goto("/pusat-data");
  const download = page.waitForEvent("download", { timeout: 15000 });
  await page
    .getByRole("button", { name: "Buat cadangan lengkap ZIP", exact: true })
    .click();
  const backup = await download;
  const b = await readFile((await backup.path())!);
  expect(
    JSON.parse(strFromU8(unzipSync(b)["manifest.json"])).schemaVersion,
  ).toBe(6);
  await page
    .getByLabel("Pilih cadangan lengkap ZIP", { exact: true })
    .setInputFiles({
      name: "surat.zip",
      mimeType: "application/zip",
      buffer: b,
    });
  await page
    .getByLabel("Cara pemulihan", { exact: true })
    .selectOption("replace");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Konfirmasi pemulihan", exact: true })
    .click();
  await expect(page.getByText(/Pemulihan selesai:/)).toBeVisible();
  expect(await all(page, "dispatches")).toHaveLength(2);
  expect(await all(page, "replyAssignments")).toHaveLength(1);
  await page.goto(editor);
  await expect(page.getByLabel("Isi", { exact: true })).toHaveValue(
    /Jawaban pengguna/,
  );
  expect(outside).toEqual([]);
});
test("konsep aktif tidak tergandakan, tambahan eksplisit, tab usang mempertahankan input dan mobile pratinjau", async ({
  page,
  context,
}) => {
  test.setTimeout(80000);
  await ready(page);
  const source = await newSource(page);
  await prepare(page);
  await page
    .getByLabel("Isi", { exact: true })
    .fill("Isi pertama untuk konflik tab.");
  await saved(page);
  const url = page.url(),
    tab = await context.newPage();
  await tab.goto(url);
  await expect(tab.getByLabel("Isi", { exact: true })).toHaveValue(
    "Isi pertama untuk konflik tab.",
  );
  await page
    .getByLabel("Isi", { exact: true })
    .fill("Perubahan terbaru dari tab pertama.");
  await expect
    .poll(async () => (await all(page, "drafts"))[0].content.body)
    .toBe("Perubahan terbaru dari tab pertama.");
  await tab
    .getByLabel("Isi", { exact: true })
    .fill("Input tab usang tetap ada.");
  await expect(tab.getByRole("alert")).toContainText("Konflik");
  await expect(tab.getByLabel("Isi", { exact: true })).toHaveValue(
    "Input tab usang tetap ada.",
  );
  await tab.close();
  await page.goto("/surat-masuk/" + source.id);
  await page.getByRole("button", { name: "Buat Balasan", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /Lanjutkan Konsep/ }),
  ).toHaveCount(1);
  expect(await all(page, "drafts")).toHaveLength(1);
  await page
    .getByRole("button", { name: "Buat Balasan Tambahan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Simpan konsep balasan", exact: true })
    .click();
  await expect(page).toHaveURL(/\/naskah\//);
  expect(await all(page, "drafts")).toHaveLength(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Isi", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pratinjau A4", exact: true }).click();
  await expect(page.locator(".mail-a4-preview")).toBeVisible();
  await page.screenshot({
    path: "test-results/surat-terpadu-mobile.png",
    fullPage: true,
  });
});
test("cetak panjang mempertahankan paragraf terakhir, tabel, referensi dan penanda DRAF", async ({
  page,
}) => {
  test.setTimeout(70000);
  await ready(page);
  await newSource(page);
  await prepare(page);
  await page
    .getByLabel("Isi", { exact: true })
    .fill(
      Array.from(
        { length: 75 },
        (_, i) =>
          `${i + 1}. Catatan pengguna contoh untuk pemeriksaan surat panjang. Semua informasi disusun sendiri.`,
      ).join("\n") +
        "\n| Kolom A | Kolom B |\n| Data akhir | PENANDA-AKHIR-SURAT |",
    );
  await saved(page);
  await page.getByRole("button", { name: "Pratinjau A4", exact: true }).click();
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: "test-results/surat-terpadu-panjang.pdf",
    format: "A4",
  });
  await expect(page.locator(".mail-paper")).toContainText(
    "DRAF — BELUM DITERBITKAN",
  );
  await expect(page.locator(".mail-paper")).toContainText(
    "PENANDA-AKHIR-SURAT",
  );
});

test("contoh idempoten dan dua tab memperebutkan nomor resmi yang sama, register dan CSV", async ({
  page,
  context,
}) => {
  test.setTimeout(70000);
  await ready(page);
  await page.goto("/perlu-dibalas");
  await page
    .getByRole("button", { name: "Siapkan contoh surat terpadu", exact: true })
    .click();
  await expect(page).toHaveURL(/\/rangkaian\/mail-example-source/);
  expect(
    (await all(page, "drafts")).filter((d) => d.id === "mail-example-draft"),
  ).toHaveLength(1);
  await page.goto("/perlu-dibalas");
  await page
    .getByRole("button", { name: "Siapkan contoh surat terpadu", exact: true })
    .click();
  await expect(page).toHaveURL(/\/rangkaian\/mail-example-source/);
  expect(await all(page, "replyAssignments")).toHaveLength(1);
  expect(await all(page, "drafts")).toHaveLength(1);
  await page.goto("/naskah/mail-example-draft");
  await page
    .getByLabel("Isi", { exact: true })
    .fill("Isi surat pertama (CONTOH).");
  await page
    .getByLabel("Identitas penandatangan", { exact: true })
    .fill("Pejabat (CONTOH)");
  await expect(
    page.getByRole("button", { name: "Simpan sekarang", exact: true }),
  ).toBeDisabled();
  await completeReview(page);
  await page
    .getByRole("button", { name: "Duplikasi sebagai konsep baru", exact: true })
    .click();
  await expect(page).not.toHaveURL(/\/naskah\/mail-example-draft$/);
  await page
    .getByLabel("Isi", { exact: true })
    .fill("Isi surat kedua (CONTOH).");
  await expect(
    page.getByRole("button", { name: "Simpan sekarang", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Pemeriksa aktif sesuai unit", { exact: true })
    .selectOption("user-2");
  await page
    .getByRole("button", { name: "Tambahkan pemeriksa berurutan", exact: true })
    .click();
  await completeReview(page);
  const other = await context.newPage();
  await other.goto("/naskah/mail-example-draft");
  for (const p of [page, other])
    await p
      .getByLabel("Catatan koreksi / keputusan / pemulihan", { exact: true })
      .fill("UNIK/CONTOH/2026");
  await Promise.all([
    page.getByRole("button", { name: "Terbitkan nomor", exact: true }).click(),
    other.getByRole("button", { name: "Terbitkan nomor", exact: true }).click(),
  ]);
  await expect
    .poll(async () => (await all(page, "mailNumbers")).length)
    .toBe(1);
  await expect
    .poll(
      async () =>
        (await page.getByRole("alert").count()) +
        (await other.getByRole("alert").count()),
    )
    .toBe(1);
  const alerts = await Promise.all([
    page.getByRole("alert").count(),
    other.getByRole("alert").count(),
  ]);
  expect(alerts.reduce((a, b) => a + b, 0)).toBe(1);
  const failed = alerts[0] ? page : other;
  await expect(failed.getByRole("alert")).toContainText("sudah digunakan");
  await failed.getByRole("button", { name: "Mengerti", exact: true }).click();
  await other.close();
  await page.goto("/register-nomor");
  await expect(
    page.getByRole("row").filter({ hasText: "UNIK/CONTOH/2026" }),
  ).toHaveCount(1);
  const exported = page.waitForEvent("download", { timeout: 15000 });
  await page.getByRole("button", { name: "Ekspor CSV", exact: true }).click();
  expect(await readFile((await (await exported).path())!, "utf8")).toContain(
    "UNIK/CONTOH/2026",
  );
  await page
    .getByLabel("Status surat terpadu", { exact: true })
    .selectOption("Digunakan");
  await page
    .getByLabel("Alasan pembatalan nomor", { exact: true })
    .fill("Pembatalan nomor contoh untuk uji register");
  await page
    .getByRole("row")
    .filter({ hasText: "UNIK/CONTOH/2026" })
    .getByRole("button", { name: "Batalkan nomor", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "UNIK/CONTOH/2026" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Status surat terpadu", { exact: true })
    .selectOption("Dibatalkan");
  await expect(
    page.getByRole("row").filter({ hasText: "UNIK/CONTOH/2026" }),
  ).toHaveCount(1);
});
