import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useUnsavedChanges } from "../app/unsaved";
import { db } from "../storage/db";
import { useApp } from "../app/context";
import { Calendar } from "../components/Calendar";
import { Modal, Field, Badge, Empty } from "../components/common";
import { agendaConflicts, saveAgenda, agendaICS } from "../repositories/agenda";
import type { AgendaEvent } from "../types";
import { id, today, dateLabel, download } from "../utils";
export function LeadershipAgenda() {
  const { run } = useApp();
  const [params] = useSearchParams();
  const events = useLiveQuery(() => db.events.toArray()) || [];
  const letters = useLiveQuery(() => db.letters.toArray()) || [];
  const users = useLiveQuery(() => db.users.toArray()) || [];
  const units = useLiveQuery(() => db.units.toArray()) || [];
  const tasks = useLiveQuery(() => db.tasks.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.get("main"));
  const [edit, setEdit] = useState<AgendaEvent>();
  useUnsavedChanges(!!edit, true);
  const [period, setPeriod] = useState("semua");
  const [view, setView] = useState(false);
  const [owner, setOwner] = useState("semua");
  const [conflicts, setConflicts] = useState<AgendaEvent[]>([]);
  const [ack, setAck] = useState(false);
  const newEvent = () => ({
    id: id(),
    title: letters.find((l) => l.id === params.get("source"))?.subject || "",
    date: today(),
    start: "08:00",
    end: "09:00",
    location: "",
    letterId: params.get("source") || undefined,
    participants: [],
    attendance: "Belum ditentukan" as const,
  });
  const weekEnd = new Date(Date.now() + 6 * 86400000)
    .toISOString()
    .slice(0, 10);
  const visible = events.filter(
    (e) =>
      (period === "semua" ||
        (period === "hari" && e.date === today()) ||
        (period === "minggu" && e.date >= today() && e.date <= weekEnd)) &&
      (owner === "semua" ||
        (owner === "kepala" &&
          users.find((u) => u.id === e.invitedUserId)?.role ===
            "Kepala RSAU") ||
        e.unitId === owner),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">AGENDA PIMPINAN & UNIT</p>
          <h1>Agenda</h1>
          <p className="muted">
            Undangan dikonfirmasi sebelum masuk agenda. Benturan adalah
            peringatan yang dapat ditinjau.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEdit(newEvent());
            setConflicts([]);
            setAck(false);
          }}
        >
          + Tambah kegiatan
        </button>
      </div>
      {params.get("source") && (
        <p className="callout">
          Surat sumber terpilih. Tekan Tambah kegiatan, periksa tanggal/waktu,
          lalu konfirmasi.
        </p>
      )}
      <div className="toolbar">
        <button onClick={() => setView(!view)}>
          {view ? "Tampilan daftar" : "Tampilan kalender"}
        </button>
        <button onClick={() => window.print()}>Cetak agenda</button>
        <Field label="Periode kegiatan">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="semua">Semua kegiatan</option>
            <option value="hari">Hari ini</option>
            <option value="minggu">7 hari mulai hari ini</option>
          </select>
        </Field>
        <Field label="Agenda pimpinan / unit">
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="semua">Semua agenda</option>
            <option value="kepala">Kepala RSAU</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <button
          onClick={() =>
            run(async () => {
              const timed = visible.filter((e) => e.start && e.end);
              if (!timed.length)
                throw Error("Lengkapi waktu kegiatan sebelum ekspor.");
              download(
                new Blob(
                  [agendaICS(timed, settings?.timezone || "Asia/Jakarta")],
                  { type: "text/calendar;charset=utf-8" },
                ),
                "agenda-rsas.ics",
              );
            }, "ICS diunduh. Kegiatan tanpa waktu belum disertakan.")
          }
        >
          Ekspor kalender ICS
        </button>
      </div>
      {view ? (
        <Calendar
          events={visible}
          tasks={tasks.filter(
            (t) => !["Selesai", "Dibatalkan"].includes(t.status),
          )}
        />
      ) : (
        <div className="task-grid">
          {visible.map((e) => (
            <article className="panel" key={e.id}>
              <Badge>Kegiatan</Badge>
              <h2>{e.title}</h2>
              <p>
                {dateLabel(e.date)} · {e.start || "—"}–{e.end || "—"} ·{" "}
                {e.location}
              </p>
              <small>
                {e.organizer || "Penyelenggara belum diisi"} ·{" "}
                {e.attendance || "Belum ditentukan"}
              </small>
              <p>
                Pejabat:{" "}
                {users.find((u) => u.id === e.invitedUserId)?.name || "—"}
                <br />
                Perwakilan:{" "}
                {users.find((u) => u.id === e.representativeId)?.name || "—"}
              </p>
              <p>{e.outcome}</p>
              {e.letterId && (
                <Link className="button" to={"/surat-masuk/" + e.letterId}>
                  Buka surat
                </Link>
              )}
              <button
                onClick={() => {
                  setEdit({ ...e });
                  setConflicts([]);
                  setAck(false);
                }}
              >
                Edit kegiatan / kehadiran
              </button>
              <Link className="button" to={"/notulen?agenda=" + e.id}>
                Buat / buka notulen
              </Link>
            </article>
          ))}
        </div>
      )}
      {!visible.length && (
        <Empty text="Tambahkan kegiatan atau hapus filter." />
      )}
      {edit && (
        <Modal
          title="Konfirmasi kegiatan dan undangan"
          onClose={() => setEdit(undefined)}
        >
          {(
            ["title", "date", "start", "end", "location", "organizer"] as const
          ).map((k, i) => (
            <Field
              key={k}
              label={
                [
                  "Nama kegiatan *",
                  "Tanggal *",
                  "Waktu mulai",
                  "Waktu selesai",
                  "Lokasi",
                  "Penyelenggara",
                ][i]
              }
            >
              <input
                type={
                  k === "date"
                    ? "date"
                    : ["start", "end"].includes(k)
                      ? "time"
                      : "text"
                }
                value={edit[k] || ""}
                onChange={(e) => {
                  setEdit({ ...edit, [k]: e.target.value });
                  setAck(false);
                  setConflicts([]);
                }}
              />
            </Field>
          ))}
          <Field label="Surat terkait">
            <select
              value={edit.letterId || ""}
              onChange={(e) =>
                setEdit({ ...edit, letterId: e.target.value || undefined })
              }
            >
              <option value="">Tidak terkait surat</option>
              {letters.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.subject}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Unit kegiatan">
            <select
              value={edit.unitId || ""}
              onChange={(e) =>
                setEdit({ ...edit, unitId: e.target.value || undefined })
              }
            >
              <option value="">Belum ditetapkan</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          {(["userId", "invitedUserId", "representativeId"] as const).map(
            (k, i) => (
              <Field
                key={k}
                label={
                  [
                    "Penanggung jawab",
                    "Pejabat yang diundang",
                    "Perwakilan yang ditunjuk",
                  ][i]
                }
              >
                <select
                  value={edit[k] || ""}
                  onChange={(e) => {
                    setEdit({ ...edit, [k]: e.target.value || undefined });
                    setAck(false);
                  }}
                >
                  <option value="">Belum ditetapkan</option>
                  {users
                    .filter((u) => u.active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} — {u.role}
                      </option>
                    ))}
                </select>
              </Field>
            ),
          )}
          <Field label="Peserta (pilih beberapa dengan Ctrl/Command)">
            <select
              multiple
              value={edit.participants || []}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  participants: Array.from(e.target.selectedOptions).map(
                    (o) => o.value,
                  ),
                })
              }
            >
              {users
                .filter((u) => u.active)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Status kehadiran">
            <select
              value={edit.attendance || "Belum ditentukan"}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  attendance: e.target.value as AgendaEvent["attendance"],
                })
              }
            >
              {["Belum ditentukan", "Hadir", "Diwakilkan", "Tidak hadir"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </Field>
          <Field label="Catatan hasil kegiatan">
            <textarea
              value={edit.outcome || ""}
              onChange={(e) => setEdit({ ...edit, outcome: e.target.value })}
            />
          </Field>
          {conflicts.length > 0 && (
            <div className="warning">
              <strong>Benturan jadwal</strong>
              {conflicts.map((c) => (
                <p key={c.id}>
                  {c.title} · {c.start}–{c.end}
                </p>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />{" "}
                Saya sudah meninjau benturan dan tetap menjadwalkan kegiatan
              </label>
            </div>
          )}
          <button
            className="primary"
            disabled={
              !edit.title.trim() ||
              !edit.date ||
              !edit.start ||
              !edit.end ||
              edit.end <= edit.start
            }
            onClick={() =>
              run(async () => {
                const found = await agendaConflicts(edit);
                if (found.length && !ack) {
                  setConflicts(found);
                  return;
                }
                await saveAgenda(edit, ack);
                setEdit(undefined);
                await run(
                  async () => {},
                  "Kegiatan dikonfirmasi dan disimpan.",
                );
              }, "")
            }
          >
            Konfirmasi & simpan kegiatan
          </button>
        </Modal>
      )}
    </>
  );
}
