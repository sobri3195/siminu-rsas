import { useState } from "react";
import {
  Link,
  useParams,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import type { MeetingMinutes } from "../types";
import { saveMinutes, decisionTasks } from "../repositories/minutes";
import { minutesDocx } from "../repositories/docx";
import { useApp } from "../app/context";
import { useUnsavedChanges } from "../app/unsaved";
import { Field, Empty, Badge } from "../components/common";
import { TaskCard } from "./Detail";
import { id, now, today, download, dateLabel } from "../utils";
export function Minutes() {
  const { id: mid } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const minutes = useLiveQuery(() => db.minutes.toArray()) || [];
  const { user } = useApp();
  const [fresh, setFresh] = useState<MeetingMinutes>();
  const selected = minutes.find((m) => m.id === mid) || fresh;
  return selected ? (
    <MinutesWorkspace key={selected.id} original={selected} />
  ) : (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RAPAT & TINDAK LANJUT</p>
          <h1>Notulen</h1>
        </div>
        <button
          className="primary"
          onClick={() =>
            setFresh({
              id: id(),
              title: "",
              date: today(),
              chair: user.name,
              participants: "",
              discussion: "",
              decisions: [],
              agendaId: params.get("agenda") || undefined,
              attachmentIds: [],
              revision: 0,
              createdAt: now(),
              updatedAt: now(),
            })
          }
        >
          Buat notulen
        </button>
      </div>
      <div className="task-grid">
        {minutes
          .filter(
            (m) => !params.get("agenda") || m.agendaId === params.get("agenda"),
          )
          .map((m) => (
            <article className="panel" key={m.id}>
              <h2>{m.title}</h2>
              <p>
                {dateLabel(m.date)} · {m.chair}
              </p>
              <button onClick={() => navigate("/notulen/" + m.id)}>
                Buka notulen
              </button>
            </article>
          ))}
      </div>
      {!minutes.length && (
        <Empty text="Buat notulen atau buka dari agenda kegiatan." />
      )}
    </>
  );
}
function MinutesWorkspace({ original }: { original: MeetingMinutes }) {
  const { run } = useApp();
  const navigate = useNavigate();
  const [m, setM] = useState(original);
  const [saved, setSaved] = useState(original);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const agendas = useLiveQuery(() => db.events.toArray()) || [];
  const users = useLiveQuery(() => db.users.toArray()) || [];
  const units = useLiveQuery(() => db.units.toArray()) || [];
  const tasks =
    useLiveQuery(() => db.tasks.where({ minutesId: m.id }).toArray(), [m.id]) ||
    [];
  useUnsavedChanges(
    JSON.stringify(m) !== JSON.stringify(saved) || !!files.length,
    true,
  );
  const commit = async () => {
    setBusy(true);
    try {
      const source = agendas.find((e) => e.id === m.agendaId);
      const next = await saveMinutes(
        { ...m, letterId: source?.letterId },
        saved.revision,
        files,
      );
      setM(next);
      setSaved(next);
      setFiles([]);
      return next;
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            NOTULEN / {m.revision ? `REVISI ${m.revision}` : "BARU"}
          </p>
          <h1>{m.title || "Notulen rapat baru"}</h1>
        </div>
        <Link className="button" to="/notulen">
          Daftar notulen
        </Link>
      </div>
      <section className="panel">
        <div className="toolbar no-print">
          <button
            className="primary"
            disabled={busy}
            onClick={() => run(commit, "Notulen dan lampiran tersimpan.")}
          >
            Simpan notulen
          </button>
          <button
            onClick={() =>
              run(
                async () => download(await minutesDocx(m), "notulen.docx"),
                "DOCX notulen dibuat.",
              )
            }
          >
            Ekspor DOCX notulen
          </button>
          <button
            onClick={() => {
              setPrinting(true);
              setTimeout(() => window.print(), 100);
            }}
          >
            Cetak notulen
          </button>
          {printing && (
            <button onClick={() => setPrinting(false)}>
              Kembali ke formulir
            </button>
          )}
        </div>
        {printing ? (
          <article className="print-sheet">
            <h1>NOTULEN RAPAT</h1>
            <p className="demo-stamp">CONTOH/DEMO</p>
            <h2>{m.title}</h2>
            <p>
              {dateLabel(m.date)} · Pimpinan: {m.chair}
            </p>
            <p>Peserta: {m.participants}</p>
            <p style={{ whiteSpace: "pre-wrap" }}>{m.discussion}</p>
            {m.decisions.map((d, i) => (
              <p key={d.id}>
                {i + 1}. {d.text} · PIC:{" "}
                {users.find((u) => u.id === d.userId)?.name} · Tenggat{" "}
                {dateLabel(d.deadline)}
              </p>
            ))}
          </article>
        ) : (
          <div className="no-print">
            <div className="grid2">
              {(
                [
                  "title",
                  "date",
                  "chair",
                  "participants",
                  "discussion",
                ] as const
              ).map((k, i) => (
                <Field
                  key={k}
                  label={
                    [
                      "Judul rapat *",
                      "Tanggal rapat *",
                      "Pimpinan rapat *",
                      "Peserta rapat",
                      "Pokok pembahasan",
                    ][i]
                  }
                >
                  {k === "discussion" ? (
                    <textarea
                      value={m[k]}
                      onChange={(e) => setM({ ...m, [k]: e.target.value })}
                    />
                  ) : (
                    <input
                      type={k === "date" ? "date" : "text"}
                      value={m[k]}
                      onChange={(e) => setM({ ...m, [k]: e.target.value })}
                    />
                  )}
                </Field>
              ))}
              <Field label="Agenda sumber">
                <select
                  value={m.agendaId || ""}
                  onChange={(e) =>
                    setM({ ...m, agendaId: e.target.value || undefined })
                  }
                >
                  <option value="">Tidak terkait agenda</option>
                  {agendas.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <h2>Keputusan dan tindak lanjut</h2>
            {m.decisions.map((d, i) => (
              <section className="mini-card" key={d.id}>
                <Field label={`Keputusan ${i + 1}`}>
                  <textarea
                    disabled={!!d.taskId}
                    value={d.text}
                    onChange={(e) =>
                      setM({
                        ...m,
                        decisions: m.decisions.map((v) =>
                          v.id === d.id ? { ...v, text: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </Field>
                <div className="grid3">
                  <Field label={`Penanggung jawab keputusan ${i + 1}`}>
                    <select
                      disabled={!!d.taskId}
                      value={d.userId}
                      onChange={(e) =>
                        setM({
                          ...m,
                          decisions: m.decisions.map((v) =>
                            v.id === d.id
                              ? { ...v, userId: e.target.value }
                              : v,
                          ),
                        })
                      }
                    >
                      <option value="">Pilih pengguna</option>
                      {users
                        .filter((u) => u.active)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label={`Unit keputusan ${i + 1}`}>
                    <select
                      disabled={!!d.taskId}
                      value={d.unitId}
                      onChange={(e) =>
                        setM({
                          ...m,
                          decisions: m.decisions.map((v) =>
                            v.id === d.id
                              ? { ...v, unitId: e.target.value }
                              : v,
                          ),
                        })
                      }
                    >
                      <option value="">Pilih unit</option>
                      {units
                        .filter((u) => u.active)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label={`Tenggat keputusan ${i + 1}`}>
                    <input
                      disabled={!!d.taskId}
                      type="date"
                      value={d.deadline}
                      onChange={(e) =>
                        setM({
                          ...m,
                          decisions: m.decisions.map((v) =>
                            v.id === d.id
                              ? { ...v, deadline: e.target.value }
                              : v,
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
                {d.taskId && (
                  <Badge>
                    Tugas telah dibuat — keputusan tidak disalin ulang
                  </Badge>
                )}
              </section>
            ))}
            <button
              onClick={() =>
                setM({
                  ...m,
                  decisions: [
                    ...m.decisions,
                    {
                      id: id(),
                      text: "",
                      userId: "",
                      unitId: "",
                      deadline: today(),
                    },
                  ],
                })
              }
            >
              Tambah keputusan
            </button>
            <Field label="Lampiran / bukti rapat">
              <input
                type="file"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
            </Field>
            <button
              className="primary"
              disabled={busy || !m.decisions.length}
              onClick={() => {
                if (
                  !confirm(
                    `Konfirmasi membuat tugas untuk ${m.decisions.filter((d) => !d.taskId).length} keputusan baru? Tugas yang sudah ada dilewati.`,
                  )
                )
                  return;
                void run(async () => {
                  const next = await commit();
                  const result = await decisionTasks(
                    next.id,
                    next.decisions.map((d) => d.id),
                    true,
                  );
                  const updated = (await db.minutes.get(next.id))!;
                  setM(updated);
                  setSaved(updated);
                  await run(
                    async () => {},
                    `${result.created} tugas dibuat, ${result.skipped} keputusan dilewati.`,
                  );
                }, "");
              }}
            >
              Konfirmasi buat tugas keputusan
            </button>
            <div className="task-grid">
              {tasks.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
