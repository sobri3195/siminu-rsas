import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
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
  await page.goto("/disposisi");
  await expect(
    page.getByText("Siap digunakan offline", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}
async function example(page: Page) {
  await page
    .getByRole("button", { name: "Siapkan contoh digital", exact: true })
    .click();
  await expect(page.getByLabel("Catatan arahan", { exact: true })).toHaveValue(
    /CONTOH/,
  );
}
async function publish(page: Page) {
  await page
    .getByRole("button", { name: "Tinjau penerbitan", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Konfirmasi terbitkan disposisi",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/disposisi\/[a-f0-9-]+$/);
  return page.url().split("/").pop()!;
}
async function role(page: Page, uid: string) {
  await page.getByLabel("Pilih peran demo").selectOption(uid);
}
async function progress(page: Page) {
  await page
    .getByRole("tab", { name: "Penerima dan progres", exact: true })
    .click();
}
function card(page: Page, uid: string) {
  return page.getByTestId("digital-task-" + uid);
}
async function report(page: Page, uid: string, result: string, file?: Buffer) {
  const c = card(page, uid);
  await c
    .getByLabel("Uraian tindakan", { exact: true })
    .fill("Tindak lanjut arahan");
  await c.getByLabel("Hasil pekerjaan", { exact: true }).fill(result);
  if (file)
    await c
      .getByLabel("Bukti hasil (maksimal 20 MB per berkas)", { exact: true })
      .setInputFiles({
        name: "bukti-lokal.png",
        mimeType: "image/png",
        buffer: file,
      });
  await c
    .getByRole("button", { name: "Kirim laporan hasil", exact: true })
    .click();
  await expect(
    c.getByText("Hasil dikirim", { exact: true }).first(),
  ).toBeVisible();
}
test("alur digital offline: draf, terbit, URTU delegasi, SIMRS perbaikan, hasil selesai, cetak, arsip dan ZIP", async ({
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
  await example(page);
  await page
    .getByLabel("Catatan arahan", { exact: true })
    .fill("CONTOH: URTU, SIMRS dan Mutu. Simpan draf setelah reload.");
  await expect
    .poll(async () => (await all(page, "dispositionDrafts"))[0]?.content.notes)
    .toContain("setelah reload");
  await page.reload();
  await expect(page.getByLabel("Catatan arahan", { exact: true })).toHaveValue(
    /setelah reload/,
  );
  await page.goto("/cetak-disposisi/draf/digital-example-draft");
  await expect(page.locator(".digital-print-sheet")).toContainText(
    "DRAF — BELUM DITERBITKAN",
  );
  await page.pdf({
    path: "test-results/disposisi-digital-draf.pdf",
    preferCSSPageSize: true,
  });
  await page.goto("/disposisi/draf/digital-example-draft");
  const did = await publish(page);
  const ds = (await all(page, "dispositions")).find((d) => d.id === did);
  expect(ds.issuerId).toBe("user-2");
  expect(
    (await all(page, "tasks")).filter((t) => t.dispositionId === did),
  ).toHaveLength(2);
  expect(
    (await all(page, "recipientReceipts")).filter(
      (r) => r.dispositionId === did && r.readAt,
    ),
  ).toHaveLength(0);
  await role(page, "digital-urtu");
  await progress(page);
  await expect
    .poll(
      async () =>
        (await all(page, "recipientReceipts")).filter(
          (r) => r.dispositionId === did && r.readAt,
        ).length,
    )
    .toBe(1);
  const urtu = card(page, "digital-urtu");
  await urtu
    .getByRole("button", { name: "Konfirmasi terima", exact: true })
    .click();
  await urtu.getByText("Delegasi pekerjaan", { exact: true }).click();
  await urtu
    .getByLabel("Penerima delegasi", { exact: true })
    .selectOption("digital-pelaksana");
  await urtu
    .getByLabel("Instruksi delegasi", { exact: true })
    .fill("Siapkan bahan koordinasi");
  await urtu
    .getByLabel("Catatan tugas / alasan", { exact: true })
    .fill("Pembagian pekerjaan kepada pelaksana");
  await urtu
    .getByRole("button", { name: "Terbitkan delegasi", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await all(page, "tasks")).filter((t) => t.dispositionId === did)
          .length,
    )
    .toBe(3);
  expect(
    (await all(page, "tasks")).find(
      (t) => t.dispositionId === did && t.userId === "digital-urtu",
    ).status,
  ).toBe("Diterima");
  await role(page, "digital-pelaksana");
  const child = card(page, "digital-pelaksana");
  await child
    .getByRole("button", { name: "Konfirmasi terima", exact: true })
    .click();
  const proof = await page.screenshot();
  await report(
    page,
    "digital-pelaksana",
    "Bahan pelaksana tersedia offline",
    proof,
  );
  await role(page, "digital-urtu");
  await child
    .getByRole("button", { name: "Terima hasil", exact: true })
    .click();
  await report(page, "digital-urtu", "Hasil bawahan telah dikonsolidasikan");
  await role(page, "user-3");
  const simrs = card(page, "user-3");
  await simrs
    .getByRole("button", { name: "Konfirmasi terima", exact: true })
    .click();
  await report(page, "user-3", "Hasil pemeriksaan awal SIMRS");
  await role(page, "user-2");
  await simrs
    .getByLabel("Catatan tugas / alasan", { exact: true })
    .fill("Tambahkan bukti hasil uji");
  await simrs
    .getByRole("button", { name: "Kembalikan hasil", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await all(page, "tasks")).find(
          (t) => t.dispositionId === did && t.userId === "user-3",
        )?.status,
    )
    .toBe("Perlu perbaikan");
  await role(page, "user-3");
  await report(page, "user-3", "Perbaikan SIMRS beserta bukti", proof);
  await role(page, "user-2");
  await simrs
    .getByRole("button", { name: "Terima hasil", exact: true })
    .click();
  await urtu.getByRole("button", { name: "Terima hasil", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await all(page, "letters")).find((l) => l.id === ds.letterId)?.status,
    )
    .toBe("Selesai");
  expect(
    (await all(page, "recipientReceipts")).find(
      (r) => r.dispositionId === did && r.userId === "digital-mutu",
    )?.readAt,
  ).toBeUndefined();
  const supportTask = (await all(page, "tasks")).find(
    (t) => t.dispositionId === did && t.userId === "user-3",
  );
  expect(
    (await all(page, "reports")).filter((r) => r.taskId === supportTask.id),
  ).toHaveLength(2);
  await role(page, "user-0");
  await page
    .getByRole("button", { name: "Arsipkan surat sumber", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await all(page, "letters")).find((l) => l.id === ds.letterId)?.status,
    )
    .toBe("Diarsipkan");
  await page.getByRole("tab", { name: "Arahan", exact: true }).click();
  await page.screenshot({ path: "test-results/disposisi-digital-desktop.png" });
  await page.goto("/cetak-disposisi/" + did + "?version=1");
  await expect(
    page.getByRole("heading", { name: "LEMBAR DISPOSISI", exact: true }),
  ).toBeVisible();
  await page.pdf({
    path: "test-results/disposisi-digital.pdf",
    preferCSSPageSize: true,
  });
  await page.goto("/pusat-data");
  const down = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Buat cadangan lengkap ZIP", exact: true })
    .click();
  const backup = await down;
  await backup.saveAs("test-results/disposisi-digital-cadangan.zip");
  await page
    .getByLabel("Pilih cadangan lengkap ZIP")
    .setInputFiles((await backup.path())!);
  await page.getByLabel("Cara pemulihan").selectOption("replace");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Konfirmasi pemulihan", exact: true })
    .click();
  await expect(page.getByText(/Pemulihan selesai:/)).toBeVisible();
  expect(
    (await all(page, "tasks")).filter((t) => t.dispositionId === did),
  ).toHaveLength(3);
  await page.goto("/disposisi/" + did);
  await progress(page);
  const wait = page.waitForEvent("download");
  await card(page, "digital-pelaksana")
    .getByRole("button", { name: "Unduh bukti bukti-lokal.png", exact: true })
    .click();
  const original = await wait;
  expect(await readFile((await original.path())!)).toEqual(proof);
  expect(external).toEqual([]);
});
test("konflik dua tab, revisi penerima/instruksi, perpanjangan dan pembatalan mempertahankan versi", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await ready(page);
  await example(page);
  const did = await publish(page);
  await page
    .getByRole("button", { name: "Buat revisi arahan", exact: true })
    .click();
  await expect(page).toHaveURL(/\/disposisi\/draf\//);
  const draftUrl = page.url(),
    second = await context.newPage();
  await second.goto(draftUrl);
  await page
    .getByLabel("Catatan arahan", { exact: true })
    .fill("Catatan baru tab utama");
  await expect
    .poll(
      async () =>
        (await all(page, "dispositionDrafts")).find(
          (d) => d.id === draftUrl.split("/").pop(),
        )?.content.notes,
    )
    .toBe("Catatan baru tab utama");
  await second
    .getByLabel("Catatan arahan", { exact: true })
    .fill("Input tab kedua tetap tersimpan di formulir");
  await expect(
    second.getByRole("status").filter({ hasText: "Gagal menyimpan:" }),
  ).toBeVisible();
  await expect(
    second.getByLabel("Catatan arahan", { exact: true }),
  ).toHaveValue("Input tab kedua tetap tersimpan di formulir");
  await second.close();
  await page
    .getByLabel("Instruksi penerima 1", { exact: true })
    .fill("Instruksi material yang diperbarui");
  await page
    .getByRole("button", { name: "Lepas penerima 2", exact: true })
    .click();
  await page
    .getByLabel("Pilih penerima digital", { exact: true })
    .selectOption("digital-pelaksana");
  await page
    .getByLabel("Peran penerima baru", { exact: true })
    .selectOption("Pendukung");
  await page
    .getByRole("button", { name: "Tambahkan penerima", exact: true })
    .click();
  await page
    .getByLabel("Alasan revisi disposisi", { exact: true })
    .fill("Kebutuhan berubah");
  await publish(page);
  await expect
    .poll(
      async () =>
        (await all(page, "dispositions")).find((d) => d.id === did)?.version,
    )
    .toBe(2);
  const tasks = await all(page, "tasks");
  expect(
    tasks.find((t) => t.dispositionId === did && t.userId === "user-3").status,
  ).toBe("Dibatalkan");
  expect(
    tasks.find((t) => t.dispositionId === did && t.userId === "digital-urtu")
      .reconfirmRequired,
  ).toBe(true);
  await progress(page);
  const urtu = card(page, "digital-urtu");
  await urtu.getByText("Perpanjangan tenggat", { exact: true }).click();
  await urtu.getByLabel("Tenggat baru", { exact: true }).fill("2099-12-31");
  await urtu
    .getByLabel("Catatan tugas / alasan", { exact: true })
    .fill("Perpanjangan untuk uji jadwal");
  await urtu
    .getByRole("button", { name: "Simpan perpanjangan tenggat", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await all(page, "dispositions")).find((d) => d.id === did)?.version,
    )
    .toBe(3);
  await page
    .getByRole("button", { name: "Batalkan disposisi digital", exact: true })
    .click();
  await page
    .getByLabel("Alasan pembatalan digital", { exact: true })
    .fill("Arahan tidak diperlukan lagi");
  await page
    .getByRole("button", {
      name: "Saya sudah meninjau revisi terbaru",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Konfirmasi batalkan digital", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await all(page, "dispositions")).find((d) => d.id === did)?.cancelled,
    )
    .toBe(true);
  expect(
    (await all(page, "dispositionVersions")).filter(
      (v) => v.dispositionId === did,
    ),
  ).toHaveLength(4);
  await page.goto("/cetak-disposisi/" + did + "?version=1");
  await expect(page.locator(".digital-print-sheet")).toContainText(
    "VERSI HISTORIS — BUKAN VERSI AKTIF",
  );
});
test("informasi tanpa tugas, sumber Nota Dinas/agenda idempoten, laporan aktual, dan tab mobile", async ({
  page,
}) => {
  test.setTimeout(60000);
  await ready(page);
  await example(page);
  await page
    .getByLabel("Jenis arahan", { exact: true })
    .selectOption("Untuk diketahui");
  for (let i = 1; i <= 3; i++)
    await page
      .getByLabel("Peran penerima " + i, { exact: true })
      .selectOption("Tembusan");
  const did = await publish(page);
  expect(
    (await all(page, "tasks")).filter((t) => t.dispositionId === did),
  ).toHaveLength(0);
  await role(page, "digital-mutu");
  await progress(page);
  await expect
    .poll(
      async () =>
        (await all(page, "recipientReceipts")).filter(
          (r) => r.dispositionId === did && r.readAt,
        ).length,
    )
    .toBe(1);
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", { name: "Buat Nota Dinas hasil", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Konfirmasi buat Nota Dinas", exact: true })
      .click();
    await expect(page).toHaveURL(/nota-dinas\//);
    await page.goto("/disposisi/" + did);
  }
  expect(
    (await all(page, "notes")).filter((n) => n.content.dispositionId === did),
  ).toHaveLength(1);
  await page
    .getByRole("button", { name: "Buat agenda dari arahan", exact: true })
    .click();
  await page
    .getByLabel("Judul agenda dari disposisi")
    .fill("Agenda hasil arahan");
  await page.getByLabel("Tanggal agenda", { exact: true }).fill("2026-10-23");
  await page.getByLabel("Mulai agenda").fill("09:00");
  await page.getByLabel("Selesai agenda").fill("10:00");
  await page.getByLabel("Lokasi agenda").fill("Ruang contoh");
  await page
    .getByRole("button", { name: "Konfirmasi buat agenda", exact: true })
    .click();
  await expect(page).toHaveURL(/\/agenda$/);
  expect(
    (await all(page, "events")).filter((e) => e.dispositionId === did),
  ).toHaveLength(1);
  await page.goto("/laporan-disposisi");
  await expect(
    page.getByRole("heading", {
      name: "Laporan Disposisi Digital",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Median: Belum ada observasi lengkap", { exact: true })
      .first(),
  ).toBeVisible();
  await page.goto("/disposisi/" + did);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Dokumen", exact: true }).click();
  await expect(page.locator(".digital-directions")).toBeHidden();
  await expect(page.locator(".digital-document")).toBeVisible();
  await page.locator(".digital-document").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/disposisi-digital-mobile.png" });
  await page.getByRole("tab", { name: "Disposisi", exact: true }).click();
  await expect(page.locator(".digital-directions")).toBeVisible();
});
test("cetakan versi dengan catatan panjang mempertahankan penanda akhir dan rincian penerima", async ({
  page,
}) => {
  await ready(page);
  await example(page);
  await page
    .getByLabel("Catatan arahan", { exact: true })
    .fill(
      Array.from(
        { length: 70 },
        (_, i) =>
          "Baris catatan " +
          (i + 1) +
          ". Koordinasikan pekerjaan dengan unit terkait.",
      ).join("\n") + "\nPENANDA AKHIR CATATAN",
    );
  const did = await publish(page);
  await page.goto("/cetak-disposisi/" + did + "?version=1");
  await expect(page.locator(".digital-print-sheet")).toContainText(
    "PENANDA AKHIR CATATAN",
  );
  await page.pdf({
    path: "test-results/disposisi-digital-panjang.pdf",
    preferCSSPageSize: true,
  });
});
