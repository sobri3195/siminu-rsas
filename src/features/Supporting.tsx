import { useState } from "react";
import { Calendar } from "../components/Calendar";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { seed } from "../storage/seed";
import { useApp } from "../app/context";
import { Badge, Empty, Field, Modal } from "../components/common";
import { dateLabel, download, id, now, today } from "../utils";
import { exportBackup, importBackup } from "../repositories/backup";
import type { AppSettings, Unit } from "../types";
export function Outgoing() {
  const { user, run } = useApp();
  const list = useLiveQuery(() => db.outgoing.toArray()) || [];
  const letters = useLiveQuery(() => db.letters.toArray()) || [];
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [recipient, setRecipient] = useState("");
  const [incoming, setIncoming] = useState("");
  const stages = [
    "Draf",
    "Pemeriksaan",
    "Persetujuan demo",
    "Penomoran",
    "Pengiriman",
    "Diarsipkan",
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">KORESPONDENSI</p>
          <h1>Surat Keluar</h1>
          <p className="muted">
            Dari penyusunan draf hingga pencatatan pengiriman.
          </p>
        </div>
        {["Admin Sistem", "Petugas Urtu/Administrasi"].includes(user.role) && (
          <button className="primary" onClick={() => setOpen(true)}>
            + Buat draf
          </button>
        )}
      </div>
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Perihal / penerima</th>
              <th>Nomor</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.map((l) => {
              const idx = stages.indexOf(l.status);
              const allowed =
                user.role === "Admin Sistem" ||
                (idx === 1 || idx === 2
                  ? user.role === "Kepala RSAU"
                  : user.role === "Petugas Urtu/Administrasi");
              return (
                <tr key={l.id}>
                  <td>
                    <strong>{l.subject}</strong>
                    <small>{l.recipient}</small>
                    {l.incomingId && (
                      <Link to={`/surat-masuk/${l.incomingId}`}>
                        Surat yang dibalas
                      </Link>
                    )}
                  </td>
                  <td>{l.number || "Belum diberi nomor"}</td>
                  <td>
                    <Badge>{l.status}</Badge>
                  </td>
                  <td>
                    {idx < 5 && allowed && (
                      <button
                        onClick={() =>
                          run(async () => {
                            const patch: { status: string; number?: string } = {
                              status: stages[idx + 1],
                            };
                            if (idx === 3)
                              patch.number = `B/${Date.now()}/RSAS/${today().slice(0, 4)}`;
                            if (
                              idx === 4 &&
                              !confirm(
                                "Konfirmasi surat telah dikirim kepada penerima?",
                              )
                            )
                              return;
                            await db.outgoing.update(l.id, patch);
                          }, "Tahap surat keluar diperbarui.")
                        }
                      >
                        {
                          [
                            "Ajukan pemeriksaan",
                            "Setujui pemeriksaan",
                            "Persetujuan demo",
                            "Terbitkan nomor",
                            "Catat pengiriman & arsip",
                          ][idx]
                        }
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {open && (
        <Modal title="Draf surat keluar" onClose={() => setOpen(false)}>
          <Field label="Perihal *">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>
          <Field label="Penerima *">
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </Field>
          <Field label="Balasan untuk surat masuk">
            <select
              value={incoming}
              onChange={(e) => setIncoming(e.target.value)}
            >
              <option value="">Bukan balasan</option>
              {letters.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.subject}
                </option>
              ))}
            </select>
          </Field>
          <button
            className="primary"
            disabled={!subject.trim() || !recipient.trim()}
            onClick={() =>
              run(async () => {
                await db.outgoing.add({
                  id: id(),
                  subject,
                  recipient,
                  status: "Draf",
                  number: "",
                  incomingId: incoming || undefined,
                  createdAt: now(),
                });
                setOpen(false);
                setSubject("");
                setRecipient("");
              }, "Draf surat keluar disimpan.")
            }
          >
            Simpan draf
          </button>
        </Modal>
      )}
    </>
  );
}
export function Agenda() {
  const { run } = useApp();
  const events = useLiveQuery(() => db.events.toArray()) || [];
  const allTasks = useLiveQuery(() => db.tasks.toArray()) || [];
  const dispositions = useLiveQuery(() => db.dispositions.toArray()) || [];
  const tasks = allTasks.filter(
    (t) => !dispositions.find((d) => d.id === t.dispositionId)?.cancelled,
  );
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [location, setLocation] = useState("");
  const [calendar, setCalendar] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">JADWAL KEGIATAN</p>
          <h1>Agenda</h1>
          <p className="muted">
            Kegiatan dan tenggat tugas ditampilkan sebagai jenis yang berbeda.
          </p>
        </div>
        <button className="primary" onClick={() => setOpen(true)}>
          + Tambah kegiatan
        </button>
      </div>
      <button onClick={() => setCalendar(!calendar)}>
        {calendar ? "Tampilan daftar" : "Tampilan kalender"}
      </button>
      {calendar ? (
        <Calendar events={events} tasks={tasks} />
      ) : (
        <div className="task-grid">
          {events.map((e) => (
            <article className="panel" key={e.id}>
              <Badge>Kegiatan</Badge>
              <h2>{e.title}</h2>
              <p>
                {dateLabel(e.date)} · {e.location}
              </p>
              {e.letterId && (
                <Link to={`/surat-masuk/${e.letterId}`}>Buka surat</Link>
              )}
            </article>
          ))}
          {tasks
            .filter((t) => t.status !== "Selesai")
            .map((t) => (
              <Link
                to={`/surat-masuk/${t.letterId}`}
                className="panel"
                key={t.id}
              >
                <Badge>Tenggat tugas</Badge>
                <h3>{t.unitName}</h3>
                <p>
                  {dateLabel(t.deadline)} · {t.instruction}
                </p>
              </Link>
            ))}
        </div>
      )}
      {open && (
        <Modal title="Tambah kegiatan" onClose={() => setOpen(false)}>
          <Field label="Nama kegiatan *">
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Tanggal *">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Lokasi">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Field>
          <button
            disabled={!title.trim() || !date}
            className="primary"
            onClick={() =>
              run(async () => {
                await db.events.add({ id: id(), title, date, location });
                setOpen(false);
                setTitle("");
              }, "Kegiatan agenda disimpan.")
            }
          >
            Konfirmasi & simpan kegiatan
          </button>
        </Modal>
      )}
    </>
  );
}
export function Master() {
  const { user, run } = useApp();
  const units = useLiveQuery(() => db.units.toArray()) || [];
  const users = useLiveQuery(() => db.users.toArray()) || [];
  const [edit, setEdit] = useState<Unit>();
  if (user.role !== "Admin Sistem")
    return <Empty text="Master data dikelola oleh Admin Sistem." />;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRASI</p>
          <h1>Master Data</h1>
          <p className="muted">
            Transkripsi awal label tujuan disposisi; dapat dikoreksi sesuai
            struktur RSAS.
          </p>
        </div>
        <button
          className="primary"
          onClick={() =>
            setEdit({ id: id(), name: "", active: true, order: units.length })
          }
        >
          + Tambah unit / jabatan
        </button>
      </div>
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Unit / jabatan</th>
              <th>Induk</th>
              <th>Penanggung jawab aktif</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {units
              .sort((a, b) => a.order - b.order)
              .map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{units.find((p) => p.id === u.parentId)?.name || "—"}</td>
                  <td>
                    {users.find((p) => p.id === u.userId)?.name ||
                      "Belum ditetapkan"}
                  </td>
                  <td>
                    <Badge>{u.active ? "Aktif" : "Nonaktif"}</Badge>
                  </td>
                  <td>
                    <button onClick={() => setEdit({ ...u })}>Edit unit</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
      {edit && (
        <Modal title="Data unit / jabatan" onClose={() => setEdit(undefined)}>
          <Field label="Nama *">
            <input
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </Field>
          <Field label="Urutan">
            <input
              type="number"
              value={edit.order}
              onChange={(e) =>
                setEdit({ ...edit, order: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Unit induk">
            <select
              value={edit.parentId || ""}
              onChange={(e) =>
                setEdit({ ...edit, parentId: e.target.value || undefined })
              }
            >
              <option value="">Tidak ada</option>
              {units
                .filter((u) => u.id !== edit.id)
                .map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Penanggung jawab">
            <select
              value={edit.userId || ""}
              onChange={(e) => setEdit({ ...edit, userId: e.target.value })}
            >
              <option value="">Belum ditetapkan</option>
              {users
                .filter((u) => u.active)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={edit.active}
              onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
            />{" "}
            Unit aktif
          </label>
          <p className="muted">
            Perubahan penanggung jawab berlaku pada tugas baru. Penerima dan
            nama unit pada riwayat tetap disimpan.
          </p>
          <button
            disabled={!edit.name.trim()}
            className="primary"
            onClick={() =>
              run(async () => {
                let cursor = edit.parentId;
                const visited = new Set([edit.id]);
                while (cursor) {
                  if (visited.has(cursor))
                    throw Error("Hierarki unit membentuk siklus.");
                  visited.add(cursor);
                  cursor = units.find((u) => u.id === cursor)?.parentId;
                }
                await db.units.put(edit);
                setEdit(undefined);
              }, "Master unit diperbarui.")
            }
          >
            Simpan perubahan
          </button>
        </Modal>
      )}
    </>
  );
}
export function Settings() {
  const { user, run } = useApp();
  const settings = useLiveQuery(() => db.settings.get("main"));
  const [draft, setDraft] = useState<AppSettings>();
  const [replace, setReplace] = useState(false);
  const [confirmReset, setConfirmReset] = useState("");
  const data = draft || settings;
  if (!data) return <Empty text="Memuat pengaturan…" />;
  const admin = user.role === "Admin Sistem";
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PREFERENSI & DATA</p>
          <h1>Pengaturan</h1>
          <p className="muted">
            Data hanya tersimpan pada browser dan perangkat ini.
          </p>
        </div>
      </div>
      <div className="grid2">
        <section className="panel form-panel">
          <h2>Identitas pejabat cetak</h2>
          {(
            [
              "official",
              "rank",
              "nrp",
              "printDate",
              "timezone",
              "extraInstructions",
            ] as const
          ).map((k, i) => (
            <Field
              key={k}
              label={
                [
                  "Nama pejabat (isi sesuai penetapan)",
                  "Pangkat",
                  "NRP",
                  "Tanggal cetak",
                  "Zona waktu tampilan",
                  "Instruksi tambahan (pisahkan koma)",
                ][i]
              }
            >
              <input
                disabled={!admin}
                type={k === "printDate" ? "date" : "text"}
                value={data[k]}
                onChange={(e) => setDraft({ ...data, [k]: e.target.value })}
              />
            </Field>
          ))}
          {admin && (
            <button
              className="primary"
              onClick={() =>
                run(async () => {
                  try {
                    new Intl.DateTimeFormat("id-ID", {
                      timeZone: data.timezone,
                    });
                  } catch {
                    throw Error(
                      "Zona waktu tidak valid. Gunakan contoh Asia/Jakarta.",
                    );
                  }
                  await db.settings.put(data);
                }, "Pengaturan cetak disimpan.")
              }
            >
              Simpan pengaturan
            </button>
          )}
        </section>
        <section className="panel form-panel">
          <h2>Cadangan metadata</h2>
          <p>
            Ekspor JSON tidak menyertakan isi lampiran. Simpan berkas asli
            secara terpisah. Impor hanya memulihkan metadata; lampiran yang
            tidak ada tetap tidak tersedia.
          </p>
          <button
            onClick={() => run(exportBackup, "Cadangan metadata diunduh.")}
          >
            Ekspor metadata JSON
          </button>
          {admin && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={(e) => setReplace(e.target.checked)}
                />{" "}
                Ganti seluruh metadata (bukan gabung)
              </label>
              <Field label="Impor JSON tervalidasi">
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (
                      f &&
                      (!replace ||
                        confirm(
                          "Ganti seluruh metadata? Cadangkan terlebih dahulu.",
                        ))
                    )
                      void run(
                        () => importBackup(f, replace),
                        "Metadata berhasil diimpor.",
                      );
                  }}
                />
              </Field>
              <hr />
              <h2>Reset data demo</h2>
              <p>
                Semua surat, lampiran, dan riwayat di browser ini akan dihapus.
              </p>
              <Field label="Ketik RESET untuk konfirmasi">
                <input
                  value={confirmReset}
                  onChange={(e) => setConfirmReset(e.target.value)}
                />
              </Field>
              <button
                className="danger"
                disabled={confirmReset !== "RESET"}
                onClick={() =>
                  run(async () => {
                    await db.transaction("rw", db.tables, async () => {
                      for (const t of db.tables) await t.clear();
                    });
                    await seed();
                    localStorage.removeItem("rsas-letter-draft");
                    setConfirmReset("");
                  }, "Data demo direset.")
                }
              >
                Hapus & buat ulang data demo
              </button>
            </>
          )}
          <div className="callout">
            <strong>Batasan mode demo</strong>
            <p>
              Pemilihan peran bukan autentikasi. Pembatasan tampilan bukan
              keamanan produksi. Riwayat lokal dapat berubah dan bukan audit log
              tahan perubahan. Notifikasi hanya di dalam aplikasi.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
export function Reports() {
  const letters = useLiveQuery(() => db.letters.toArray()) || [];
  const outgoing = useLiveQuery(() => db.outgoing.toArray()) || [];
  const tasks = useLiveQuery(() => db.tasks.toArray()) || [];
  const ds = useLiveQuery(() => db.dispositions.toArray()) || [];
  const [from, setFrom] = useState(today().slice(0, 7) + "-01");
  const [to, setTo] = useState(today());
  const [kind, setKind] = useState("Surat masuk");
  const active = tasks.filter(
    (t) => !ds.find((d) => d.id === t.dispositionId)?.cancelled,
  );
  const rows: Record<string, string>[] =
    kind === "Surat masuk"
      ? letters
          .filter((l) => l.received >= from && l.received <= to)
          .map((l) => ({
            Nomor: l.agenda,
            Perihal: l.subject,
            Tanggal: l.received,
            Status: l.status,
          }))
      : kind === "Surat keluar"
        ? outgoing
            .filter(
              (l) =>
                l.createdAt.slice(0, 10) >= from &&
                l.createdAt.slice(0, 10) <= to,
            )
            .map((l) => ({
              Nomor: l.number,
              Perihal: l.subject,
              Tanggal: l.createdAt.slice(0, 10),
              Status: l.status,
            }))
        : kind === "Disposisi"
          ? ds
              .filter(
                (d) =>
                  d.createdAt.slice(0, 10) >= from &&
                  d.createdAt.slice(0, 10) <= to,
              )
              .map((d) => ({
                Surat:
                  letters.find((l) => l.id === d.letterId)?.subject ||
                  d.letterId,
                Pemberi: d.giver,
                Tanggal: d.createdAt.slice(0, 10),
                Status: d.cancelled ? "Direvisi" : "Diterbitkan",
              }))
          : active
              .filter(
                (t) =>
                  t.createdAt.slice(0, 10) >= from &&
                  t.createdAt.slice(0, 10) <= to &&
                  (kind !== "Tugas terlambat" ||
                    (t.deadline < today() && t.status !== "Selesai")),
              )
              .map((t) => ({
                Unit: t.unitName,
                Surat: letters.find((l) => l.id === t.letterId)?.subject || "",
                Tenggat: t.deadline,
                Status: t.status,
              }));
  const csv = () => {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const quote = (s: string) =>
      '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"';
    download(
      new Blob(
        [
          "\ufeff" +
            [keys, ...rows.map((r) => keys.map((k) => r[k]))]
              .map((row) => row.map(quote).join(","))
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
      "laporan-rsas.csv",
    );
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MONITORING ADMINISTRASI</p>
          <h1>Laporan</h1>
          <p className="muted">
            Jumlah surat memakai dokumen unik; penyelesaian memakai tugas wajib,
            tanpa tembusan.
          </p>
        </div>
        <div className="row">
          <button disabled={!rows.length} onClick={csv}>
            Ekspor CSV
          </button>
          <button className="primary" onClick={() => window.print()}>
            Cetak laporan
          </button>
        </div>
      </div>
      <div className="toolbar">
        <Field label="Jenis laporan">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {[
              "Surat masuk",
              "Surat keluar",
              "Disposisi",
              "Penyelesaian per unit",
              "Tugas terlambat",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Dari">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Sampai">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      <section className="panel">
        <h2>
          {kind} · {rows.length} catatan
        </h2>
        {kind === "Penyelesaian per unit" &&
          Array.from(new Set(rows.map((r) => r.Unit))).map((u) => (
            <p key={u}>
              {u}:{" "}
              {
                rows.filter((r) => r.Unit === u && r.Status === "Selesai")
                  .length
              }{" "}
              / {rows.filter((r) => r.Unit === u).length} tugas selesai
            </p>
          ))}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {Object.keys(rows[0] || {}).map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {Object.values(r).map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <Empty />}
      </section>
    </>
  );
}
