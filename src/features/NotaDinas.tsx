import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { useApp } from "../app/context";
import { noteStatuses } from "../types";
import { createNote, duplicateNote } from "../repositories/nota";
import { Field, Modal, Badge, Empty } from "../components/common";
import { dateLabel, timestampLabel } from "../utils";
import { NoteSettings } from "./NoteSettings";
export function NotaDinas() {
  const { user, run } = useApp(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const notes = useLiveQuery(() => db.notes.toArray()) || [],
    units = useLiveQuery(() => db.units.toArray()) || [],
    users = useLiveQuery(() => db.users.toArray()) || [],
    templates = useLiveQuery(() => db.noteTemplates.toArray()) || [];
  const [create, setCreate] = useState(!!params.get("surat")),
    [settings, setSettings] = useState(false);
  const [tid, setTid] = useState("nota-template-6"),
    [unit, setUnit] = useState(user.unitId);
  const [query, setQuery] = useState(""),
    [year, setYear] = useState(""),
    [uf, setUf] = useState(""),
    [af, setAf] = useState(""),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("updatedAt");
  const filtered = notes
    .filter(
      (n) =>
        (!year || n.content.conceptDate.startsWith(year)) &&
        (!uf || n.content.unitId === uf) &&
        (!af || n.authorId === af) &&
        (!status || n.status === status) &&
        [
          n.officialNumber,
          n.content.to,
          n.content.subject,
          n.content.basis.join(" "),
          n.content.opening,
          n.content.discussion,
          n.content.request,
          n.content.closing,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      (sort === "date" ? b.content.conceptDate : b.updatedAt).localeCompare(
        sort === "date" ? a.content.conceptDate : a.updatedAt,
      ),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">NASKAH INTERNAL RSAS</p>
          <h1>Nota Dinas</h1>
          <p className="muted">
            Konsep, pemeriksaan simulasi, penomoran, dan arsip lokal.
          </p>
        </div>
        <div className="toolbar">
          <button onClick={() => setCreate(true)} className="primary">
            Buat nota dinas
          </button>
          {user.role === "Admin Sistem" && (
            <button onClick={() => setSettings(true)}>
              Template & pengaturan nota
            </button>
          )}
        </div>
      </div>
      <section className="panel">
        <div className="filters">
          <Field label="Cari nota dinas">
            <input
              placeholder="Nomor, perihal, tujuan, atau isi"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          <Field label="Tahun nota">
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">Semua tahun</option>
              {[...new Set(notes.map((n) => n.content.conceptDate.slice(0, 4)))]
                .sort()
                .map((y) => (
                  <option key={y}>{y}</option>
                ))}
            </select>
          </Field>
          <Field label="Unit pembuat">
            <select value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="">Semua unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pembuat nota">
            <select value={af} onChange={(e) => setAf(e.target.value)}>
              <option value="">Semua pembuat</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status nota">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Semua status</option>
              {noteStatuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Urutkan nota">
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="updatedAt">Perubahan terakhir</option>
              <option value="date">Tanggal konsep</option>
            </select>
          </Field>
        </div>
        {filtered.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Nomor / Perihal",
                    "Unit / Pembuat",
                    "Tujuan / Tanggal",
                    "Status / Pemeriksa berikutnya",
                    "Diubah",
                    "Tindakan",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((n) => (
                  <tr key={n.id}>
                    <td>
                      <Link className="text-link" to={"/nota-dinas/" + n.id}>
                        {n.officialNumber || "Belum bernomor"}
                      </Link>
                      <br />
                      {n.content.subject || "Tanpa perihal"}
                    </td>
                    <td>
                      {units.find((u) => u.id === n.content.unitId)?.name}
                      <small>
                        {users.find((u) => u.id === n.authorId)?.name}
                      </small>
                    </td>
                    <td>
                      {n.content.to}
                      <small>{dateLabel(n.content.conceptDate)}</small>
                    </td>
                    <td>
                      <Badge>{n.status}</Badge>
                      <small>
                        {["Diajukan", "Dalam pemeriksaan"].includes(n.status)
                          ? users.find(
                              (u) => u.id === n.reviewerIds[n.reviewIndex],
                            )?.name || "Kepala RSAU / admin"
                          : "—"}
                      </small>
                    </td>
                    <td>{timestampLabel(n.updatedAt)}</td>
                    <td>
                      <Link
                        className="button"
                        to={"/nota-dinas/" + n.id + "#riwayat"}
                      >
                        Riwayat
                      </Link>
                      <button
                        onClick={() =>
                          run(async () => {
                            const d = await duplicateNote(n.id, user.id);
                            navigate("/nota-dinas/" + d.id);
                          }, "Draf duplikat dibuat; nomor dan persetujuan dikosongkan.")
                        }
                      >
                        Duplikasikan
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Belum ada nota yang sesuai. Buat nota dinas atau ubah filter." />
        )}
      </section>
      {create && (
        <Modal title="Nota dinas baru" onClose={() => setCreate(false)}>
          <Field label="Template isi nota">
            <select value={tid} onChange={(e) => setTid(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <p>{templates.find((t) => t.id === tid)?.instructions}</p>
          <Field label="Unit konsep">
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {units
                .filter((u) => u.active)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </Field>
          <p className="muted">
            Identitas IT hanya diisi dari profil yang terhubung ke unit
            IT/SIMRS. Periksa penandatangan dan format sebelum pengajuan.
          </p>
          {params.get("surat") && (
            <p>Konsep ini akan mengacu pada surat masuk yang dipilih.</p>
          )}
          <button
            className="primary"
            onClick={() =>
              run(async () => {
                const n = await createNote(
                  tid,
                  user.id,
                  unit,
                  params.get("surat") || "",
                );
                setCreate(false);
                navigate("/nota-dinas/" + n.id);
              }, "Nota dinas dibuat.")
            }
          >
            Buka editor nota
          </button>
        </Modal>
      )}
      {settings && <NoteSettings onClose={() => setSettings(false)} />}
    </>
  );
}
