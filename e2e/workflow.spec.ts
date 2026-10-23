import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("rsas-data-mode", "demo"),
  );
});
test("registrasi → disposisi multiunit → hasil → pemeriksaan → arsip, persistensi, mobile dan cetak", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Selamat datang/ }),
  ).toBeVisible();
  await page.getByLabel("Pilih peran demo").selectOption("user-1");
  await page
    .getByRole("link", { name: "Surat Masuk", exact: false })
    .first()
    .click();
  await page.getByRole("link", { name: "Registrasi surat" }).click();
  await page.getByLabel("Pengirim *").fill("Instansi Uji Browser");
  await page.getByLabel("Nomor surat *").fill("B/E2E/2026");
  await page.getByLabel("Perihal *").fill("Surat uji menyeluruh dua unit");
  await page.getByRole("button", { name: "Lanjutkan" }).click();
  await page.getByLabel("Pilih berkas").setInputFiles({
    name: "bukti.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Lanjutkan" }).click();
  await page.getByRole("button", { name: "Simpan & registrasi" }).click();
  await page
    .getByRole("link", { name: "Surat uji menyeluruh dua unit" })
    .click();
  const detail = page.url();
  await page.getByRole("button", { name: "Ajukan ke pimpinan" }).click();
  await expect(
    page.getByText("Menunggu disposisi", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Pilih peran demo").selectOption("user-2");
  await page
    .getByRole("button", { name: "Buat disposisi", exact: true })
    .click();
  await page.getByLabel("KA SIMRS", { exact: true }).check();
  await page.getByLabel("KA URTU", { exact: true }).check();
  await page.getByLabel("Waka RSAU", { exact: true }).check();
  await page.getByLabel("Jenis penerima Waka RSAU").selectOption("Tembusan");
  await page.getByRole("button", { name: "Periksa disposisi" }).click();
  await page.getByRole("button", { name: "Terbitkan disposisi" }).click();
  await expect(
    page.getByText("0 dari 2 tugas selesai", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Pilih peran demo").selectOption("user-0");
  await page
    .getByRole("button", { name: "Tindak Lanjut", exact: true })
    .click();
  for (let i = 0; i < 2; i++) {
    const card = page.locator(".task-card").nth(i);
    await card.getByRole("button", { name: "Konfirmasi terima" }).click();
    await card.getByRole("button", { name: "Tambah progres" }).click();
    await page.getByLabel("Uraian *", { exact: true }).fill("siap");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Simpan", exact: true })
      .click();
    await expect(card.getByText("Diproses", { exact: true })).toBeVisible();
    await card
      .getByRole("button", { name: "Kirim hasil", exact: true })
      .click();
    await page
      .getByLabel("Uraian tindakan *")
      .fill("Koordinasi telah dilakukan");
    await page
      .getByLabel("Hasil *", { exact: true })
      .fill("Dokumen hasil lengkap");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Simpan", exact: true })
      .click();
    await card.getByRole("button", { name: "Terima hasil" }).click();
    if (i === 0) {
      await page
        .getByRole("button", { name: "Ringkasan", exact: true })
        .click();
      await expect(
        page.getByText("Dalam tindak lanjut", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("1 dari 2 tugas selesai", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Tindak Lanjut", exact: true })
        .click();
    }
  }
  await page.getByRole("button", { name: "Ringkasan", exact: true }).click();
  await expect(
    page.getByText("2 dari 2 tugas selesai", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Arsipkan surat" }).click();
  await expect(page.getByText("Diarsipkan", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Diarsipkan", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "bukti.png" })).toBeVisible();
  await page.getByRole("link", { name: "Cetak disposisi" }).click();
  await expect(
    page.getByRole("heading", { name: "LEMBAR DISPOSISI" }),
  ).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: "test-results/disposisi.pdf", format: "A4" });
  await page.emulateMedia({ media: "screen" });
  await page.goto(detail);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByLabel("Buka navigasi").click();
  await page.getByRole("link", { name: "Tugas Saya" }).click();
  await expect(page.getByRole("heading", { name: "Tugas Saya" })).toBeVisible();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("modul pendukung, filter dashboard, PDF contoh, kalender, master dan laporan", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Selamat datang/ }),
  ).toBeVisible();
  const card = page.locator(".stat").filter({
    has: page.getByRole("heading", {
      name: "Menunggu disposisi",
      exact: true,
    }),
  });
  const count = Number(await card.locator(":scope > strong").textContent());
  await card.click();
  await expect(page.locator("tbody tr")).toHaveCount(count);
  await page
    .getByRole("link", { name: "Undangan rapat koordinasi", exact: true })
    .click();
  const pdfURL = await page
    .locator('object[type="application/pdf"]')
    .getAttribute("data");
  expect(
    await page.evaluate(
      async (url) => (await (await fetch(url!)).text()).slice(0, 8),
      pdfURL,
    ),
  ).toBe("%PDF-1.4");
  await page.goto("/agenda");
  await page
    .getByRole("button", { name: "Tambah kegiatan", exact: false })
    .click();
  await page.getByLabel("Nama kegiatan *").fill("Kegiatan uji browser");
  await page
    .getByRole("button", { name: "Konfirmasi & simpan kegiatan" })
    .click();
  await page.getByRole("button", { name: "Tampilan kalender" }).click();
  await expect(
    page.locator(".month-grid").getByText("Kegiatan uji browser"),
  ).toBeVisible();
  await page.goto("/tugas");
  await page.getByRole("button", { name: "Tampilan Kanban" }).click();
  await expect(page.locator(".kanban-column")).toHaveCount(7);
  await page.goto("/master");
  await page.getByRole("button", { name: "Edit unit" }).first().click();
  await page.getByLabel("Unit aktif", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Nonaktif", { exact: true })).toBeVisible();
  await page.goto("/surat-keluar");
  await page.getByRole("button", { name: "Buat draf", exact: false }).click();
  await page.getByLabel("Perihal *").fill("Balasan uji");
  await page.getByLabel("Penerima *").fill("Mitra Demo");
  await page.getByRole("button", { name: "Simpan draf" }).click();
  const row = page.getByRole("row").filter({ hasText: "Balasan uji" });
  for (const name of [
    "Ajukan pemeriksaan",
    "Setujui pemeriksaan",
    "Persetujuan demo",
    "Terbitkan nomor",
  ])
    await row.getByRole("button", { name, exact: true }).click();
  await row.getByRole("button", { name: "Catat pengiriman & arsip" }).click();
  await page.getByRole("button", { name: "Simpan pengiriman & arsip" }).click();
  await expect(row.getByText("Diarsipkan", { exact: true })).toBeVisible();
  await page.goto("/laporan");
  await page.getByLabel("Jenis laporan").selectOption("Tugas terlambat");
  await expect(
    page.getByRole("heading", { name: /Tugas terlambat/ }),
  ).toBeVisible();
  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor CSV" }).click();
  expect((await csv).suggestedFilename()).toBe("laporan-rsas.csv");
  await page.goto("/pengaturan");
  const backup = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor metadata JSON" }).click();
  expect((await backup).suggestedFilename()).toBe("siminu-rsas-metadata.json");
  await page.goto("/cetak/letter-8");
  await expect(
    page.getByRole("heading", { name: "LEMBAR DISPOSISI" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("siminu-rsas-demo-v2");
      request.onsuccess = () => {
        const database = request.result;
        const tx = database.transaction("dispositions", "readwrite");
        const store = tx.objectStore("dispositions");
        const q = store.index("letterId").getAll("letter-8");
        q.onsuccess = () => {
          const d = q.result[0];
          d.notes =
            Array.from(
              { length: 180 },
              (_, i) =>
                "Catatan panjang baris " +
                (i + 1) +
                " untuk verifikasi halaman lanjutan.",
            ).join("\n") + "\nPENANDA AKHIR CATATAN";
          store.put(d);
        };
        tx.oncomplete = () => {
          database.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await expect(page.locator(".print-notes")).toContainText(
    "PENANDA AKHIR CATATAN",
  );
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: "test-results/disposisi-panjang.pdf", format: "A4" });
  expect(errors).toEqual([]);
});
