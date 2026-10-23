import { replyStage } from "../repositories/mail";
import { MailCenter, PrintMailRegister } from "../features/MailCenter";
import { MailDispatchBook } from "../features/MailDispatch";
import { MailThread } from "../features/ReplyManagement";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  useLocation,
  useNavigate,
  Link,
} from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  LayoutDashboard,
  Mail,
  GitBranch,
  ClipboardCheck,
  Send,
  CalendarDays,
  Archive,
  BarChart3,
  Database,
  Settings as SettingsIcon,
  Search,
  Bell,
  Menu,
  ChevronLeft,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { db, dataMode } from "../storage/db";
import { OfflineStatus } from "./pwa";
import { DataCenter } from "../features/DataCenter";
import { Trial } from "../features/Trial";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { InteractiveHelp } from "../features/InteractiveHelp";
import { Analytics } from "../features/Analytics";
import { ContentSearch } from "../features/ContentSearch";
import { SpreadsheetImport } from "../features/SpreadsheetImport";
import { LeadershipAgenda } from "../features/LeadershipAgenda";
import { Minutes } from "../features/Minutes";
import { Cases } from "../features/Cases";
import { Drafting, DraftEditor } from "../features/Drafting";
import { DispositionCenter } from "../features/DispositionCenter";
import { DigitalDispositionEditor } from "../features/DigitalDispositionEditor";
import { DigitalDispositionDetail } from "../features/DigitalDispositionDetail";
import { DigitalDispositionPrint } from "../features/DigitalDispositionPrint";
import { DigitalDispositionReports } from "../features/DigitalDispositionReports";
import { NotaDinas } from "../features/NotaDinas";
import { NoteEditor } from "../features/NoteEditor";
import { ensureNota } from "../repositories/nota";
import { ensureTemplates } from "../repositories/drafts";
import { ensureCatalogs } from "../repositories/catalogs";
import { refreshReminders } from "../repositories/reminders";
import { seed } from "../storage/seed";
import { setDisplayTimezone, timestampLabel } from "../utils";
import { AppContext } from "./context";
import { Dashboard, Tasks } from "../features/Dashboard";
import { Letters, NewLetter } from "../features/Letters";
import { Detail } from "../features/Detail";
import { Print } from "../features/Print";
import { LetterPrint } from "../features/LetterPrint";
import { Outgoing, Master, Settings, Reports } from "../features/Supporting";
import { Modal } from "../components/common";
import "../styles/app.css";
const nav = [
  ["/", "Beranda", LayoutDashboard],
  ["/surat-masuk", "Surat Masuk", Mail],
  ["/perlu-dibalas", "Perlu Dibalas", Mail],
  ["/konsep-surat", "Konsep Surat", Mail],
  ["/pemeriksaan-surat", "Pemeriksaan Surat", ClipboardCheck],
  ["/register-nomor", "Register Nomor", Database],
  ["/buku-ekspedisi", "Buku Ekspedisi", Send],
  ["/template-surat", "Template Surat", Mail],
  ["/disposisi", "Disposisi Digital", GitBranch],
  ["/tugas", "Tugas Saya", ClipboardCheck],
  ["/nota-dinas", "Nota Dinas", Mail],
  ["/naskah", "Pembuat Naskah", Mail],
  ["/surat-keluar", "Surat Keluar", Send],
  ["/agenda", "Agenda", CalendarDays],
  ["/notulen", "Notulen", ClipboardCheck],
  ["/berkas-kegiatan", "Berkas Kegiatan", Archive],
  ["/pencarian", "Pencarian Isi", Search],
  ["/impor-register", "Impor Register", Database],
  ["/arsip", "Arsip Surat", Archive],
  ["/analisis", "Analisis Waktu", BarChart3],
  ["/laporan", "Laporan", BarChart3],
  ["/master", "Master Data", Database],
  ["/pengaturan", "Pengaturan", SettingsIcon],
  ["/pusat-data", "Pusat Data Lokal", Database],
  ["/uji-coba", "Uji Coba Sistem", ClipboardCheck],
  ["/bantuan", "Bantuan", ShieldCheck],
] as const;
function App() {
  const settings = useLiveQuery(() => db.settings.get("main"));
  useEffect(() => {
    if (settings?.timezone) {
      try {
        setDisplayTimezone(settings.timezone);
      } catch {
        setError(
          "Zona waktu tersimpan tidak valid. Perbaiki melalui Pengaturan.",
        );
      }
    }
  }, [settings?.timezone]);
  const users = (useLiveQuery(() => db.users.toArray()) || []).filter(
    (u) => u.active,
  );
  const [uid, setUid] = useState(localStorage.getItem("rsas-user") || "user-0");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [collapsed, setCollapsed] = useState(
    localStorage.getItem("rsas-sidebar") === "collapsed",
  );
  useEffect(
    () =>
      localStorage.setItem(
        "rsas-sidebar",
        collapsed ? "collapsed" : "expanded",
      ),
    [collapsed],
  );
  useEffect(() => {
    const changed = () =>
      setNotice(
        "Data diperbarui dari tab lain. Formulir koreksi akan memeriksa konflik sebelum menyimpan.",
      );
    const upgrade = () =>
      setError(
        "Versi database berubah. Tutup tab lain yang masih memakai versi lama, lalu muat ulang aplikasi.",
      );
    window.addEventListener("rsas-other-tab", changed);
    window.addEventListener("rsas-db-upgrade", upgrade);
    const timer = setInterval(
      () => void refreshReminders().catch(() => {}),
      60000,
    );
    return () => {
      clearInterval(timer);
      window.removeEventListener("rsas-other-tab", changed);
      window.removeEventListener("rsas-db-upgrade", upgrade);
    };
  }, []);
  const [mobile, setMobile] = useState(false);
  const [notification, setNotification] = useState(false);
  const [query, setQuery] = useState("");
  const letterCount =
    useLiveQuery(async () => {
      const a = await db.replyAssignments.toArray();
      return db.letters
        .filter(
          (l) =>
            !a.some((v) => v.id === l.id && v.decision !== "Perlu penilaian"),
        )
        .count();
    }) || 0;
  const workCounts =
    useLiveQuery(async () => {
      const ds = await db.drafts.toArray(),
        as = await db.replyAssignments.toArray(),
        targets = await db.dispatchTargets.toArray(),
        dispatches = await db.dispatches.toArray();
      return {
        "/perlu-dibalas": as.filter(
          (a) =>
            a.decision === "Perlu balasan" &&
            replyStage(a.id, ds, targets, dispatches) !== "Selesai",
        ).length,
        "/konsep-surat": ds.filter((d) =>
          ["Draf", "Perbaikan"].includes(d.stage),
        ).length,
        "/pemeriksaan-surat": ds.filter((d) =>
          ["Pemeriksaan", "Persetujuan"].includes(d.stage),
        ).length,
      };
    }) || {};
  const notifications = useLiveQuery(() => db.notifications.toArray()) || [];
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    seed(dataMode === "demo")
      .then(ensureCatalogs)
      .then(ensureTemplates)
      .then(ensureNota)
      .then(refreshReminders)
      .then(() => setReady(true))
      .catch((e) =>
        setError("Penyimpanan browser tidak dapat dibuka: " + String(e)),
      );
  }, []);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  useEffect(() => setMobile(false), [location.pathname]);
  const user = users.find((u) => u.id === uid) || users[0];
  const run = async (fn: () => Promise<unknown>, message: string) => {
    try {
      await fn();
      if (message) setNotice(message);
    } catch (e) {
      setError(
        "Tindakan gagal. Data belum dikonfirmasi tersimpan. " + String(e),
      );
    }
  };
  if (!ready || !user)
    return (
      <main className="boot">
        <div className="brand-mark">RSAS</div>
        <h1>SIMINU RSAS</h1>
        <p>{error || "Menyiapkan ruang kerja administrasi…"}</p>
        {error && (
          <button onClick={() => window.location.reload()}>Coba lagi</button>
        )}
      </main>
    );
  const print = /^\/cetak/.test(location.pathname);
  return (
    <AppContext.Provider value={{ user, run }}>
      <div
        className={`app-shell ${collapsed ? "collapsed" : ""} ${mobile ? "mobile-open" : ""} ${print ? "print-mode" : ""}`}
      >
        <aside className="sidebar">
          <Link to="/" className="brand">
            <span className="brand-mark">RSAS</span>
            <span>
              <strong>
                SIMINU <b>RSAS</b>
              </strong>
              <small>Administrasi Umum</small>
            </span>
          </Link>
          <p className="sidebar-caption">RUANG KERJA</p>
          <nav aria-label="Menu utama">
            {nav.map(
              ([path, label, Icon], i) =>
                (path !== "/master" || user.role === "Admin Sistem") && (
                  <React.Fragment key={path}>
                    {i === 8 && <p className="sidebar-caption">ADMINISTRASI</p>}
                    <NavLink end={path === "/"} to={path} title={label}>
                      <Icon size={20} />
                      <span>{label}</span>
                      {path === "/surat-masuk" && (
                        <em title="Surat belum dinilai">{letterCount}</em>
                      )}
                      {path in workCounts && (
                        <em>{workCounts[path as keyof typeof workCounts]}</em>
                      )}
                    </NavLink>
                  </React.Fragment>
                ),
            )}
          </nav>
          <div className="sidebar-bottom">
            <ShieldCheck size={20} />
            <div>
              <strong>
                RSAU Prof. dr.
                <br />
                Abdulrachman Saleh
              </strong>
              <small>Sistem administrasi terpadu</small>
            </div>
          </div>
          <button
            className="collapse"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Perkecil sidebar"
          >
            <ChevronLeft size={18} />
            <span>Perkecil menu</span>
          </button>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <button
              className="mobile-toggle"
              onClick={() => setMobile(!mobile)}
              aria-label="Buka navigasi"
            >
              <Menu />
            </button>
            <div className="institution">
              RSAU Prof. dr. Abdulrachman Saleh
              <small>Sistem Informasi Manajemen Administrasi Umum</small>
            </div>
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                navigate(`/surat-masuk?q=${encodeURIComponent(query)}`);
              }}
            >
              <Search size={18} />
              <input
                aria-label="Pencarian global surat"
                placeholder="Cari surat atau agenda…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button aria-label="Jalankan pencarian">
                <ChevronRight size={16} />
              </button>
            </form>
            <button
              className="notification-button"
              aria-label="Buka notifikasi"
              onClick={() => setNotification(true)}
            >
              <Bell size={20} />
              {notifications.some((n) => !n.read) && <i />}
            </button>
            <div className="profile">
              <span className="avatar">
                {user.name
                  .split(" ")
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <label>
                <span>{user.name}</span>
                <select
                  aria-label="Pilih peran demo"
                  value={user.id}
                  onChange={(e) => {
                    setUid(e.target.value);
                    localStorage.setItem("rsas-user", e.target.value);
                  }}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.role}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </header>
          <div className="demo-bar">
            <span className="live-dot" /> Mode Demo — Data tersimpan di browser
            ini{" "}
            <span className="demo-disclaimer">
              Pemilihan peran adalah simulasi
            </span>
          </div>
          <OfflineStatus />
          <main className="content">
            <div className="print-only">
              SIMINU RSAS · RSAU Prof. dr. Abdulrachman Saleh · CONTOH/DEMO
            </div>
            <div className="breadcrumb">
              Ruang kerja <ChevronRight size={13} />{" "}
              {nav.find(
                ([path]) => path !== "/" && location.pathname.startsWith(path),
              )?.[1] || "Beranda"}
            </div>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/surat-masuk" element={<Letters />} />
              <Route path="/surat-masuk/baru" element={<NewLetter />} />
              <Route path="/surat-masuk/:id" element={<Detail />} />
              <Route path="/disposisi" element={<DispositionCenter />} />
              <Route
                path="/disposisi/draf/:id"
                element={<DigitalDispositionEditor />}
              />
              <Route
                path="/disposisi/:id"
                element={<DigitalDispositionDetail />}
              />
              <Route
                path="/cetak-disposisi/draf/:id"
                element={<DigitalDispositionPrint isDraft />}
              />
              <Route
                path="/cetak-disposisi/:id"
                element={<DigitalDispositionPrint />}
              />
              <Route
                path="/laporan-disposisi"
                element={<DigitalDispositionReports />}
              />
              <Route path="/tugas" element={<Tasks />} />
              <Route path="/nota-dinas" element={<NotaDinas />} />
              <Route path="/nota-dinas/:id" element={<NoteEditor />} />
              <Route path="/naskah" element={<Drafting />} />
              <Route path="/naskah/:id" element={<DraftEditor />} />
              <Route
                path="/perlu-dibalas"
                element={<MailCenter view="reply" />}
              />
              <Route
                path="/konsep-surat"
                element={<MailCenter view="drafts" />}
              />
              <Route
                path="/pemeriksaan-surat"
                element={<MailCenter view="review" />}
              />
              <Route
                path="/register-nomor"
                element={<MailCenter view="numbers" />}
              />
              <Route path="/buku-ekspedisi" element={<MailDispatchBook />} />
              <Route path="/template-surat" element={<Drafting />} />
              <Route path="/rangkaian/:id" element={<MailThread />} />
              <Route path="/cetak-register" element={<PrintMailRegister />} />
              <Route
                path="/surat-keluar"
                element={
                  <>
                    <MailCenter view="outgoing" />
                    <Outgoing />
                  </>
                }
              />
              <Route path="/agenda" element={<LeadershipAgenda />} />
              <Route path="/notulen" element={<Minutes />} />
              <Route path="/notulen/:id" element={<Minutes />} />
              <Route path="/berkas-kegiatan" element={<Cases />} />
              <Route path="/pencarian" element={<ContentSearch />} />
              <Route path="/impor-register" element={<SpreadsheetImport />} />
              <Route
                path="/arsip"
                element={
                  <>
                    <Letters archive />
                    <MailCenter view="archive" />
                  </>
                }
              />
              <Route path="/analisis" element={<Analytics />} />
              <Route path="/laporan" element={<Reports />} />
              <Route path="/master" element={<Master />} />
              <Route path="/pengaturan" element={<Settings />} />
              <Route path="/pusat-data" element={<DataCenter />} />
              <Route path="/uji-coba" element={<Trial />} />
              <Route path="/bantuan" element={<InteractiveHelp />} />
              <Route path="/cetak/:id" element={<Print />} />
              <Route path="/cetak-detail/:id" element={<LetterPrint />} />
              <Route
                path="*"
                element={
                  <div className="empty">
                    <h1>Halaman tidak ditemukan</h1>
                    <Link to="/">Kembali ke Beranda</Link>
                  </div>
                }
              />
            </Routes>
            <footer className="app-footer">
              <span>
                SIMINU RSAS · Administrasi tertib, pelayanan lebih baik.
              </span>
              <span>Frontend demo · v6.0</span>
            </footer>
          </main>
        </div>
      </div>
      {notice && (
        <div className="toast" role="status">
          ✓ {notice}
        </div>
      )}
      {error && (
        <Modal title="Tindakan belum berhasil" onClose={() => setError("")}>
          <p role="alert">{error}</p>
          <p>
            Periksa ruang penyimpanan browser. Ekspor cadangan sebelum menghapus
            data situs.
          </p>
          <button onClick={() => setError("")}>Mengerti</button>
        </Modal>
      )}
      {notification && (
        <Modal
          title="Notifikasi aplikasi"
          onClose={() => setNotification(false)}
        >
          <p>Notifikasi hanya tersedia di dalam aplikasi ini.</p>
          {notifications
            .slice()
            .reverse()
            .map((n) => (
              <div className="mini-card" key={n.id}>
                <Link
                  to={
                    n.minutesId
                      ? `/notulen/${n.minutesId}`
                      : `/surat-masuk/${n.letterId}`
                  }
                  onClick={() => {
                    void run(
                      () => db.notifications.update(n.id, { read: true }),
                      "",
                    );
                    setNotification(false);
                  }}
                >
                  {n.text}
                </Link>
                <small>
                  {n.read ? "Sudah dibaca" : "Baru"} ·{" "}
                  {timestampLabel(n.createdAt)}
                </small>
              </div>
            ))}
        </Modal>
      )}
    </AppContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>,
);
