import { test, expect, chromium } from "@playwright/test";
const upload = {
  name: "lampiran-offline.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("Bukti lampiran tersimpan tanpa internet — Indonesia"),
};
async function fillLetter(
  page: import("@playwright/test").Page,
  subject: string,
) {
  await page.goto("/surat-masuk/baru");
  await page.getByLabel("Pengirim *").fill("Instansi Uji Offline");
  await page.getByLabel("Nomor surat *").fill("B/" + subject);
  await page.getByLabel("Perihal *").fill(subject);
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page.getByLabel("Pilih berkas").setInputFiles(upload);
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
}
async function records(page: import("@playwright/test").Page) {
  return page.evaluate(
    async () =>
      new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open("siminu-rsas-demo-v2");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("letters");
          const q = tx.objectStore("letters").getAll();
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
          tx.oncomplete = () => db.close();
        };
      }),
  );
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("rsas-data-mode", "demo"),
  );
});
test("build produksi: URL detail, penambahan lampiran, disposisi, tugas, cetak dan ZIP saat offline", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByText("Siap digunakan offline", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Selamat datang/ }),
  ).toBeVisible();
  await page.goto("/surat-masuk/letter-8");
  await expect(
    page.getByRole("heading", { name: "Undangan rapat koordinasi" }),
  ).toBeVisible();
  await page.locator(".global-search input").fill("akreditasi");
  await page.getByRole("button", { name: "Jalankan pencarian" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(8);
  await fillLetter(page, "Surat dibuat saat offline");
  await page.getByRole("button", { name: "Simpan & registrasi" }).click();
  const letter = (await records(page)).find(
    (l) => l.subject === "Surat dibuat saat offline",
  );
  expect(letter).toBeTruthy();
  await page.goto(`/surat-masuk/${letter.id}`);
  await page.getByRole("button", { name: "Ajukan ke pimpinan" }).click();
  await page
    .getByRole("button", { name: "Buat disposisi", exact: true })
    .click();
  await page.getByLabel("KA SIMRS", { exact: true }).check();
  await page.getByLabel("KA URTU", { exact: true }).check();
  await page.getByLabel("Waka RSAU", { exact: true }).check();
  await page.getByLabel("Jenis penerima Waka RSAU").selectOption("Tembusan");
  await page.getByRole("button", { name: "Periksa disposisi" }).click();
  await page.getByRole("button", { name: "Terbitkan disposisi" }).click();
  await page
    .getByRole("button", { name: "Tindak Lanjut", exact: true })
    .click();
  const task = page.locator(".task-card").first();
  await task.getByRole("button", { name: "Konfirmasi terima" }).click();
  await task.getByRole("button", { name: "Tambah progres" }).click();
  await page
    .getByLabel("Uraian *", { exact: true })
    .fill("Progres ketika offline");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Simpan", exact: true })
    .click();
  await expect(task.getByText("Diproses", { exact: true })).toBeVisible();
  await page
    .getByRole("link", { name: "Cetak disposisi", exact: true })
    .click();
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: "test-results/offline-disposisi.pdf", format: "A4" });
  await page.emulateMedia({ media: "screen" });
  await page.goto("/pusat-data");
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat cadangan lengkap ZIP" }).click();
  expect((await wait).suggestedFilename()).toMatch(/\.zip$/);
  await context.setOffline(false);
  await page.goto(`/surat-masuk/${letter.id}`);
  await expect(
    page.getByRole("heading", { name: "Surat dibuat saat offline" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("0 dari 2 tugas selesai", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("dua tab mendapatkan nomor unik; koreksi usang ditolak dan input dipertahankan", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Selamat datang/ }),
  ).toBeVisible();
  const other = await context.newPage();
  await fillLetter(page, "Surat tab pertama");
  await fillLetter(other, "Surat tab kedua");
  await Promise.all([
    page.getByRole("button", { name: "Simpan & registrasi" }).click(),
    other.getByRole("button", { name: "Simpan & registrasi" }).click(),
  ]);
  await expect
    .poll(
      async () =>
        (await records(page)).filter((l) => l.subject.startsWith("Surat tab "))
          .length,
    )
    .toBe(2);
  const saved = (await records(page)).filter((l) =>
    l.subject.startsWith("Surat tab "),
  );
  expect(saved[0].agenda).not.toBe(saved[1].agenda);
  for (const tab of [page, other]) {
    await tab.goto("/surat-masuk/letter-0");
    await tab.getByRole("button", { name: "Koreksi metadata" }).click();
  }
  await page
    .getByRole("dialog")
    .getByLabel("Perihal", { exact: true })
    .fill("Perubahan dari tab pertama");
  await page
    .getByRole("dialog")
    .getByLabel("Alasan perubahan *")
    .fill("Koreksi pertama");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Simpan perubahan" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Perubahan dari tab pertama" }),
  ).toBeVisible();
  await other
    .getByRole("dialog")
    .getByLabel("Perihal", { exact: true })
    .fill("Input tab kedua jangan hilang");
  await other
    .getByRole("dialog")
    .getByLabel("Alasan perubahan *")
    .fill("Edit usang");
  await other
    .getByRole("dialog")
    .getByRole("button", { name: "Simpan perubahan" })
    .click();
  await expect(other.getByRole("alert")).toContainText("Konflik edit");
  await other.getByRole("button", { name: "Mengerti" }).click();
  await expect(other.getByLabel("Perihal", { exact: true })).toHaveValue(
    "Input tab kedua jangan hilang",
  );
  expect((await records(other)).find((l) => l.id === "letter-0").subject).toBe(
    "Perubahan dari tab pertama",
  );
});
test("kegagalan quota mempertahankan formulir dan tidak mengklaim sukses", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Selamat datang/ }),
  ).toBeVisible();
  await fillLetter(page, "Surat gagal quota");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<typeof original>
    ) {
      if (this.name === "attachments")
        throw new DOMException("Penyimpanan penuh", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Simpan & registrasi" }).click();
  await expect(page.getByRole("alert")).toContainText(
    /QuotaExceededError|Penyimpanan penuh/,
  );
  await expect(
    page.getByRole("heading", { name: "Periksa sebelum menyimpan" }),
  ).toBeVisible();
  expect(
    (await records(page)).some((l) => l.subject === "Surat gagal quota"),
  ).toBe(false);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor draf metadata" }).click();
  expect((await downloaded).suggestedFilename()).toBe("draf-surat.json");
});
test("profil browser yang sama memulihkan lampiran setelah browser dimulai ulang, termasuk offline", async ({}, info) => {
  test.setTimeout(60000);
  const options = {
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  };
  const profile = info.outputPath("persistent-profile");
  let context = await chromium.launchPersistentContext(profile, options);
  let page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/");
  await page.evaluate(() => localStorage.setItem("rsas-data-mode", "demo"));
  await page.reload();
  await expect(
    page.getByText("Siap digunakan offline", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await fillLetter(page, "Surat bertahan restart browser");
  await page.getByRole("button", { name: "Simpan & registrasi" }).click();
  await expect
    .poll(async () =>
      (await records(page)).some(
        (l) => l.subject === "Surat bertahan restart browser",
      ),
    )
    .toBe(true);
  const letter = (await records(page)).find(
    (l) => l.subject === "Surat bertahan restart browser",
  );
  await context.close();
  context = await chromium.launchPersistentContext(profile, {
    ...options,
    offline: true,
  });
  page = await context.newPage();
  await page.goto(`http://127.0.0.1:4173/surat-masuk/${letter.id}`);
  await expect(
    page.getByRole("heading", { name: "Surat bertahan restart browser" }),
  ).toBeVisible();
  const fileText = await page.evaluate(
    async (aid) =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open("siminu-rsas-demo-v2");
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction("attachments");
          const q = tx.objectStore("attachments").get(aid);
          q.onsuccess = async () => resolve(await q.result.blob.text());
          q.onerror = () => reject(q.error);
          tx.oncomplete = () => database.close();
        };
      }),
    letter.attachmentIds[0],
  );
  expect(fileText).toContain("Bukti lampiran tersimpan tanpa internet");
  await context.close();
});

