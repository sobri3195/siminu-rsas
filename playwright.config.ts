import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: {
      executablePath: existsSync("/usr/bin/chromium")
        ? "/usr/bin/chromium"
        : undefined,
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
  reporter: "list",
});
