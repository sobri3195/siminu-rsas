import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
test("pembaruan service worker menunggu formulir disimpan dan menjaga draf", async ({
  browser,
}) => {
  test.setTimeout(60000);
  let revision = 1;
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url!, "http://localhost").pathname;
      let file = path === "/" ? "index.html" : path.slice(1);
      if (file.includes("..")) {
        res.writeHead(400);
        res.end();
        return;
      }
      let data: Buffer;
      try {
        data = await readFile(join(process.cwd(), "dist", file));
      } catch {
        file = "index.html";
        data = await readFile(join(process.cwd(), "dist", file));
      }
      const types: Record<string, string> = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".webmanifest": "application/manifest+json",
      };
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(
        file === "sw.js"
          ? Buffer.concat([Buffer.from(`// test release ${revision}\n`), data])
          : data,
      );
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const base = `http://127.0.0.1:${address.port}`;
    await page.goto(base);
    await expect(
      page.getByText("Siap digunakan offline", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await page.goto(base + "/surat-masuk/baru");
    await page.getByLabel("Pengirim *").fill("Draf harus dipertahankan");
    revision = 2;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    await expect(
      page.getByRole("button", { name: "Versi baru tersedia · Perbarui" }),
    ).toBeVisible({ timeout: 20000 });
    await page
      .getByRole("button", { name: "Versi baru tersedia · Perbarui" })
      .click();
    await expect(
      page.getByText(
        "Simpan atau ekspor formulir terlebih dahulu sebelum memperbarui aplikasi.",
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Pengirim *")).toHaveValue(
      "Draf harus dipertahankan",
    );
    page.once("dialog", (d) => d.accept());
    await page.getByRole("link", { name: "Kembali ke daftar" }).click();
    await Promise.all([
      page.waitForEvent("load"),
      page
        .getByRole("button", { name: "Versi baru tersedia · Perbarui" })
        .click(),
    ]);
    await page.goto(base + "/surat-masuk/baru");
    await expect(page.getByLabel("Pengirim *")).toHaveValue(
      "Draf harus dipertahankan",
    );
  } finally {
    await context.close();
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
