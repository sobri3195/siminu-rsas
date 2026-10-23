import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("rsas-data-mode", "demo"),
  );
});
async function all(page: Page, table: string): Promise<any[]> {
  return page.evaluate(
    (table) =>
      new Promise<any[]>((resolve, reject) => {
        const r = indexedDB.open("siminu-rsas-demo-v2");
        r.onsuccess = () => {
          const d = r.result,
            tx = d.transaction(table),
            q = tx.objectStore(table).getAll();
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
          tx.oncomplete = () => d.close();
        };
      }),
    table,
  );
}
async function ready(page: Page) {
  await page.goto("/nota-dinas");
  await expect(
    page.getByText("Siap digunakan offline", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}
async function create(page: Page) {
  await page
    .getByRole("button", { name: "Buat nota dinas", exact: true })
    .click();
  await page.getByLabel("Unit konsep", { exact: true }).selectOption("unit-19");
  await page.getByRole("button", { name: "Buka editor nota" }).click();
  await page
    .getByLabel("Perihal", { exact: true })
    .fill("Permohonan pengembangan SIMINU RSAS");
  await page
    .getByLabel("Dasar 1", { exact: true })
    .fill("Catatan kebutuhan administrasi tim IT (contoh dari pengguna).");
  await page.getByRole("button", { name: "Tambah dasar", exact: true }).click();
  await page
    .getByLabel("Dasar 2", { exact: true })
    .fill("Hasil diskusi kebutuhan fitur yang dimasukkan pengguna (contoh).");
  await page
    .getByLabel("Pembukaan", { exact: true })
    .fill("Bersama ini disampaikan usulan pengembangan SIMINU RSAS.");
  await page
    .getByLabel("Uraian atau pembahasan", { exact: true })
    .fill(
      "**Kebutuhan sistem** dirangkum sebagai berikut.\n1. Pencatatan nota dinas.\n2. Pemeriksaan dan arsip.\na. Dukungan _offline_.\n| Modul | Kebutuhan |\n| --- | --- |\n| Nota Dinas | Simpan lokal |\n| Arsip | Cadangan lengkap |",
    );
  await page
    .getByLabel("Permohonan atau rekomendasi", { exact: true })
    .fill("Mohon arahan dan penilaian atas usulan yang disampaikan.");
  await page
    .getByLabel("Tanggal penandatanganan", { exact: true })
    .fill("2026-10-23");
  await expect
    .poll(async () => (await all(page, "notes"))[0]?.content.signer.date)
    .toBe("2026-10-23");
  await expect(
    page.getByRole("button", { name: "Simpan sekarang", exact: true }),
  ).toBeDisabled();
}
test("nota dinas lengkap offline: enam screenshot, kembali/perbaiki/setujui/nomor, DOCX, cetak, register, arsip dan pemulihan ZIP", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith("http://127.0.0.1:4173")
    )
      external.push(r.url());
  });
  await ready(page);
  await context.setOffline(true);
  const screenshots: Buffer[] = [];
  for (const path of [
    "/",
    "/surat-masuk",
    "/tugas",
    "/agenda",
    "/surat-keluar",
    "/pencarian",
  ]) {
    await page.goto(path);
    await expect(page.locator(".boot")).toHaveCount(0);
    screenshots.push(await page.screenshot());
  }
  await page.goto("/nota-dinas");
  await create(page);
  await page.getByLabel("Tambah berkas lampiran").setInputFiles(
    screenshots.map((buffer, i) => ({
      name: "tangkapan-layar-" + (i + 1) + ".png",
      mimeType: "image/png",
      buffer,
    })),
  );
  for (let i = 1; i <= 6; i++)
    await page
      .getByLabel("Keterangan lampiran " + i, { exact: true })
      .fill("Tampilan modul contoh " + i + " untuk pembahasan kebutuhan.");
  await expect
    .poll(
      async () =>
        (await all(page, "notes"))[0]?.content.attachments[5]?.caption,
    )
    .toContain("modul contoh 6");
  await page.reload();
  await expect(page.getByLabel("Dasar 2", { exact: true })).toHaveValue(
    /Hasil diskusi/,
  );
  await expect(
    page.getByLabel("Keterangan lampiran 6", { exact: true }),
  ).toHaveValue(/modul contoh 6/);
  await expect(page.locator(".nota-paper img")).toHaveCount(6);
  await page.getByLabel("Urutan pemeriksa nota").selectOption(["user-3"]);
  await page
    .getByRole("button", { name: "Ajukan pemeriksaan nota", exact: true })
    .click();
  await page.getByLabel("Pilih peran demo").selectOption("user-3");
  await page
    .getByRole("button", { name: "Mulai pemeriksaan", exact: true })
    .click();
  await page.getByLabel("Bagian yang diberi catatan").selectOption("Uraian");
  await page
    .getByLabel("Catatan tindakan nota")
    .fill("Tambahkan rencana uji offline.");
  await page.getByRole("button", { name: "Simpan catatan bagian" }).click();
  await page
    .getByLabel("Catatan tindakan nota")
    .fill("Rincikan rencana pengujian.");
  await page
    .getByRole("button", { name: "Kembalikan untuk perbaikan", exact: true })
    .click();
  await page.getByLabel("Pilih peran demo").selectOption("user-0");
  await page
    .getByLabel("Uraian atau pembahasan", { exact: true })
    .fill(
      (await page
        .getByLabel("Uraian atau pembahasan", { exact: true })
        .inputValue()) + "\nUji offline mencakup draf hingga cadangan.",
    );
  await expect
    .poll(async () => (await all(page, "notes"))[0]?.content.discussion)
    .toContain("Uji offline");
  await page
    .getByRole("button", { name: "Ajukan pemeriksaan nota", exact: true })
    .click();
  await page.getByLabel("Pilih peran demo").selectOption("user-3");
  await page
    .getByRole("button", { name: "Pemeriksaan selesai", exact: true })
    .click();
  await page.getByLabel("Pilih peran demo").selectOption("user-2");
  await page
    .getByRole("button", {
      name: "Setujui versi terbaru (simulasi)",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Perihal", { exact: true })).toBeDisabled();
  await page.getByLabel("Pilih peran demo").selectOption("user-1");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Beri nomor resmi", exact: true })
    .click();
  await expect
    .poll(async () => (await all(page, "notes"))[0]?.officialNumber)
    .toMatch(/^B\/ND-0001\/X\/2026\/IT$/);
  await page
    .getByRole("button", { name: "Daftarkan ke Surat Keluar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Daftarkan ke Surat Keluar", exact: true })
    .click();
  const n = (await all(page, "notes"))[0];
  expect(
    (await all(page, "outgoing")).filter((o) => o.noteId === n.id),
  ).toHaveLength(1);
  const down = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor DOCX", exact: true }).click();
  const doc = await down;
  await doc.saveAs("test-results/nota-dinas-rsas.docx");
  const entries = unzipSync(await readFile((await doc.path())!)),
    xml = strFromU8(entries["word/document.xml"]);
  expect(xml).toContain("SIMINU RSAS");
  expect(xml).toContain("w:tblHeader");
  expect(xml).toContain("w:keepNext");
  expect(xml).toContain("Gambar 6.");
  expect(xml).toContain("CONTOH/DEMO");
  expect(
    Object.keys(entries).filter(
      (k) => k.startsWith("word/media/") && k.endsWith(".png"),
    ),
  ).toHaveLength(6);
  await page
    .getByRole("button", { name: "Pratinjau penuh", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator(".nota-paper img")
        .evaluateAll((images) =>
          images.every((i) => (i as HTMLImageElement).complete),
        ),
    )
    .toBe(true);
  await page.screenshot({ path: "test-results/nota-dinas-desktop.png" });
  expect(
    await page
      .locator(".nota-paper p")
      .first()
      .evaluate((el) =>
        Math.round(
          (parseFloat(getComputedStyle(el).lineHeight) /
            parseFloat(getComputedStyle(el).fontSize)) *
            100,
        ),
      ),
  ).toBe(115);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".nota-form")).toBeHidden();
  expect(
    await page
      .locator(".nota-signature")
      .evaluate((el) => getComputedStyle(el).breakInside),
  ).toBe("avoid");
  await page.pdf({
    path: "test-results/nota-dinas-rsas.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page
    .getByRole("button", { name: "Kembali ke editor", exact: true })
    .click();
  await page
    .getByLabel("Saluran pengiriman manual")
    .fill("Penyerahan langsung (contoh)");
  await page
    .getByLabel("Catatan tindakan nota")
    .fill("Catatan penerimaan sekretariat contoh.");
  await page
    .getByRole("button", { name: "Catat pengiriman manual", exact: true })
    .click();
  await page.getByLabel("Pilih peran demo").selectOption("user-0");
  await page
    .getByRole("button", { name: "Arsipkan nota", exact: true })
    .click();
  await expect
    .poll(async () => (await all(page, "notes"))[0]?.status)
    .toBe("Diarsipkan");
  await page.goto("/pusat-data");
  const backupWait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Buat cadangan lengkap ZIP", exact: true })
    .click();
  const backup = await backupWait;
  const backupPath = (await backup.path())!;
  await page.getByLabel("Pilih cadangan lengkap ZIP").setInputFiles(backupPath);
  await page.getByLabel("Cara pemulihan").selectOption("replace");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Konfirmasi pemulihan", exact: true })
    .click();
  await expect(page.getByText(/Pemulihan selesai:/)).toBeVisible();
  expect(await all(page, "letters")).toHaveLength(32);
  expect((await all(page, "notes"))[0].content.attachments).toHaveLength(6);
  expect(
    (await all(page, "noteReviews")).some(
      (r) => r.note === "Rincikan rencana pengujian.",
    ),
  ).toBe(true);
  await page.goto("/nota-dinas/" + n.id);
  await expect(page.locator(".nota-paper img")).toHaveCount(6);
  expect(external).toEqual([]);
});
test("konflik dua tab mempertahankan input lokal; template butuh konfirmasi dan mobile memiliki tab pratinjau", async ({
  page,
  context,
}) => {
  await ready(page);
  await create(page);
  const url = page.url();
  const second = await context.newPage();
  await second.goto(url);
  await page
    .getByLabel("Perihal", { exact: true })
    .fill("Perubahan terbaru tab pertama");
  await expect
    .poll(async () => (await all(page, "notes"))[0]?.content.subject)
    .toBe("Perubahan terbaru tab pertama");
  await second
    .getByLabel("Perihal", { exact: true })
    .fill("Input tab kedua jangan hilang");
  await expect(
    second.getByRole("status").filter({ hasText: "Gagal menyimpan:" }),
  ).toBeVisible();
  await expect(second.getByLabel("Perihal", { exact: true })).toHaveValue(
    "Input tab kedua jangan hilang",
  );
  expect((await all(page, "notes"))[0]?.content.subject).toBe(
    "Perubahan terbaru tab pertama",
  );
  await second.close();
  await page.getByLabel("Ganti template isi").selectOption("nota-template-0");
  await page
    .getByRole("button", { name: "Pratinjau penggantian template" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Permohonan pengembangan sistem",
  );
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(page.getByLabel("Perihal", { exact: true })).toHaveValue(
    "Perubahan terbaru tab pertama",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Pratinjau", exact: true }).click();
  await expect(page.locator(".nota-form")).toBeHidden();
  await expect(page.locator(".nota-paper")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((el) => el.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  await page.locator(".nota-preview").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/nota-dinas-mobile.png" });
  await page.getByRole("tab", { name: "Isi", exact: true }).click();
  await expect(page.getByLabel("Perihal", { exact: true })).toBeVisible();
});
test("dua tab memberi nomor nota berbeda bersamaan tanpa duplikasi dan tidak menggunakan ulang nomor yang dibatalkan", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await ready(page);
  const urls: string[] = [];
  for (let i = 0; i < 2; i++) {
    await page.goto("/nota-dinas");
    await create(page);
    await page.getByLabel("Urutan pemeriksa nota").selectOption(["user-0"]);
    await page
      .getByRole("button", { name: "Ajukan pemeriksaan nota", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Pemeriksaan selesai", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Setujui versi terbaru (simulasi)",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Beri nomor resmi", exact: true }),
    ).toBeEnabled();
    urls.push(page.url());
  }
  const second = await context.newPage();
  await page.goto(urls[0]);
  await second.goto(urls[1]);
  page.once("dialog", (d) => d.accept());
  second.once("dialog", (d) => d.accept());
  await Promise.all([
    page.getByRole("button", { name: "Beri nomor resmi", exact: true }).click(),
    second
      .getByRole("button", { name: "Beri nomor resmi", exact: true })
      .click(),
  ]);
  await expect
    .poll(async () => (await all(page, "noteNumbers")).length)
    .toBe(2);
  const notes = await all(page, "notes");
  expect(new Set(notes.map((n) => n.officialNumber)).size).toBe(2);
  await page
    .getByLabel("Catatan tindakan nota")
    .fill("Kebutuhan dibatalkan pada pengujian.");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Batalkan dengan alasan", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await all(page, "notes")).find(
          (n) => n.id === urls[0].split("/").pop(),
        )?.status,
    )
    .toBe("Dibatalkan");
  expect(await all(page, "noteNumbers")).toHaveLength(2);
});
test("konsep dari surat mempertahankan hubungan; tempelan Word aman dan transformasi gambar tidak mengubah berkas asli", async ({
  page,
}) => {
  await ready(page);
  await page.goto("/surat-masuk/letter-0");
  await page
    .getByRole("link", { name: "Buat nota dinas dari surat", exact: true })
    .click();
  await page.getByLabel("Unit konsep", { exact: true }).selectOption("unit-19");
  await page.getByRole("button", { name: "Buka editor nota" }).click();
  await expect(page.getByLabel("Surat masuk terkait")).toHaveValue("letter-0");
  await page
    .getByLabel("Uraian atau pembahasan", { exact: true })
    .evaluate((el) => {
      const clipboard = new DataTransfer();
      clipboard.setData("text/plain", "Isi polos **tebal**");
      clipboard.setData(
        "text/html",
        '<p style="font-size:99px;color:red">Isi polos <b>tebal</b><script>alert(1)</script></p>',
      );
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: clipboard,
        }),
      );
    });
  await expect(
    page.getByLabel("Uraian atau pembahasan", { exact: true }),
  ).toHaveValue("Isi polos **tebal**");
  const original = await page.locator(".nota-paper").screenshot();
  await page.getByLabel("Tambah berkas lampiran").setInputFiles({
    name: "pilihan-pengguna.png",
    mimeType: "image/png",
    buffer: original,
  });
  await page.getByLabel("Rotasi gambar 1", { exact: true }).selectOption("90");
  await page
    .getByText("Crop gambar 1 (tindakan manual)", { exact: true })
    .click();
  await page.getByLabel("Crop atas gambar 1 (%)", { exact: true }).fill("10");
  await expect
    .poll(
      async () =>
        (await all(page, "notes"))[0]?.content.attachments[0]?.crop.top,
    )
    .toBe(10);
  const downloadWait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Unduh asli lampiran 1", exact: true })
    .click();
  const file = await downloadWait;
  expect(await readFile((await file.path())!)).toEqual(original);
  await page.getByLabel("Ganti template isi").selectOption("nota-template-0");
  await page
    .getByRole("button", { name: "Pratinjau penggantian template" })
    .click();
  await page
    .getByRole("button", { name: "Konfirmasi ganti isi template", exact: true })
    .click();
  await expect(page.getByLabel("Perihal", { exact: true })).toHaveValue(
    /\[isi perihal\]/,
  );
  await page.getByLabel("Urutan pemeriksa nota").selectOption(["user-3"]);
  await expect(
    page.getByRole("button", { name: "Ajukan pemeriksaan nota", exact: true }),
  ).toBeDisabled();
  expect(await page.locator(".nota-paper script").count()).toBe(0);
});
