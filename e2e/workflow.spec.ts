import { test, expect } from "@playwright/test";
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
  await page
    .getByLabel("Pilih berkas")
    .setInputFiles({
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
