import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ensureNota } from "../repositories/nota";
import { ensureTemplates } from "../repositories/drafts";
import { db, dataMode } from "../storage/db";
import { useApp } from "../app/context";
import { Field, Modal } from "../components/common";
import {
  createFullBackup,
  validateFullBackup,
  findConflicts,
  restoreFullBackup,
  type ValidatedPackage,
} from "../repositories/fullBackup";
import { download, timestampLabel, now } from "../utils";
export function DataCenter() {
  const { user, run } = useApp();
  const [estimate, setEstimate] = useState<StorageEstimate>();
  const [persistent, setPersistent] = useState<boolean>();
  const [pkg, setPkg] = useState<ValidatedPackage>();
  const [conflicts, setConflicts] = useState<
    Awaited<ReturnType<typeof findConflicts>>
  >([]);
  const [choices, setChoices] = useState<Record<string, "local" | "import">>(
    {},
  );
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const recoveries = useLiveQuery(() => db.recovery.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.get("main"));
  const refresh = async () => {
    if (navigator.storage?.estimate)
      setEstimate(await navigator.storage.estimate());
    if (navigator.storage?.persisted)
      setPersistent(await navigator.storage.persisted());
    const files = new Set((await db.attachments.toArray()).map((a) => a.id));
    const ids = [
      ...(await db.letters.toArray()).flatMap((l) => l.attachmentIds),
      ...(await db.outgoing.toArray()).flatMap((l) => l.attachmentIds || []),
      ...(await db.reports.toArray()).flatMap((r) => r.attachmentIds),
      ...(await db.minutes.toArray()).flatMap((r) => r.attachmentIds),
      ...(await db.drafts.toArray()).flatMap((r) => r.attachmentIds),
      ...(await db.notes.toArray()).flatMap((r) =>
        r.content.attachments.map((a) => a.id),
      ),
      ...(await db.noteVersions.toArray()).flatMap((r) =>
        r.content.attachments.map((a) => a.id),
      ),
    ];
    setMissing(ids.filter((id) => !files.has(id)));
  };
  useEffect(() => {
    void run(refresh, "");
  }, []);
  const execute = (fn: () => Promise<void>) =>
    run(async () => {
      setBusy(true);
      try {
        await fn();
        await refresh();
      } finally {
        setBusy(false);
      }
    }, "");
  const exportFull = () =>
    execute(async () => {
      const blob = await createFullBackup();
      download(
        blob,
        `siminu-rsas-${dataMode}-${new Date().toISOString().slice(0, 10)}.zip`,
      );
      await db.settings.update("main", { lastBackupAt: now() });
      setMessage(
        "Cadangan ZIP lengkap selesai dibuat dan diunduh. Simpan di tempat lain yang aman.",
      );
    });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PENYIMPANAN PERANGKAT INI</p>
          <h1>Pusat Data Lokal</h1>
          <p className="muted">
            Pemindahan antarperangkat dilakukan manual dengan ZIP. Penggabungan
            bukan sinkronisasi multiuser.
          </p>
        </div>
        <button className="primary" disabled={busy} onClick={exportFull}>
          {busy ? "Memproses…" : "Buat cadangan lengkap ZIP"}
        </button>
      </div>
      {message && (
        <p role="status" className="callout">
          {message}
        </p>
      )}
      <div className="grid2">
        <section className="panel">
          <h2>Ketahanan penyimpanan</h2>
          <p>
            Database aktif:{" "}
            {dataMode === "demo"
              ? "Data contoh terpisah"
              : "Data lokal pengguna (database lama dipertahankan)"}
          </p>
          <p>
            Penggunaan:{" "}
            {estimate?.usage === undefined
              ? "Tidak tersedia"
              : `${(estimate.usage / 1024 / 1024).toFixed(1)} MB`}{" "}
            /{" "}
            {estimate?.quota === undefined
              ? "kapasitas tidak diketahui"
              : `${(estimate.quota / 1024 / 1024).toFixed(0)} MB`}
          </p>
          <p>
            Penyimpanan persisten:{" "}
            {persistent === undefined
              ? "Tidak didukung"
              : persistent
                ? "Diizinkan browser"
                : "Belum diizinkan"}
          </p>
          <button
            disabled={!navigator.storage?.persist}
            onClick={() =>
              execute(async () => {
                const granted = await navigator.storage.persist();
                setPersistent(granted);
                setMessage(
                  granted
                    ? "Penyimpanan persisten diizinkan. Cadangan tetap diperlukan."
                    : "Browser belum mengizinkan penyimpanan persisten. Aplikasi tetap dapat digunakan.",
                );
              })
            }
          >
            Minta penyimpanan persisten
          </button>
          <p>
            Cadangan terakhir:{" "}
            {settings?.lastBackupAt
              ? timestampLabel(settings.lastBackupAt)
              : "Belum pernah"}
          </p>
          {(!settings?.lastBackupAt ||
            Date.now() - new Date(settings.lastBackupAt).getTime() >
              (settings.backupDays || 7) * 86400000) && (
            <p className="warning">
              Buat cadangan secara berkala, terutama sebelum perubahan besar.
            </p>
          )}
          <p>
            Data dapat hilang ketika data situs dihapus, profil browser dihapus,
            ruang habis, atau mode privat ditutup. Penyimpanan browser bukan
            arsip permanen.
          </p>
          <p>Referensi lampiran hilang: {missing.length}</p>
          {missing.length > 0 && (
            <p role="alert" className="error">
              Pulihkan cadangan lengkap yang memiliki lampiran berikut:{" "}
              {missing.join(", ")}
            </p>
          )}
          <button
            onClick={() => run(refresh, "Status penyimpanan diperbarui.")}
          >
            Periksa ulang penyimpanan
          </button>
        </section>
        <section className="panel">
          <h2>Pulihkan cadangan</h2>
          <p>
            Validasi format, skema v5 (kompatibel paket v2/v3/v4),
            jumlah/ukuran, referensi dan SHA-256 dilakukan sebelum database
            diubah. Batas paket 150 MB, 30 MB per berkas.
          </p>
          {user.role === "Admin Sistem" ? (
            <Field label="Pilih cadangan lengkap ZIP">
              <input
                disabled={busy}
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file)
                    void execute(async () => {
                      const validated = await validateFullBackup(file);
                      const found = await findConflicts(validated);
                      setPkg(validated);
                      setConflicts(found);
                      setChoices({});
                      setMode("merge");
                    });
                }}
              />
            </Field>
          ) : (
            <p>Pilih Admin Sistem untuk memulihkan data.</p>
          )}
          <h3>Cadangan otomatis sebelum penggantian</h3>
          {recoveries.length === 0 ? (
            <p className="muted">
              Belum ada penggantian data. Cadangan ini dibuat otomatis dalam
              transaksi penggantian.
            </p>
          ) : (
            recoveries.map((r) => (
              <p key={r.id}>
                {timestampLabel(r.createdAt)}{" "}
                <button onClick={() => download(r.blob, r.name)}>
                  Unduh cadangan pemulihan
                </button>
              </p>
            ))
          )}
        </section>
      </div>
      {pkg && (
        <Modal
          title="Periksa paket sebelum pemulihan"
          onClose={() => !busy && setPkg(undefined)}
        >
          <p>
            {pkg.manifest.appVersion} · {timestampLabel(pkg.manifest.createdAt)}{" "}
            · {pkg.manifest.files.length} berkas asli
          </p>
          <p>
            {Object.entries(pkg.manifest.counts)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </p>
          <Field label="Cara pemulihan">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "merge" | "replace")}
            >
              <option value="merge">Gabungkan berdasarkan ID</option>
              <option value="replace">Ganti seluruh data aktif</option>
            </select>
          </Field>
          {mode === "merge" &&
            conflicts.map((c) => (
              <Field
                key={`${c.table}:${c.id}`}
                label={`${c.table} · ${c.label}`}
              >
                <select
                  value={choices[`${c.table}:${c.id}`] || ""}
                  onChange={(e) =>
                    setChoices({
                      ...choices,
                      [`${c.table}:${c.id}`]: e.target.value as
                        "local" | "import",
                    })
                  }
                >
                  <option value="">Pilih penyelesaian konflik</option>
                  <option value="local">Pertahankan data lokal</option>
                  <option value="import">Gunakan data impor</option>
                </select>
              </Field>
            ))}
          {mode === "replace" && (
            <p className="warning">
              Seluruh data aktif akan diganti. Cadangan ZIP lokal otomatis
              dibuat sebelum penggantian. Database mode lainnya tidak disentuh.
            </p>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              (mode === "merge" &&
                conflicts.some((c) => !choices[`${c.table}:${c.id}`]))
            }
            onClick={() => {
              if (
                mode === "replace" &&
                !confirm(
                  "Ganti seluruh data aktif dengan isi paket ini? Cadangan otomatis akan dibuat.",
                )
              )
                return;
              void execute(async () => {
                const result = await restoreFullBackup(pkg, mode, choices);
                if (pkg.manifest.schemaVersion === 2) await ensureTemplates();
                await ensureNota();
                setMessage(
                  `Pemulihan selesai: ${result.restored} berhasil, ${result.skipped} dilewati, ${result.conflicts} konflik ditangani.`,
                );
                setPkg(undefined);
              });
            }}
          >
            {busy ? "Memulihkan…" : "Konfirmasi pemulihan"}
          </button>
        </Modal>
      )}
    </>
  );
}
