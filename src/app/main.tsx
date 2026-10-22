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
import { db } from "../storage/db";
import { seed } from "../storage/seed";
import { AppContext } from "./context";
import { Dashboard, Tasks } from "../features/Dashboard";
import { Letters, NewLetter } from "../features/Letters";
import { Detail } from "../features/Detail";
import { Print } from "../features/Print";
import {
  Outgoing,
  Agenda,
  Master,
  Settings,
  Reports,
} from "../features/Supporting";
import { Modal } from "../components/common";
import "../styles/app.css";
const nav = [
  ["/", "Beranda", LayoutDashboard],
  ["/surat-masuk", "Surat Masuk", Mail],
  ["/disposisi", "Disposisi", GitBranch],
  ["/tugas", "Tugas Saya", ClipboardCheck],
  ["/surat-keluar", "Surat Keluar", Send],
  ["/agenda", "Agenda", CalendarDays],
  ["/arsip", "Arsip", Archive],
  ["/laporan", "Laporan", BarChart3],
  ["/master", "Master Data", Database],
  ["/pengaturan", "Pengaturan", SettingsIcon],
] as const;
function App() {
  const users = useLiveQuery(() => db.users.toArray()) || [];
  const [uid, setUid] = useState(localStorage.getItem("rsas-user") || "user-0");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [notification, setNotification] = useState(false);
  const [query, setQuery] = useState("");
  const letterCount = useLiveQuery(() => db.letters.count()) || 0;
  const notifications = useLiveQuery(() => db.notifications.toArray()) || [];
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    seed()
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
  const print = location.pathname.startsWith("/cetak/");
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
                      {path === "/surat-masuk" && <em>{letterCount}</em>}
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
          <main className="content">
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
              <Route path="/disposisi" element={<Letters dispositions />} />
              <Route path="/tugas" element={<Tasks />} />
              <Route path="/surat-keluar" element={<Outgoing />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/arsip" element={<Letters archive />} />
              <Route path="/laporan" element={<Reports />} />
              <Route path="/master" element={<Master />} />
              <Route path="/pengaturan" element={<Settings />} />
              <Route path="/cetak/:id" element={<Print />} />
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
              <span>Frontend demo · v1.0</span>
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
                  to={`/surat-masuk/${n.letterId}`}
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
                  {new Date(n.createdAt).toLocaleString("id-ID")}
                </small>
              </div>
            ))}
        </Modal>
      )}
    </AppContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
