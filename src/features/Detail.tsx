import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Download,
  ExternalLink,
  Printer,
  Send,
  Plus,
  ZoomIn,
} from "lucide-react";
import { db } from "../storage/db";
import { LetterEditor } from "./LetterEditor";
import { toggleFavorite } from "../repositories/letters";
import { useUnsavedChanges } from "../app/unsaved";
import { useApp } from "../app/context";
import {
  archive,
  canIssue,
  canRegister,
  issue,
  log,
  taskAction,
  delegate,
  cancelDisposition,
} from "../repositories/workflow";
import { Badge, Empty, Field, Modal } from "../components/common";
import {
  timestampLabel,
  dateLabel,
  download,
  id,
  instructions,
  now,
  today,
} from "../utils";
import type {
  Attachment,
  Disposition,
  DispositionRecipient,
  Task,
} from "../types";
export function Preview({ file }: { file: Attachment }) {
  const [url, setUrl] = useState("");
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    const u = URL.createObjectURL(file.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <>
      <div className="preview-tools">
        <span>{file.name}</span>
        <button onClick={() => setZoom(zoom === 150 ? 100 : zoom + 25)}>
          <ZoomIn size={16} /> {zoom}%
        </button>
        <a className="button" href={url} target="_blank" rel="noreferrer">
          <ExternalLink size={16} /> Buka
        </a>
        <button onClick={() => download(file.blob, file.name)}>
          <Download size={16} /> Unduh
        </button>
      </div>
      <div className="document-preview">
        {!url ? (
          <p>Menyiapkan pratinjau berkas lokal…</p>
        ) : file.type === "application/pdf" ? (
          <object
            data={url}
            type="application/pdf"
            style={{ width: `${zoom}%`, height: 680 }}
          >
            <p>
              Browser tidak mendukung pratinjau PDF.{" "}
              <a href={url} target="_blank" rel="noreferrer">
                Buka dokumen
              </a>{" "}
              atau unduh.
            </p>
          </object>
        ) : file.type.startsWith("image/") ? (
          <img src={url} alt={file.name} style={{ width: `${zoom}%` }} />
        ) : (
          <Empty text="Pratinjau format ini tidak tersedia. Gunakan tombol Unduh." />
        )}
      </div>
    </>
  );
}
export function Detail() {
  const { id: lid = "" } = useParams();
  const { user, run } = useApp();
  const letter = useLiveQuery(() => db.letters.get(lid), [lid]);
  const files =
    useLiveQuery(
      () => db.attachments.where({ letterId: lid }).toArray(),
      [lid],
    ) || [];
  const ds =
    useLiveQuery(
      () => db.dispositions.where({ letterId: lid }).toArray(),
      [lid],
    ) || [];
  const tasks =
    useLiveQuery(() => db.tasks.where({ letterId: lid }).toArray(), [lid]) ||
    [];
  const logs =
    useLiveQuery(
      () => db.activities.where({ letterId: lid }).toArray(),
      [lid],
    ) || [];
  const comments =
    useLiveQuery(() => db.comments.where({ letterId: lid }).toArray(), [lid]) ||
    [];
  const [tab, setTab] = useState("Ringkasan");
  const [edit, setEdit] = useState<"edit" | "cancel">();
  const [fileId, setFileId] = useState("");
  const [disposition, setDisposition] = useState<boolean | Disposition>(false);
  const [comment, setComment] = useState("");
  const [cancel, setCancel] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const activeTasks = tasks.filter(
    (t) => !ds.find((d) => d.id === t.dispositionId)?.cancelled,
  );
  useEffect(() => {
    void run(async () => {
      for (const task of await db.tasks
        .where({ letterId: lid, userId: user.id })
        .toArray())
        if (
          task.status === "Belum dibaca" &&
          !(await db.dispositions.get(task.dispositionId))?.cancelled
        )
          await taskAction(task.id, "read", user.name);
    }, "");
  }, [lid, user.id]);
  if (!letter) return <Empty text="Memuat surat atau surat tidak ditemukan." />;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SURAT MASUK / {letter.agenda}</p>
          <h1>{letter.subject}</h1>
          <p className="muted">
            {letter.sender} · {letter.number}
          </p>
        </div>
        <Link className="button" to={`/cetak/${lid}`}>
          <Printer size={18} /> Cetak disposisi
        </Link>
      </div>
      <div className="toolbar">
        <button
          onClick={() => run(() => toggleFavorite(lid), "Favorit diperbarui.")}
        >
          {letter.favorite ? "★ Hapus favorit" : "☆ Pin / favorit"}
        </button>
        <Link className="button" to={`/cetak-detail/${lid}`}>
          Cetak detail surat
        </Link>
        {canRegister(user.role) && (
          <>
            <button onClick={() => setEdit("edit")}>Koreksi metadata</button>
            {letter.status !== "Diarsipkan" && (
              <button className="danger" onClick={() => setEdit("cancel")}>
                Tutup dengan alasan
              </button>
            )}
          </>
        )}
      </div>
      {edit && (
        <LetterEditor
          letter={letter}
          cancel={edit === "cancel"}
          onClose={() => setEdit(undefined)}
        />
      )}
      <div className="detail-grid">
        <section className="panel">
          {files.length > 1 && (
            <Field label="Dokumen untuk pratinjau">
              <select
                value={fileId || letter.attachmentIds[0] || files[0]?.id}
                onChange={(e) => setFileId(e.target.value)}
              >
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {files[0] ? (
            <Preview
              file={
                files.find(
                  (f) => f.id === (fileId || letter.attachmentIds[0]),
                ) || files[0]
              }
            />
          ) : (
            <Empty text="Belum ada dokumen utama." />
          )}
        </section>
        <section className="panel detail-info">
          <div className="tabs">
            {[
              "Ringkasan",
              "Disposisi",
              "Tindak Lanjut",
              "Lampiran",
              "Riwayat",
            ].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "Ringkasan" && (
            <>
              <Badge>{letter.status}</Badge>
              <dl>
                {[
                  ["Nomor agenda", letter.agenda],
                  ["Nomor surat", letter.number],
                  ["Tanggal surat", dateLabel(letter.date)],
                  ["Diterima", dateLabel(letter.received)],
                  ["Jenis", letter.kind],
                  ["Derajat", letter.urgency],
                  ["Klasifikasi", letter.classification],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <h3>Ringkasan surat</h3>
              <p>{letter.summary || "Belum ada ringkasan."}</p>
              <div className="action-stack">
                {canRegister(user.role) && letter.status === "Terdaftar" && (
                  <button
                    className="primary"
                    onClick={() =>
                      run(async () => {
                        await db.letters.update(lid, {
                          status: "Menunggu disposisi",
                        });
                        await log(
                          lid,
                          "Diajukan kepada Kepala RSAU",
                          user.name,
                        );
                      }, "Surat diajukan kepada Kepala RSAU.")
                    }
                  >
                    <Send size={17} /> Ajukan ke pimpinan
                  </button>
                )}
                {canIssue(user.role) &&
                  [
                    "Terdaftar",
                    "Menunggu disposisi",
                    "Dalam tindak lanjut",
                  ].includes(letter.status) && (
                    <button
                      className="primary"
                      onClick={() => setDisposition(true)}
                    >
                      <Plus size={17} /> Buat disposisi
                    </button>
                  )}
                {canRegister(user.role) && letter.status === "Selesai" && (
                  <button
                    onClick={() =>
                      run(
                        () => archive(lid, user.name),
                        "Surat berhasil diarsipkan.",
                      )
                    }
                  >
                    Arsipkan surat
                  </button>
                )}
              </div>
              <div className="callout">
                <strong>
                  {activeTasks.filter((t) => t.status === "Selesai").length}{" "}
                  dari {activeTasks.length} tugas selesai
                </strong>
                <p>Penerima tembusan tidak dihitung sebagai kewajiban.</p>
              </div>
            </>
          )}
          {tab === "Disposisi" && (
            <>
              {ds.map((d) => (
                <article className="mini-card" key={d.id}>
                  <h3>
                    {d.cancelled
                      ? "Disposisi direvisi/dibatalkan"
                      : "Disposisi aktif"}
                  </h3>
                  <p>
                    {d.giver} · {dateLabel(d.createdAt)}
                  </p>
                  <p>{d.instructions.join(", ")}</p>
                  <p>{d.notes}</p>
                  {d.recipients.map((r, i) => (
                    <p key={i}>
                      <strong>{r.unitName}</strong> · {r.kind}
                      <small>
                        {r.instruction} · {dateLabel(r.deadline)}
                      </small>
                    </p>
                  ))}
                  {d.reason && <p>Alasan: {d.reason}</p>}
                  {canIssue(user.role) && !d.cancelled && (
                    <div className="row">
                      <button onClick={() => setDisposition(d)}>
                        Revisi dengan alasan
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          setCancel(d.id);
                          setCancelReason("");
                        }}
                      >
                        Batalkan disposisi
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {!ds.length && <Empty text="Belum ada disposisi." />}
            </>
          )}
          {tab === "Tindak Lanjut" && (
            <>
              {tasks.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
              <h3>Diskusi</h3>
              {comments.map((c) => (
                <div className="mini-card" key={c.id}>
                  <strong>{c.author}</strong>
                  <small>{timestampLabel(c.createdAt)}</small>
                  <p>{c.text}</p>
                </div>
              ))}
              <Field label="Pesan diskusi (tidak menyelesaikan tugas)">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </Field>
              <button
                disabled={!comment.trim()}
                onClick={() =>
                  run(async () => {
                    await db.comments.add({
                      id: id(),
                      letterId: lid,
                      text: comment,
                      author: user.name,
                      createdAt: now(),
                    });
                    setComment("");
                  }, "Pesan diskusi terkirim.")
                }
              >
                Kirim pesan
              </button>
            </>
          )}
          {tab === "Lampiran" &&
            files.map((f) => (
              <div className="mini-card" key={f.id}>
                <strong>{f.name}</strong>
                <button onClick={() => download(f.blob, f.name)}>
                  Unduh berkas asli
                </button>
              </div>
            ))}
          {tab === "Riwayat" &&
            logs
              .slice()
              .reverse()
              .map((l) => (
                <div className="timeline" key={l.id}>
                  <strong>{l.text}</strong>
                  {l.before !== undefined && (
                    <details>
                      <summary>Lihat data sebelum / sesudah</summary>
                      <pre>
                        {JSON.stringify(
                          { sebelum: l.before, sesudah: l.after },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  )}
                  <small>
                    {l.author} · {timestampLabel(l.createdAt)}
                  </small>
                </div>
              ))}
        </section>
      </div>
      {cancel && (
        <Modal title="Pembatalan disposisi" onClose={() => setCancel("")}>
          <Field label="Alasan pembatalan *">
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </Field>
          <p>Disposisi dan tugas lama tetap tersimpan sebagai riwayat.</p>
          <button
            className="danger"
            disabled={!cancelReason.trim()}
            onClick={() =>
              run(async () => {
                await cancelDisposition(cancel, cancelReason, user.name);
                setCancel("");
              }, "Disposisi dibatalkan dengan riwayat alasan.")
            }
          >
            Konfirmasi pembatalan
          </button>
        </Modal>
      )}
      {disposition && (
        <DispositionForm
          letterId={lid}
          previous={typeof disposition === "object" ? disposition : undefined}
          onClose={() => setDisposition(false)}
        />
      )}
    </>
  );
}
export function DispositionForm({
  letterId,
  onClose,
  previous,
}: {
  letterId: string;
  onClose: () => void;
  previous?: Disposition;
}) {
  const { user, run } = useApp();
  const units = useLiveQuery(() => db.units.orderBy("id").toArray()) || [];
  const settings = useLiveQuery(() => db.settings.get("main"));
  const instructionMaster =
    useLiveQuery(() =>
      db.catalogs.where({ category: "instruction" }).toArray(),
    ) || [];
  const positions = useLiveQuery(() => db.positions.toArray()) || [];
  const [search, setSearch] = useState("");
  const [recipients, setRecipients] = useState<DispositionRecipient[]>(
    previous?.recipients || [],
  );
  const [selected, setSelected] = useState(
    previous?.instructions || ["Tindak lanjuti"],
  );
  const [notes, setNotes] = useState(previous?.notes || "");
  const [deadline, setDeadline] = useState(previous?.deadline || today());
  const [review, setReview] = useState(true);
  const [reason, setReason] = useState("");
  const [step, setStep] = useState(1);
  const [parentId, setParentId] = useState(previous?.parentId || "");
  const parents =
    useLiveQuery(
      () => db.dispositions.where({ letterId }).toArray(),
      [letterId],
    ) || [];
  useUnsavedChanges(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventConfirmed, setEventConfirmed] = useState(false);
  const publish = async () => {
    setBusy(true);
    try {
      const d: Disposition = {
        id: id(),
        letterId,
        giver: user.name,
        recipients: recipients.map((r) => ({
          ...r,
          instruction: r.instruction || selected.join(", "),
          deadline: r.deadline || deadline,
        })),
        instructions: selected,
        notes,
        deadline,
        review,
        createdAt: now(),
        revisionOf: previous?.id,
        parentId: parentId || undefined,
        reason,
      };
      await db.transaction("rw", db.tables, async () => {
        await issue(d, user.name);
        if (
          selected.includes("Agendakan") &&
          eventConfirmed &&
          eventTitle.trim()
        )
          await db.events.add({
            id: id(),
            title: eventTitle,
            date: deadline,
            location: "Belum ditentukan",
            letterId,
          });
      });
      await run(async () => {}, "Disposisi diterbitkan dan tugas dibuat.");
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={previous ? "Revisi disposisi" : "Buat disposisi"}
      onClose={onClose}
    >
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {step === 1 ? (
        <>
          <Field label="Disposisi induk (opsional)">
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">Disposisi utama</option>
              {parents
                .filter((d) => !d.cancelled && d.id !== previous?.id)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.giver} · {dateLabel(d.createdAt)}
                  </option>
                ))}
            </select>
          </Field>
          <p>
            Pemberi: <strong>{user.name}</strong>
          </p>
          {previous && (
            <Field label="Alasan revisi *">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
          <Field label="Cari penerima unit / jabatan">
            <input
              placeholder="Ketik nama unit…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <div className="recipient-list">
            {units
              .filter(
                (u) =>
                  u.active &&
                  (u.name.toLowerCase().includes(search.toLowerCase()) ||
                    positions.some(
                      (p) =>
                        p.unitId === u.id &&
                        p.active !== false &&
                        p.name.toLowerCase().includes(search.toLowerCase()),
                    )),
              )
              .sort((a, b) => a.order - b.order)
              .map((u) => {
                const r = recipients.find((r) => r.unitId === u.id);
                return (
                  <div className="recipient" key={u.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!r}
                        onChange={(e) =>
                          setRecipients(
                            e.target.checked
                              ? [
                                  ...recipients,
                                  {
                                    unitId: u.id,
                                    unitName: u.name,
                                    userId: u.userId || "",
                                    kind: "Utama",
                                    instruction: "",
                                    deadline: "",
                                  },
                                ]
                              : recipients.filter((r) => r.unitId !== u.id),
                          )
                        }
                      />
                      {u.name}
                    </label>
                    {r && (
                      <>
                        <select
                          aria-label={`Jenis penerima ${u.name}`}
                          value={r.kind}
                          onChange={(e) =>
                            setRecipients(
                              recipients.map((v) =>
                                v.unitId === u.id
                                  ? {
                                      ...v,
                                      kind: e.target
                                        .value as DispositionRecipient["kind"],
                                    }
                                  : v,
                              ),
                            )
                          }
                        >
                          {["Utama", "Pendukung", "Tembusan"].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                        <input
                          aria-label={`Instruksi khusus ${u.name}`}
                          placeholder="Instruksi khusus (opsional)"
                          value={r.instruction}
                          onChange={(e) =>
                            setRecipients(
                              recipients.map((v) =>
                                v.unitId === u.id
                                  ? { ...v, instruction: e.target.value }
                                  : v,
                              ),
                            )
                          }
                        />
                        <input
                          aria-label={`Tenggat ${u.name}`}
                          type="date"
                          value={r.deadline}
                          onChange={(e) =>
                            setRecipients(
                              recipients.map((v) =>
                                v.unitId === u.id
                                  ? { ...v, deadline: e.target.value }
                                  : v,
                              ),
                            )
                          }
                        />
                      </>
                    )}
                  </div>
                );
              })}
          </div>
          <h3>Instruksi umum</h3>
          <div className="check-grid">
            {[
              ...instructionMaster
                .filter((c) => c.active)
                .sort((a, b) => a.order - b.order)
                .map((c) => c.name),
              ...(settings?.extraInstructions
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean) || []),
            ].map((s) => (
              <label key={s}>
                <input
                  type="checkbox"
                  checked={selected.includes(s)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, s]
                        : selected.filter((i) => i !== s),
                    )
                  }
                />
                {s}
              </label>
            ))}
          </div>
          {selected.includes("Arsipkan") &&
            selected.some((s) =>
              ["Tindak lanjuti", "Laporkan", "Siapkan"].includes(s),
            ) && (
              <p className="warning">
                Instruksi arsip bertentangan dengan tindak lanjut. Surat tetap
                harus menuntaskan tugas sebelum diarsipkan.
              </p>
            )}
          <Field label="Template catatan">
            <select onChange={(e) => setNotes(e.target.value)}>
              <option value="">Pilih template…</option>
              <option>
                Mohon ditindaklanjuti sesuai ketentuan dan dilaporkan hasilnya.
              </option>
              <option>Koordinasikan dengan unit terkait.</option>
            </select>
          </Field>
          <Field label="Catatan">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <Field label="Tenggat umum *">
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={review}
              onChange={(e) => setReview(e.target.checked)}
            />{" "}
            Hasil wajib diperiksa sebelum selesai
          </label>
          {selected.includes("Agendakan") && (
            <div className="callout">
              <Field label="Nama kegiatan agenda">
                <input
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                />
              </Field>
              <label>
                <input
                  type="checkbox"
                  checked={eventConfirmed}
                  onChange={(e) => setEventConfirmed(e.target.checked)}
                />{" "}
                Konfirmasi membuat kegiatan pada tanggal tenggat
              </label>
            </div>
          )}
          <button
            className="primary"
            disabled={
              !recipients.some((r) => r.kind !== "Tembusan") ||
              !selected.length ||
              !deadline ||
              (!!previous && !reason.trim())
            }
            onClick={() => setStep(2)}
          >
            Periksa disposisi
          </button>
        </>
      ) : (
        <>
          <h3>Ringkasan penerbitan</h3>
          {recipients.map((r) => (
            <p key={r.unitId}>
              <strong>
                {r.unitName} · {r.kind}
              </strong>
              <small>
                {r.instruction || selected.join(", ")} ·{" "}
                {dateLabel(r.deadline || deadline)}
              </small>
            </p>
          ))}
          <p>{notes}</p>
          <p>
            {review
              ? "Hasil memerlukan pemeriksaan."
              : "Hasil langsung menuntaskan tugas."}
          </p>
          <div className="form-actions">
            <button onClick={() => setStep(1)}>Kembali</button>
            <button className="primary" disabled={busy} onClick={publish}>
              {busy ? "Menerbitkan…" : "Terbitkan disposisi"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
export function TaskCard({ task: t }: { task: Task }) {
  const { user, run } = useApp();
  const [action, setAction] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [obstacles, setObstacles] = useState("");
  const [next, setNext] = useState("");
  const [date, setDate] = useState(today());
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [unit, setUnit] = useState("");
  const units = useLiveQuery(() => db.units.toArray()) || [];
  const progress =
    useLiveQuery(() => db.progress.where({ taskId: t.id }).toArray(), [t.id]) ||
    [];
  const reports =
    useLiveQuery(() => db.reports.where({ taskId: t.id }).toArray(), [t.id]) ||
    [];
  const disposition = useLiveQuery(
    () => db.dispositions.get(t.dispositionId),
    [t.dispositionId],
  );
  const mine =
    (t.userId === user.id || user.role === "Admin Sistem") &&
    !disposition?.cancelled;
  const reviewer = canIssue(user.role) && !disposition?.cancelled;
  const execute = () =>
    run(async () => {
      setBusy(true);
      try {
        if (action === "delegate") await delegate(t, unit, user.name);
        else if (action === "submit") {
          const attachmentIds: string[] = [];
          await db.transaction("rw", db.tables, async () => {
            for (const f of files) {
              const aid = id();
              attachmentIds.push(aid);
              await db.attachments.add({
                id: aid,
                letterId: t.letterId,
                name: f.name,
                type: f.type,
                blob: f,
              });
            }
            await taskAction(t.id, "submit", user.name, "", {
              id: id(),
              taskId: t.id,
              action: text,
              date,
              result,
              obstacles,
              next,
              attachmentIds,
              createdAt: now(),
            });
          });
        } else
          await taskAction(
            t.id,
            action as "progress" | "return",
            user.name,
            text,
          );
        setAction("");
        setText("");
        setResult("");
      } finally {
        setBusy(false);
      }
    }, "Tugas berhasil diperbarui.");
  return (
    <article className="task-card">
      <div className="row">
        <strong>{t.unitName}</strong>
        <Badge>
          {disposition?.cancelled ? "Dibatalkan · Riwayat disposisi" : t.status}
        </Badge>
      </div>
      <p>{t.instruction}</p>
      {t.previousStatus && (
        <small>Status sebelum pembatalan: {t.previousStatus}</small>
      )}
      <small>
        Tenggat {dateLabel(t.deadline)}
        {t.parentId ? " · Tugas turunan" : ""}
      </small>
      <Link className="text-link" to={`/surat-masuk/${t.letterId}`}>
        Buka surat asli →
      </Link>
      {progress.map((p) => (
        <p className="callout" key={p.id}>
          {p.author}: {p.text}
        </p>
      ))}
      {reports.map((r) => (
        <details key={r.id}>
          <summary>Laporan hasil · {dateLabel(r.date)}</summary>
          <p>Tindakan: {r.action}</p>
          <p>Hasil: {r.result}</p>
          <p>Kendala: {r.obstacles || "Tidak ada"}</p>
          <p>Berikutnya: {r.next || "—"}</p>
        </details>
      ))}
      <div className="task-actions">
        {mine && ["Belum dibaca", "Dibaca"].includes(t.status) && (
          <button
            onClick={() =>
              run(
                () => taskAction(t.id, "accept", user.name),
                "Penerimaan tugas dikonfirmasi.",
              )
            }
          >
            Konfirmasi terima
          </button>
        )}
        {mine &&
          ["Diterima", "Diproses", "Perlu perbaikan"].includes(t.status) && (
            <>
              <button onClick={() => setAction("progress")}>
                Tambah progres
              </button>
              <button className="primary" onClick={() => setAction("submit")}>
                Kirim hasil
              </button>
              {["Kepala Unit", "Admin Sistem"].includes(user.role) && (
                <button onClick={() => setAction("delegate")}>
                  Delegasikan
                </button>
              )}
            </>
          )}
        {reviewer && t.status === "Hasil dikirim" && (
          <>
            <button
              className="primary"
              onClick={() =>
                run(
                  () => taskAction(t.id, "approve", user.name),
                  "Hasil diterima dan tugas selesai.",
                )
              }
            >
              Terima hasil
            </button>
            <button onClick={() => setAction("return")}>Minta perbaikan</button>
          </>
        )}
      </div>
      {action && (
        <Modal
          title={
            action === "submit"
              ? "Kirim laporan hasil"
              : action === "delegate"
                ? "Delegasikan ke unit bawahan"
                : action === "return"
                  ? "Alasan perbaikan"
                  : "Pembaruan progres"
          }
          onClose={() => setAction("")}
        >
          {action === "delegate" ? (
            <Field label="Unit bawahan aktif">
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="">Pilih unit</option>
                {units
                  .filter((u) => u.active && u.parentId === t.unitId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
          ) : (
            <Field
              label={action === "submit" ? "Uraian tindakan *" : "Uraian *"}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
          )}
          {action === "submit" && (
            <>
              <Field label="Tanggal pelaksanaan">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field label="Hasil *">
                <textarea
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                />
              </Field>
              <Field label="Kendala">
                <textarea
                  value={obstacles}
                  onChange={(e) => setObstacles(e.target.value)}
                />
              </Field>
              <Field label="Tindak lanjut berikutnya">
                <textarea
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
              </Field>
              <Field label="Bukti pendukung">
                <input
                  type="file"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                />
              </Field>
            </>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              (action === "delegate" ? !unit : !text.trim()) ||
              (action === "submit" && (!result.trim() || !date))
            }
            onClick={execute}
          >
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
        </Modal>
      )}
    </article>
  );
}
