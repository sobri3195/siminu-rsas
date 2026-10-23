import { MailDashboard } from "./MailCenter";
import { Link, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Mail,
  ClipboardList,
  CalendarClock,
  TriangleAlert,
  ArrowUpRight,
  ArrowRight,
  CheckCheck,
  Send,
} from "lucide-react";
import { db } from "../storage/db";
import { useApp } from "../app/context";
import { Badge, Empty } from "../components/common";
import { today, dateLabel } from "../utils";
import { overdue } from "../repositories/workflow";
import { TaskCard } from "./Detail";
export function Dashboard() {
  const { user } = useApp();
  const lettersQuery = useLiveQuery(() => db.letters.toArray());
  const letters = lettersQuery || [];
  const allQuery = useLiveQuery(() => db.tasks.toArray());
  const all = allQuery || [];
  const dsQuery = useLiveQuery(() => db.dispositions.toArray());
  const ds = dsQuery || [];
  const tasks = all.filter(
    (t) =>
      !ds.find((d) => d.id === t.dispositionId)?.cancelled &&
      t.status !== "Dibatalkan" &&
      !t.retired,
  );
  const outgoingQuery = useLiveQuery(() => db.outgoing.toArray());
  const outgoing = outgoingQuery || [];
  const logsQuery = useLiveQuery(() => db.activities.toArray());
  const logs = logsQuery || [];
  const unitsQuery = useLiveQuery(() => db.units.toArray());
  const units = unitsQuery || [];
  if (
    [
      lettersQuery,
      allQuery,
      dsQuery,
      outgoingQuery,
      logsQuery,
      unitsQuery,
    ].some((data) => data === undefined)
  )
    return <Empty text="Memuat ringkasan data lokal…" />;
  const mine = tasks.filter(
    (t) =>
      ["Admin Sistem", "Kepala RSAU"].includes(user.role) ||
      t.userId === user.id,
  );
  const pending = letters.filter((l) => l.status === "Menunggu disposisi");
  const active = mine.filter(
    (t) => !["Selesai", "Dibatalkan"].includes(t.status),
  );
  const stats = [
    {
      label: "Menunggu disposisi",
      value: pending.length,
      icon: Mail,
      to: "/surat-masuk?status=Menunggu+disposisi",
      tone: "blue",
      hint: "Surat perlu arahan pimpinan",
    },
    {
      label: "Tugas aktif saya",
      value: active.length,
      icon: ClipboardList,
      to: "/tugas?filter=aktif",
      tone: "teal",
      hint: "Kewajiban yang perlu ditindaklanjuti",
    },
    {
      label: "Tenggat hari ini",
      value: active.filter((t) => t.deadline === today()).length,
      icon: CalendarClock,
      to: "/tugas?filter=hari-ini",
      tone: "amber",
      hint: "Selesaikan sesuai batas waktu",
    },
    {
      label: "Melewati tenggat",
      value: active.filter(overdue).length,
      icon: TriangleAlert,
      to: "/tugas?filter=terlambat",
      tone: "red",
      hint: "Memerlukan perhatian segera",
    },
  ];
  const periodStart = today().slice(0, 7) + "-01";
  const periodTasks = mine.filter(
    (t) =>
      t.createdAt.slice(0, 10) >= periodStart &&
      t.createdAt.slice(0, 10) <= today(),
  );
  const chart = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5 + i);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      month: d.toLocaleString("id-ID", { month: "short" }),
      Masuk: letters.filter((l) => l.received.startsWith(m)).length,
      Keluar: outgoing.filter((l) => l.createdAt.startsWith(m)).length,
    };
  });
  return (
    <>
      <MailDashboard />
      <div className="page-heading">
        <div>
          <p className="eyebrow">RUANG KERJA ADMINISTRASI</p>
          <h1>
            Selamat datang, {user.name.split(" ")[0]}{" "}
            <span className="wave">✦</span>
          </h1>
          <Link className="button" to="/laporan-disposisi">
            Pantau penerimaan, hasil, dan keterlambatan disposisi
          </Link>
          <p className="muted">
            Berikut ringkasan surat dan pekerjaan yang perlu perhatian Anda.
          </p>
        </div>
        <div className="date-chip">{dateLabel(today())}</div>
      </div>
      <div className="welcome-banner">
        <div>
          <span className="live-dot" /> SIMINU RSAS{" "}
          <h2>
            Administrasi tertib.
            <br />
            Pelayanan lebih baik.
          </h2>
          <p>Setiap surat terpantau, setiap arahan ditindaklanjuti.</p>
        </div>
        <div className="banner-art">
          <Mail size={78} strokeWidth={1} />
          <span>RSAU</span>
        </div>
      </div>
      <div className="stats">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="stat">
            <div className="row">
              <span className={`stat-icon ${s.tone}`}>
                <s.icon size={22} />
              </span>
              <ArrowUpRight size={18} className="muted" />
            </div>
            <strong>{s.value.toString().padStart(2, "0")}</strong>
            <h3>{s.label}</h3>
            <small>{s.hint}</small>
          </Link>
        ))}
      </div>
      <div className="period-summary">
        <Link to={`/surat-keluar?from=${periodStart}&to=${today()}`}>
          <Send size={19} />
          <div>
            <strong>
              {
                outgoing.filter(
                  (l) =>
                    l.createdAt.slice(0, 10) >= periodStart &&
                    l.createdAt.slice(0, 10) <= today(),
                ).length
              }{" "}
              surat keluar bulan ini
            </strong>
            <small>Dokumen unik berdasarkan tanggal pembuatan</small>
          </div>
          <ArrowRight size={17} />
        </Link>
        <Link to={`/surat-masuk?from=${periodStart}&to=${today()}`}>
          <Mail size={19} />
          <div>
            <strong>
              {
                letters.filter(
                  (l) => l.received >= periodStart && l.received <= today(),
                ).length
              }{" "}
              surat masuk bulan ini
            </strong>
            <small>Dokumen unik dalam periode berjalan</small>
          </div>
          <ArrowRight size={17} />
        </Link>
        <Link to={`/tugas?filter=semua&from=${periodStart}&to=${today()}`}>
          <CheckCheck size={19} />
          <div>
            <strong>
              {periodTasks.length
                ? Math.round(
                    (periodTasks.filter((t) => t.status === "Selesai").length /
                      periodTasks.length) *
                      100,
                  )
                : "Belum ada data"}
              {periodTasks.length ? "%" : ""} penyelesaian periode berjalan
            </strong>
            <small>
              Tugas wajib yang dibuat bulan ini ·{" "}
              {periodTasks.filter((t) => t.status === "Selesai").length} /{" "}
              {periodTasks.length} selesai
            </small>
          </div>
          <ArrowRight size={17} />
        </Link>
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Perlu tindakan Anda</h2>
              <p className="muted">Prioritas pekerjaan sesuai peran Anda</p>
            </div>
            <Link to={user.role === "Kepala RSAU" ? "/disposisi" : "/tugas"}>
              Lihat semua <ArrowRight size={15} />
            </Link>
          </div>
          {[
            "Kepala RSAU",
            "Admin Sistem",
            "Petugas Urtu/Administrasi",
          ].includes(user.role)
            ? pending.slice(0, 4).map((l) => (
                <Link
                  className="work-row"
                  key={l.id}
                  to={`/surat-masuk/${l.id}`}
                >
                  <span className="file-icon">
                    <Mail size={21} />
                  </span>
                  <div>
                    <strong>{l.subject}</strong>
                    <small>
                      {l.sender} · {l.agenda}
                    </small>
                  </div>
                  <Badge>{l.status}</Badge>
                  <ArrowRight size={16} />
                </Link>
              ))
            : active.slice(0, 4).map((t) => (
                <Link
                  className="work-row"
                  key={t.id}
                  to={
                    t.minutesId
                      ? `/notulen/${t.minutesId}`
                      : `/surat-masuk/${t.letterId}`
                  }
                >
                  <span className="file-icon">
                    <ClipboardList size={20} />
                  </span>
                  <div>
                    <strong>
                      {letters.find((l) => l.id === t.letterId)?.subject ||
                        t.instruction}
                    </strong>
                    <small>
                      {t.unitName} · {t.instruction}
                    </small>
                  </div>
                  <Badge>{t.status}</Badge>
                </Link>
              ))}
        </section>
        <section className="panel">
          <div className="section-title">
            <h2>Tenggat terdekat</h2>
            <CalendarClock size={21} />
          </div>
          {active
            .slice()
            .sort((a, b) => a.deadline.localeCompare(b.deadline))
            .slice(0, 4)
            .map((t) => (
              <Link
                key={t.id}
                className="deadline-row"
                to={
                  t.minutesId
                    ? `/notulen/${t.minutesId}`
                    : `/surat-masuk/${t.letterId}`
                }
              >
                <span className={overdue(t) ? "deadline red" : "deadline"}>
                  {dateLabel(t.deadline)}
                </span>
                <div>
                  <strong>
                    {letters.find((l) => l.id === t.letterId)?.subject ||
                      t.instruction}
                  </strong>
                  <small>{t.unitName}</small>
                </div>
              </Link>
            ))}
          {!active.length && <Empty text="Tidak ada tenggat aktif." />}
        </section>
        <section className="panel">
          <div className="section-title">
            <h2>Arus surat</h2>
            <span className="muted">6 bulan terakhir</span>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#246ca1" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#246ca1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <Tooltip />
                <Area dataKey="Masuk" stroke="#246ca1" fill="url(#gradient)" />
                <Area dataKey="Keluar" stroke="#158779" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-legend">
            <span>
              ● Surat masuk:{" "}
              {
                letters.filter((l) =>
                  l.received.startsWith(today().slice(0, 7)),
                ).length
              }{" "}
              bulan ini
            </span>
            <span>● Surat keluar: {outgoing.length}</span>
          </div>
        </section>
        <section className="panel">
          <div className="section-title">
            <h2>Penyelesaian per unit</h2>
            <CheckCheck size={21} />
          </div>
          {!tasks.length && (
            <Empty text="Belum ada tugas wajib untuk menghitung persentase penyelesaian." />
          )}
          {units
            .filter((u) => tasks.some((t) => t.unitId === u.id))
            .slice(0, 4)
            .map((u) => {
              const ts = tasks.filter((t) => t.unitId === u.id);
              const done = ts.filter((t) => t.status === "Selesai").length;
              return (
                <div className="unit-progress" key={u.id}>
                  <div className="row">
                    <span>{u.name}</span>
                    <strong>{Math.round((done / ts.length) * 100)}%</strong>
                  </div>
                  <progress max={ts.length} value={done} />
                  <small>
                    {done} dari {ts.length} tugas wajib selesai
                  </small>
                </div>
              );
            })}
        </section>
      </div>
      <section className="panel">
        <div className="section-title">
          <h2>Aktivitas terbaru</h2>
          <span className="muted">
            Riwayat lokal · {tasks.filter((t) => t.status === "Selesai").length}{" "}
            / {tasks.length} tugas wajib selesai
          </span>
        </div>
        {logs
          .slice(-4)
          .reverse()
          .map((l) => (
            <Link
              className="activity-row"
              key={l.id}
              to={
                l.minutesId
                  ? `/notulen/${l.minutesId}`
                  : `/surat-masuk/${l.letterId}`
              }
            >
              <span className="activity-dot" />
              <div>
                <strong>{l.text}</strong>
                <small>
                  {l.author} ·{" "}
                  {letters.find((x) => x.id === l.letterId)?.subject}
                </small>
              </div>
              <time>
                {new Date(l.createdAt).toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </Link>
          ))}
      </section>
    </>
  );
}
export function Tasks() {
  const { user } = useApp();
  const [p, setP] = useSearchParams();
  const tasks = useLiveQuery(() => db.tasks.toArray()) || [];
  const ds = useLiveQuery(() => db.dispositions.toArray()) || [];
  const view = p;
  const setView = setP;
  const filter = p.get("filter") || "aktif";
  const filtered = tasks
    .filter(
      (t) =>
        (!p.get("from") || t.createdAt.slice(0, 10) >= p.get("from")!) &&
        (!p.get("to") || t.createdAt.slice(0, 10) <= p.get("to")!) &&
        (!ds.find((d) => d.id === t.dispositionId)?.cancelled ||
          filter === "Dibatalkan") &&
        (user.role === "Admin Sistem" ||
          user.role === "Kepala RSAU" ||
          t.userId === user.id),
    )
    .filter(
      (t) =>
        filter === "semua" ||
        (filter === "aktif" && !["Selesai", "Dibatalkan"].includes(t.status)) ||
        (filter === "hari-ini" &&
          t.deadline === today() &&
          !["Selesai", "Dibatalkan"].includes(t.status)) ||
        (filter === "terlambat" && overdue(t)) ||
        filter === t.status,
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TINDAK LANJUT</p>
          <h1>Tugas Saya</h1>
          <p className="muted">
            Konfirmasi, kerjakan, kirim hasil, dan pantau pemeriksaan.
          </p>
        </div>
        <button
          onClick={() =>
            setView({
              ...Object.fromEntries(p),
              view: p.get("view") === "kanban" ? "daftar" : "kanban",
            })
          }
        >
          {p.get("view") === "kanban" ? "Tampilan daftar" : "Tampilan Kanban"}
        </button>
      </div>
      <div className="toolbar">
        <select
          aria-label="Filter tugas"
          value={filter}
          onChange={(e) =>
            setP({ ...Object.fromEntries(p), filter: e.target.value })
          }
        >
          {[
            ["aktif", "Tugas aktif"],
            ["semua", "Semua tugas"],
            ["Belum dibaca", "Belum dibaca"],
            ["Dibaca", "Belum diterima"],
            ["Diproses", "Sedang diproses"],
            ["hari-ini", "Tenggat hari ini"],
            ["terlambat", "Terlambat"],
            ["Hasil dikirim", "Menunggu pemeriksaan"],
            ["Perlu perbaikan", "Perlu perbaikan"],
            ["Selesai", "Selesai"],
            ["Dibatalkan", "Dibatalkan"],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <span>{filtered.length} tugas</span>
      </div>
      {view.get("view") === "kanban" ? (
        <div className="kanban">
          {[
            "Belum dibaca",
            "Dibaca",
            "Diterima",
            "Diproses",
            "Hasil dikirim",
            "Perlu perbaikan",
            "Selesai",
            ...(filter === "Dibatalkan" ? ["Dibatalkan"] : []),
          ].map((status) => (
            <section className="kanban-column" key={status}>
              <h2>
                {status}{" "}
                <Badge>
                  {filtered.filter((t) => t.status === status).length}
                </Badge>
              </h2>
              {filtered
                .filter((t) => t.status === status)
                .map((t) => (
                  <TaskCard key={t.id} task={t} />
                ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="task-grid">
          {filtered.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </div>
      )}
      {!filtered.length && <Empty />}
    </>
  );
}