test("ZIP lengkap pulih melalui UI dengan cadangan otomatis sebelum penggantian", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Selamat datang/ }),
  ).toBeVisible();
  await page.goto("/pusat-data");
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat cadangan lengkap ZIP" }).click();
  const download = await waiting;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.getByLabel("Pilih cadangan lengkap ZIP").setInputFiles(path!);
  await expect(page.getByRole("dialog")).toContainText("32 berkas asli");
  await page.getByLabel("Cara pemulihan").selectOption("replace");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Konfirmasi pemulihan" }).click();
  await expect(page.getByText(/Pemulihan selesai:/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Unduh cadangan pemulihan" }),
  ).toBeVisible();
  expect(await records(page)).toHaveLength(32);
});

test("reset contoh terpisah tidak menghapus data lokal; tablet dan navigasi keyboard", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 820, height: 1100 },
  });
  try {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4173/");
    await expect(
      page.getByRole("heading", { name: /Selamat datang/ }),
    ).toBeVisible();
    await fillLetter(page, "Surat pengguna jangan dihapus");
    await page.getByRole("button", { name: "Simpan & registrasi" }).click();
    await expect(
      page.getByRole("heading", { name: "Surat Masuk", exact: true }),
    ).toBeVisible();
    await page.goto("http://127.0.0.1:4173/uji-coba");
    await page.getByRole("button", { name: "Buka mode data contoh" }).click();
    await expect(
      page.getByText("Mode aktif: Data contoh", { exact: true }),
    ).toBeVisible();
    await page.goto("http://127.0.0.1:4173/pengaturan");
    await page.getByLabel("Ketik RESET untuk konfirmasi").fill("RESET");
    await page
      .getByRole("button", { name: "Hapus & buat ulang data demo" })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Data contoh terpisah direset." }),
    ).toBeVisible();
    await page.goto("http://127.0.0.1:4173/uji-coba");
    await page
      .getByRole("button", { name: "Buka mode data lokal pengguna" })
      .click();
    await expect(
      page.getByText("Mode aktif: Data lokal pengguna", { exact: true }),
    ).toBeVisible();
    await page.goto("http://127.0.0.1:4173/surat-masuk");
    await expect(
      page.getByRole("link", { name: "Surat pengguna jangan dihapus" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Surat pengguna jangan dihapus" })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Surat pengguna jangan dihapus" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "test-results/tablet.png", fullPage: true });
  } finally {
    await context.close();
  }
});
