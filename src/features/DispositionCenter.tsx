import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, dataMode } from "../storage/db";
import { useApp } from "../app/context";
import { Field, Badge, Modal, Empty } from "../components/common";
import {
  createDispositionDraft,
  dispositionProgress,
} from "../repositories/digitalDisposition";
import { prepareDispositionExample } from "../repositories/dispositionExample";
import { dateLabel, timestampLabel, today } from "../utils";
import type { Disposition, IncomingLetter } from "../types";
export const dispositionTabs = [
  "Perlu disposisi",
  "Disposisi saya",
  "Diterima unit saya",
  "Menunggu hasil",
  "Menunggu pemeriksaan",
  "Selesai",
  "Dibatalkan",
];
export function DispositionCenter() {
  const { user, run } = useApp(),
    navigate = useNavigate(),
    [p, setP] = useSearchParams();
  const letters = useLiveQuery(() => db.letters.toArray()) || [],
    ds = useLiveQuery(() => db.dispositions.toArray()) || [],
    tasks = useLiveQuery(() => db.tasks.toArray()) || [],
    receipts = useLiveQuery(() => db.recipientReceipts.toArray()) || [],
    units = useLiveQuery(() => db.units.toArray()) || [],
    users = useLiveQuery(() => db.users.toArray()) || [],
    drafts = useLiveQuery(() => db.dispositionDrafts.toArray()) || [];
  const [create, setCreate] = useState(false),
    [letter, setLetter] = useState(p.get("surat") || "");
  const tab =
    p.get("tab") || (p.get("surat") ? "Semua arahan" : "Perlu disposisi");
  const settings = useLiveQuery(() => db.settings.get("main"));
  const dateKey = (v: string) =>
    v.length === 10
      ? v
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: settings?.timezone || "Asia/Jakarta",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(v));
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(p);
    value ? next.set(key, value) : next.delete(key);
    if (key !== "page") next.delete("page");
    setP(next);
  };
  const rows: { letter: IncomingLetter; disposition?: Disposition }[] = [
    ...letters
      .filter(
        (l) =>
          l.status !== "Draf" &&
          l.status !== "Diarsipkan" &&
          !ds.some((d) => d.letterId === l.id && !d.cancelled),
      )
      .map((letter) => ({ letter })),
    ...ds
      .map((disposition) => ({
        disposition,
        letter: letters.find((l) => l.id === disposition.letterId)!,
      }))
      .filter((r) => r.letter),
  ];
  const matchesTab = (r: (typeof rows)[number], chosen: string) => {
    const d = r.disposition,
      ts = tasks.filter(
        (t) =>
          t.dispositionId === d?.id && t.status !== "Dibatalkan" && !t.retired,
      ),
      status = d
        ? dispositionProgress(d, tasks, receipts).status
        : "Perlu disposisi";
    if (chosen === "Semua arahan") return true;
    if (chosen === "Perlu disposisi") return !d;
    if (!d) return false;
    if (chosen === "Dibatalkan") return !!d.cancelled;
    if (d.cancelled) return false;
    if (chosen === "Disposisi saya")
      return d.issuerId === user.id || d.giver === user.name;
    if (chosen === "Diterima unit saya")
      return (
        d.recipients.some((r) => r.unitId === user.unitId) ||
        ts.some((t) => t.unitId === user.unitId)
      );
    if (chosen === "Menunggu hasil")
      return ts.some((t) => !["Selesai", "Hasil dikirim"].includes(t.status));
    if (chosen === "Menunggu pemeriksaan")
      return ts.some((t) => t.status === "Hasil dikirim");
    return (
      status === "Selesai" ||
      (d.mode === "Untuk diketahui" &&
        receipts
          .filter((r) => r.dispositionId === d.id && !r.retired)
          .every((r) => r.readAt))
    );
  };
  const base = rows.filter((r) => {
    const l = r.letter,
      d = r.disposition,
      ts = tasks.filter(
        (t) =>
          t.dispositionId === d?.id &&
          !["Selesai", "Dibatalkan"].includes(t.status),
      );
    return (
      (!p.get("surat") || l.id === p.get("surat")) &&
      (!p.get("from") ||
        dateKey(d?.issuedAt || d?.createdAt || l.received) >= p.get("from")!) &&
      (!p.get("to") ||
        dateKey(d?.issuedAt || d?.createdAt || l.received) <= p.get("to")!) &&
      (!p.get("unit") ||
        d?.recipients.some((r) => r.unitId === p.get("unit"))) &&
      (!p.get("recipient") ||
        d?.recipients.some((r) => r.userId === p.get("recipient"))) &&
      (!p.get("urgency") || l.urgency === p.get("urgency")) &&
      (!p.get("classification") ||
        l.classification === p.get("classification")) &&
      (!p.get("deadline") ||
        ts.some((t) =>
          p.get("deadline") === "late"
            ? t.deadline && t.deadline < today()
            : p.get("deadline") === "today"
              ? t.deadline === today()
              : !t.deadline,
        )) &&
      [
        l.agenda,
        l.number,
        l.subject,
        l.sender,
        d?.giver,
        d?.notes,
        ...(d?.recipients.map((r) => r.unitName + " " + r.userName) || []),
      ]
        .join(" ")
        .toLowerCase()
        .includes((p.get("q") || "").toLowerCase())
    );
  });
  const sorted = base
    .filter((r) => matchesTab(r, tab))
    .sort((a, b) =>
      p.get("sort") === "agenda"
        ? a.letter.agenda.localeCompare(b.letter.agenda)
        : (b.disposition?.createdAt || b.letter.received).localeCompare(
            a.disposition?.createdAt || a.letter.received,
          ),
    );
  const size = Number(p.get("size")) || 10,
    page = Math.max(
      1,
      Math.min(
        Number(p.get("page")) || 1,
        Math.ceil(sorted.length / size) || 1,
      ),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ARAHAN DAN TINDAK LANJUT</p>
          <h1>Disposisi Digital</h1>
          <p className="muted">
            Peran lokal adalah simulasi. Data dan pengingat tersedia di browser
            ini.
          </p>
        </div>
        <div className="toolbar">
          {["Admin Sistem", "Kepala RSAU"].includes(user.role) && (
            <button className="primary" onClick={() => setCreate(true)}>
              Buat arahan digital
            </button>
          )}
          <Link className="button" to="/laporan-disposisi">
            Laporan disposisi
          </Link>
          {dataMode === "demo" &&
            ["Admin Sistem", "Kepala RSAU"].includes(user.role) && (
              <button
                onClick={() =>
                  run(async () => {
                    const draft = await prepareDispositionExample(user.id);
                    navigate("/disposisi/draf/" + draft);
                  }, "Contoh disiapkan tanpa menerbitkan arahan.")
                }
              >
                Siapkan contoh digital
              </button>
            )}
        </div>
      </div>
      <div className="digital-summary">
        {dispositionTabs.map((t) => (
          <button
            key={t}
            onClick={() => set("tab", t)}
            aria-pressed={tab === t}
          >
            <strong>{base.filter((r) => matchesTab(r, t)).length}</strong>
            {t}
          </button>
        ))}
      </div>
      <section className="panel">
        <div className="filters">
          <Field label="Cari disposisi">
            <input
              value={p.get("q") || ""}
              onChange={(e) => set("q", e.target.value)}
              placeholder="Agenda, nomor, perihal, pengirim, penerima"
            />
          </Field>
          {[
            ["from", "Periode mulai"],
            ["to", "Periode akhir"],
          ].map(([k, n]) => (
            <Field label={n} key={k}>
              <input
                type="date"
                value={p.get(k) || ""}
                onChange={(e) => set(k, e.target.value)}
              />
            </Field>
          ))}
          <Field label="Filter unit disposisi">
            <select
              value={p.get("unit") || ""}
              onChange={(e) => set("unit", e.target.value)}
            >
              <option value="">Semua unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Filter penerima">
            <select
              value={p.get("recipient") || ""}
              onChange={(e) => set("recipient", e.target.value)}
            >
              <option value="">Semua penerima</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          {(["urgency", "classification"] as const).map((k, i) => (
            <Field key={k} label={["Filter derajat", "Filter klasifikasi"][i]}>
              <select
                value={p.get(k) || ""}
                onChange={(e) => set(k, e.target.value)}
              >
                <option value="">Semua</option>
                {[...new Set(letters.map((l) => l[k]))].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
          ))}
          <Field label="Filter tenggat">
            <select
              value={p.get("deadline") || ""}
              onChange={(e) => set("deadline", e.target.value)}
            >
              <option value="">Semua tenggat</option>
              <option value="today">Jatuh tempo hari ini</option>
              <option value="late">Terlambat</option>
              <option value="none">Tanpa tenggat</option>
            </select>
          </Field>
          <Field label="Urutan disposisi">
            <select
              value={p.get("sort") || "date"}
              onChange={(e) => set("sort", e.target.value)}
            >
              <option value="date">Tanggal terbaru</option>
              <option value="agenda">Nomor agenda</option>
            </select>
          </Field>
          <Field label="Baris per halaman">
            <select value={size} onChange={(e) => set("size", e.target.value)}>
              {[10, 25, 50].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
        </div>
        <p>
          Periode berdasarkan tanggal penerbitan disposisi; surat tanpa
          disposisi memakai tanggal penerimaan.{" "}
          {p.get("surat") && (
            <button onClick={() => set("surat", "")}>
              Tampilkan semua surat
            </button>
          )}
        </p>
        <h2>
          {tab} · {sorted.length}
        </h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "Agenda / Nomor / Perihal",
                  "Pengirim / Pemberi",
                  "Penerima utama / Derajat",
                  "Tanggal / Tenggat terdekat",
                  "Progres / Status",
                  "Tindakan berikutnya",
                ].map((t) => (
                  <th key={t}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted
                .slice((page - 1) * size, page * size)
                .map(({ letter: l, disposition: d }) => {
                  const progress = d
                      ? dispositionProgress(d, tasks, receipts)
                      : undefined,
                    deadline = tasks
                      .filter(
                        (t) =>
                          t.dispositionId === d?.id &&
                          !["Selesai", "Dibatalkan"].includes(t.status) &&
                          t.deadline,
                      )
                      .map((t) => t.deadline)
                      .sort()[0];
                  return (
                    <tr key={d?.id || l.id}>
                      <td>
                        <strong>{l.agenda}</strong>
                        <small>{l.number}</small>
                        {l.subject}
                      </td>
                      <td>
                        {l.sender}
                        <small>{d?.giver || "Belum diterbitkan"}</small>
                      </td>
                      <td>
                        {d?.recipients
                          .filter((r) => r.kind === "Utama")
                          .map((r) => r.unitName)
                          .join(", ") || "—"}
                        <small>
                          {l.urgency} · {l.classification}
                        </small>
                      </td>
                      <td>
                        {dateLabel(d?.createdAt || l.received)}
                        <small>
                          {deadline
                            ? dateLabel(deadline)
                            : "Tanpa tenggat terbuka"}
                        </small>
                      </td>
                      <td>
                        {progress && (
                          <small>
                            {progress.done} dari {progress.total}{" "}
                            {progress.label}
                          </small>
                        )}
                        <Badge>{progress?.status || "Perlu disposisi"}</Badge>
                      </td>
                      <td>
                        {d ? (
                          <Link
                            className="button"
                            to={
                              d.digital
                                ? "/disposisi/" + d.id
                                : "/surat-masuk/" + l.id
                            }
                          >
                            {d.digital
                              ? "Baca / tindak lanjuti"
                              : "Buka disposisi lama"}
                          </Link>
                        ) : (
                          <button
                            disabled={
                              !["Admin Sistem", "Kepala RSAU"].includes(
                                user.role,
                              )
                            }
                            onClick={() =>
                              run(async () => {
                                const draft = await createDispositionDraft(
                                  l.id,
                                  user.id,
                                );
                                navigate("/disposisi/draf/" + draft.id);
                              }, "")
                            }
                          >
                            Susun arahan
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {!sorted.length && (
          <Empty text="Tidak ada disposisi/surat sesuai tab dan filter." />
        )}
        <div className="pagination">
          <button
            disabled={page <= 1}
            onClick={() => set("page", String(page - 1))}
          >
            Sebelumnya
          </button>
          <span>
            Halaman {page} / {Math.ceil(sorted.length / size) || 1}
          </span>
          <button
            disabled={page * size >= sorted.length}
            onClick={() => set("page", String(page + 1))}
          >
            Berikutnya
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Draf arahan tersimpan</h2>
        {drafts
          .filter(
            (d) =>
              !d.publishedId &&
              (d.authorId === user.id || user.role === "Admin Sistem"),
          )
          .map((d) => (
            <p key={d.id}>
              <Link to={"/disposisi/draf/" + d.id}>
                {letters.find((l) => l.id === d.content.letterId)?.subject ||
                  d.id}
              </Link>{" "}
              · {d.sourceId ? "Revisi" : "Draf baru"} ·{" "}
              {timestampLabel(d.updatedAt)}
            </p>
          ))}
      </section>
      {create && (
        <Modal title="Pilih surat sumber" onClose={() => setCreate(false)}>
          <Field label="Surat sumber disposisi">
            <select value={letter} onChange={(e) => setLetter(e.target.value)}>
              <option value="">Pilih surat</option>
              {letters
                .filter((l) => l.status !== "Diarsipkan")
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.agenda} · {l.subject}
                  </option>
                ))}
            </select>
          </Field>
          <button
            className="primary"
            disabled={!letter}
            onClick={() =>
              run(async () => {
                const d = await createDispositionDraft(letter, user.id);
                setCreate(false);
                navigate("/disposisi/draf/" + d.id);
              }, "")
            }
          >
            Buka draf arahan
          </button>
        </Modal>
      )}
    </>
  );
}
