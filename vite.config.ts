import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: [
        "icon.svg",
        "offline.html",
        "icon-192.png",
        "icon-512.png",
      ],
      manifest: {
        name: "SIMINU RSAS — Administrasi Umum",
        short_name: "SIMINU RSAS",
        description:
          "Persuratan dan disposisi lokal RSAU Prof. dr. Abdulrachman Saleh",
        lang: "id",
        theme_color: "#122d44",
        background_color: "#f5f7fa",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,mjs,css,html,svg,png,webmanifest}"],
        maximumFileSizeToCacheInBytes: 6000000,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          /^\/assets\//,
          /^\/sw\.js$/,
          /^\/workbox-/,
          /^\/manifest\.webmanifest$/,
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
      },
    }),
  ],
});
