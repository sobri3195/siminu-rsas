import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { hasUnsavedChanges } from "./unsaved";
export function OfflineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [ready, setReady] = useState(false);
  const [update, setUpdate] = useState(false);
  const [message, setMessage] = useState("");
  const [apply, setApply] = useState<() => Promise<void>>();
  useEffect(() => {
    const connected = () => setOnline(navigator.onLine);
    window.addEventListener("online", connected);
    window.addEventListener("offline", connected);
    const verify = async () => {
      try {
        await navigator.serviceWorker.ready;
        const urls = [
          "/index.html",
          "/icon.svg",
          ...Array.from(
            document.querySelectorAll<HTMLScriptElement>("script[src]"),
          ).map((s) => s.src),
          ...Array.from(
            document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]"),
          ).map((s) => s.href),
        ];
        const cached = await Promise.all(
          urls.map((url) => caches.match(url, { ignoreSearch: true })),
        );
        setReady(cached.every(Boolean));
      } catch {
        setMessage("Penyimpanan aset offline tidak tersedia pada browser ini.");
      }
    };
    let timer: ReturnType<typeof setInterval> | undefined;
    if ("serviceWorker" in navigator) {
      const updater = registerSW({
        immediate: true,
        onOfflineReady: () => void verify(),
        onNeedRefresh: () => setUpdate(true),
        onRegisteredSW: (_url, registration) => {
          void verify();
          timer = setInterval(() => {
            if (navigator.onLine) void registration?.update();
          }, 60000);
        },
        onRegisterError: () =>
          setMessage(
            "Aset offline belum terpasang. Sambungkan internet dan muat ulang.",
          ),
      });
      setApply(() => () => updater(true));
      void verify();
    }
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", connected);
      if (timer) clearInterval(timer);
    };
  }, []);
  return (
    <div className="offline-status" role="status">
      <span>{online ? "● Online" : "● Offline"}</span>
      <span>
        {ready
          ? "Siap digunakan offline"
          : "Kunjungan pertama dan pengunduhan aset membutuhkan internet."}
      </span>
      {update && (
        <button
          onClick={() => {
            if (hasUnsavedChanges()) {
              setMessage(
                "Simpan atau ekspor formulir terlebih dahulu sebelum memperbarui aplikasi.",
              );
              return;
            }
            void apply?.();
          }}
        >
          Versi baru tersedia · Perbarui
        </button>
      )}
      {message && <small>{message}</small>}
    </div>
  );
}
