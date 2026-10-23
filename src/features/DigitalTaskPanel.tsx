import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { useApp } from "../app/context";
import { useUnsavedChanges } from "../app/unsaved";
import type { Task, CompletionReport } from "../types";
import {
  digitalTaskAction,
  delegateDigital,
  extendDigitalDeadline,
  deadlineState,
  type DigitalTaskAction,
} from "../repositories/digitalDisposition";
import { Field, Badge, Modal } from "../components/common";
import { now, id, today, dateLabel, timestampLabel, download } from "../utils";
import { LocalDocumentPreview } from "../components/LocalDocumentPreview";
export function DigitalTaskPanel({ task: t }: { task: Task }) {
  const { user, run } = useApp();
  const [memo, setMemo] = useState(""),
    [expected, setExpected] = useState(t.revision || 1),
    [busy, setBusy] = useState(false);
  const [report, setReport] = useState({
      action: "",
      date: today(),
      result: "",
      obstacles: "",
      next: "",
    }),
    [files, setFiles] = useState<File[]>([]),
    [newDeadline, setNewDeadline] = useState(""),
    [delegateUser, setDelegateUser] = useState(""),
    [instruction, setInstruction] = useState(""),
    [delegateDeadline, setDelegateDeadline] = useState(t.deadline),
    [consolidate, setConsolidate] = useState(true),
    [preview, setPreview] = useState("");
  const reports =
      useLiveQuery(
        () => db.reports.where({ taskId: t.id }).toArray(),
        [t.id],
      ) || [],
    progress =
      useLiveQuery(
        () => db.progress.where({ taskId: t.id }).toArray(),
        [t.id],
      ) || [],
    comments =
      useLiveQuery(
        () => db.comments.filter((c) => c.taskId === t.id).toArray(),
        [t.id],
      ) || [],
    attachments =
      useLiveQuery(
        () => db.attachments.where({ letterId: t.letterId }).toArray(),
        [t.letterId],
      ) || [],
    users = useLiveQuery(() => db.users.toArray()) || [],
    units = useLiveQuery(() => db.units.toArray()) || [],
    d = useLiveQuery(
      () => db.dispositions.get(t.dispositionId),
      [t.dispositionId],
    );
  const dirty =
    !!memo ||
    !!report.action ||
    !!report.result ||
    !!report.obstacles ||
    !!report.next ||
    files.length > 0 ||
    !!instruction ||
    !!newDeadline;
  useUnsavedChanges(dirty, true);
  const receiver = user.id === t.userId,
    reviewer = user.id === t.reviewerId || user.role === "Admin Sistem",
    giver = user.id === d?.issuerId || user.role === "Admin Sistem",
    closed = t.retired || t.status === "Dibatalkan" || !!d?.cancelled;
  const execute = (fn: () => Promise<unknown>, clear: () => void = () => {}) =>
    run(async () => {
      setBusy(true);
      try {
        await fn();
        const latest = await db.tasks.get(t.id);
        setExpected(latest?.revision || 1);
        clear();
      } finally {
        setBusy(false);
      }
    }, "Tindakan tugas dicatat.");
  const act = (action: DigitalTaskAction) =>
    execute(
      () =>
        digitalTaskAction(
          t.id,
          expected,
          action,
          user.id,
          memo,
          action === "submit"
            ? ({
                ...report,
                id: id(),
                taskId: t.id,
                attachmentIds: [],
                createdAt: now(),
              } as CompletionReport)
            : undefined,
          files,
        ),
      () => {
        setMemo((current) => (current === memo ? "" : current));
        if (action === "submit") {
          setReport((current) =>
            JSON.stringify(current) === JSON.stringify(report)
              ? {
                  action: "",
                  date: today(),
                  result: "",
                  obstacles: "",
                  next: "",
                }
              : current,
          );
          setFiles((current) => (current === files ? [] : current));
        }
      },
    );
  const selectedFile = attachments.find((a) => a.id === preview);
  return (
    <section
      className="digital-task mini-card"
      data-testid={"digital-task-" + t.userId}
      id={"task-" + t.id}
    >
      <div className="section-title">
        <div>
          <h3>
            {t.unitName} ·{" "}
            {t.userName || users.find((u) => u.id === t.userId)?.name}
          </h3>
          <p>
            {t.positionName || "Jabatan belum dicatat"}
            {t.parentId ? " · Tugas turunan" : ""}
          </p>
        </div>
        <Badge>{t.status}</Badge>
      </div>
      {t.retired && <p className="muted">Riwayat — bukan kewajiban aktif.</p>}
      <p>{t.instruction}</p>
      <p>
        <strong>{t.readAt ? "Dibaca" : "Belum dibaca"}</strong> ·{" "}
        {t.deadline ? dateLabel(t.deadline) : "Tanpa tenggat"} ·{" "}
        {deadlineState(t)}
      </p>
      {t.readAt && <small>Dibaca pada {timestampLabel(t.readAt)}</small>}
      {t.acceptedAt && (
        <small>Diterima pada {timestampLabel(t.acceptedAt)}</small>
      )}
      {t.completedAt && (
        <small>Selesai pada {timestampLabel(t.completedAt)}</small>
      )}
      {t.reconfirmRequired && (
        <p className="warning">
          Instruksi berubah secara material. Konfirmasi penerimaan ulang
          diperlukan.
        </p>
      )}
      {t.delegateReason && <p>Alasan delegasi: {t.delegateReason}</p>}
      {t.consolidateChildren && (
        <p>
          Hasil bawahan harus diselesaikan dan dikonsolidasikan sebelum laporan
          induk.
        </p>
      )}
      {expected !== (t.revision || 1) && (
        <p className="warning">
          Versi tugas berubah. Input tetap ada. Tinjau data terbaru lalu pilih
          tombol di bawah sebelum mencoba lagi.
        </p>
      )}
      <button disabled={busy} onClick={() => setExpected(t.revision || 1)}>
        Saya sudah meninjau versi tugas terbaru
      </button>
      {!closed && (receiver || reviewer || giver) && (
        <>
          <Field label="Catatan tugas / alasan">
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
            />
          </Field>
          <div className="toolbar">
            {receiver && (
              <>
                <button
                  disabled={
                    busy ||
                    (!["Belum diterima"].includes(t.status) &&
                      !t.reconfirmRequired)
                  }
                  onClick={() => act("accept")}
                >
                  Konfirmasi terima
                </button>
                <button
                  disabled={busy || !memo.trim()}
                  onClick={() => act("discussion")}
                >
                  Simpan diskusi
                </button>
                <button
                  disabled={
                    busy ||
                    !memo.trim() ||
                    !["Diterima", "Diproses", "Perlu perbaikan"].includes(
                      t.status,
                    )
                  }
                  onClick={() => act("progress")}
                >
                  Simpan progres
                </button>
              </>
            )}
            {reviewer && t.status === "Hasil dikirim" && (
              <>
                <button
                  disabled={busy}
                  className="primary"
                  onClick={() => act("approve")}
                >
                  Terima hasil
                </button>
                <button
                  disabled={busy || !memo.trim()}
                  onClick={() => act("return")}
                >
                  Kembalikan hasil
                </button>
                <button
                  disabled={busy || !memo.trim()}
                  onClick={() => act("evidence")}
                >
                  Minta tambahan bukti
                </button>
              </>
            )}
          </div>
          {receiver &&
            ["Diterima", "Diproses", "Perlu perbaikan"].includes(t.status) && (
              <details open>
                <summary>Laporan hasil / penyelesaian</summary>
                {(
                  ["action", "date", "result", "obstacles", "next"] as const
                ).map((k, i) => (
                  <Field
                    key={k}
                    label={
                      [
                        "Uraian tindakan",
                        "Tanggal pelaksanaan",
                        "Hasil pekerjaan",
                        "Kendala (opsional)",
                        "Tindak lanjut berikutnya",
                      ][i]
                    }
                  >
                    {k === "date" ? (
                      <input
                        type="date"
                        value={report[k]}
                        onChange={(e) =>
                          setReport({ ...report, [k]: e.target.value })
                        }
                      />
                    ) : (
                      <textarea
                        value={report[k]}
                        onChange={(e) =>
                          setReport({ ...report, [k]: e.target.value })
                        }
                      />
                    )}
                  </Field>
                ))}
                <Field label="Bukti hasil (maksimal 20 MB per berkas)">
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  />
                </Field>
                <p>
                  {files.length} berkas dipilih. PDF, gambar, atau berkas
                  unduhan disimpan lokal.
                </p>
                <div className="toolbar">
                  <button
                    disabled={
                      busy || !report.action.trim() || !report.result.trim()
                    }
                    className="primary"
                    onClick={() => act("submit")}
                  >
                    Kirim laporan hasil
                  </button>
                  {t.reportRequired === false && (
                    <button
                      disabled={busy || !memo.trim()}
                      onClick={() => act("complete")}
                    >
                      Konfirmasi penyelesaian tanpa laporan
                    </button>
                  )}
                </div>
              </details>
            )}
          {receiver &&
            ["Kepala Unit", "Kepala RSAU", "Admin Sistem"].includes(
              user.role,
            ) &&
            !["Selesai", "Dibatalkan"].includes(t.status) && (
              <details>
                <summary>Delegasi pekerjaan</summary>
                <Field label="Penerima delegasi">
                  <select
                    value={delegateUser}
                    onChange={(e) => setDelegateUser(e.target.value)}
                  >
                    <option value="">Pilih bawahan aktif</option>
                    {users
                      .filter(
                        (u) =>
                          u.active &&
                          u.id !== t.userId &&
                          units.some(
                            (unit) =>
                              unit.id === u.unitId &&
                              unit.active &&
                              ((unit.id === t.unitId &&
                                u.role === "Pelaksana") ||
                                unit.parentId === t.unitId),
                          ),
                      )
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ·{" "}
                          {units.find((x) => x.id === u.unitId)?.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Instruksi delegasi">
                  <textarea
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                  />
                </Field>
                <Field label="Tenggat delegasi">
                  <input
                    type="date"
                    value={delegateDeadline}
                    onChange={(e) => setDelegateDeadline(e.target.value)}
                  />
                </Field>
                <label>
                  <input
                    type="checkbox"
                    checked={consolidate}
                    onChange={(e) => setConsolidate(e.target.checked)}
                  />{" "}
                  Konsolidasikan hasil bawahan sebelum laporan induk
                </label>
                <p>
                  Alasan diambil dari Catatan tugas / alasan. Tugas induk tetap
                  menjadi tanggung jawab penerima awal.
                </p>
                <button
                  disabled={
                    busy || !delegateUser || !instruction.trim() || !memo.trim()
                  }
                  onClick={() =>
                    execute(
                      () =>
                        delegateDigital(
                          t.id,
                          expected,
                          delegateUser,
                          instruction,
                          delegateDeadline,
                          memo,
                          consolidate,
                          user.id,
                        ),
                      () => {
                        setMemo((current) => (current === memo ? "" : current));
                        setInstruction("");
                        setDelegateUser("");
                      },
                    )
                  }
                >
                  Terbitkan delegasi
                </button>
              </details>
            )}
          {giver && !["Selesai", "Dibatalkan"].includes(t.status) && (
            <details>
              <summary>Perpanjangan tenggat</summary>
              <Field label="Tenggat baru">
                <input
                  type="date"
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                />
              </Field>
              <p>
                Alasan wajib diisi pada Catatan tugas / alasan. Nilai
                sebelum/sesudah disimpan dalam riwayat.
              </p>
              <button
                disabled={busy || !newDeadline || !memo.trim()}
                onClick={() =>
                  execute(
                    () =>
                      extendDigitalDeadline(
                        t.id,
                        expected,
                        newDeadline,
                        memo,
                        user.id,
                      ),
                    () => {
                      setNewDeadline("");
                      setMemo((current) => (current === memo ? "" : current));
                    },
                  )
                }
              >
                Simpan perpanjangan tenggat
              </button>
            </details>
          )}
        </>
      )}
      <details>
        <summary>
          Progres & diskusi ({progress.length + comments.length})
        </summary>
        {progress.map((p) => (
          <p key={p.id}>
            <strong>Progres:</strong> {p.text}
            <small>
              {p.author} · {timestampLabel(p.createdAt)}
            </small>
          </p>
        ))}
        {comments.map((c) => (
          <p key={c.id}>
            <strong>Diskusi:</strong> {c.text}
            <small>
              {c.author} · {timestampLabel(c.createdAt)}
            </small>
          </p>
        ))}
      </details>
      <details open={reports.length > 0}>
        <summary>Riwayat laporan hasil ({reports.length})</summary>
        {t.completionNote && <p>Konfirmasi penyelesaian: {t.completionNote}</p>}
        {reports
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((r, i) => (
            <div className="timeline" key={r.id}>
              <strong>
                Laporan {reports.length - i} · {dateLabel(r.date)}
              </strong>
              <p>Tindakan: {r.action}</p>
              <p>Hasil: {r.result}</p>
              <p>
                Kendala: {r.obstacles || "—"} · Berikutnya: {r.next || "—"}
              </p>
              <small>{timestampLabel(r.createdAt)}</small>
              {r.attachmentIds.map((aid) => {
                const f = attachments.find((f) => f.id === aid);
                return f ? (
                  <div className="toolbar" key={aid}>
                    <button onClick={() => download(f.blob, f.name)}>
                      Unduh bukti {f.name}
                    </button>
                    <button onClick={() => setPreview(aid)}>
                      Pratinjau bukti {f.name}
                    </button>
                  </div>
                ) : (
                  <p key={aid} role="alert">
                    Bukti hilang; pulihkan cadangan lengkap.
                  </p>
                );
              })}
            </div>
          ))}
      </details>
      {selectedFile && (
        <Modal title="Bukti hasil lokal" onClose={() => setPreview("")}>
          <LocalDocumentPreview file={selectedFile} />
        </Modal>
      )}
    </section>
  );
}
