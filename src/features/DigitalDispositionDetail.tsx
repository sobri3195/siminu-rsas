import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { useApp } from "../app/context";
import { useUnsavedChanges } from "../app/unsaved";
import { Field, Modal, Badge, Empty } from "../components/common";
import { LocalDocumentPreview } from "../components/LocalDocumentPreview";
import { DigitalTaskPanel } from "./DigitalTaskPanel";
import {
  createDispositionDraft,
  markDispositionRead,
  dispositionProgress,
  cancelDigitalDisposition,
  dispositionOutput,
} from "../repositories/digitalDisposition";
import { archive } from "../repositories/workflow";
import { dateLabel, timestampLabel } from "../utils";
import type { Task } from "../types";
export function DigitalDispositionDetail() {
  const { id: did = "" } = useParams(),
    { user, run } = useApp(),
    navigate = useNavigate();
  const d = useLiveQuery(() => db.dispositions.get(did), [did]),
    letter = useLiveQuery(async () => {
      const d = await db.dispositions.get(did);
      return d ? db.letters.get(d.letterId) : undefined;
    }, [did]);
  const tasks =
      useLiveQuery(
        () => db.tasks.where({ dispositionId: did }).toArray(),
        [did],
      ) || [],
    receipts =
      useLiveQuery(
        () => db.recipientReceipts.where({ dispositionId: did }).toArray(),
        [did],
      ) || [],
    versions = (
      useLiveQuery(
        () => db.dispositionVersions.where({ dispositionId: did }).toArray(),
        [did],
      ) || []
    ).sort((a, b) => b.version - a.version);
  const logs =
      useLiveQuery(
        () => db.activities.filter((a) => a.dispositionId === did).toArray(),
        [did],
      ) || [],
    outputs =
      useLiveQuery(
        () => db.dispositionOutputs.where({ dispositionId: did }).toArray(),
        [did],
      ) || [],
    files =
      useLiveQuery(
        () =>
          letter ? db.attachments.where({ letterId: letter.id }).toArray() : [],
        [letter?.id],
      ) || [],
    settings = useLiveQuery(() => db.settings.get("main"));
  const [tab, setTab] = useState("Arahan"),
    [mobile, setMobile] = useState("Disposisi"),
    [fileId, setFileId] = useState(""),
    [memo, setMemo] = useState(""),
    [cancel, setCancel] = useState(false),
    [expected, setExpected] = useState<number>(),
    [output, setOutput] = useState<"notes" | "events">(),
    [sourceTask, setSourceTask] = useState(""),
    [tree, setTree] = useState(
      localStorage.getItem("rsas-digital-tree") || "list",
    ),
    [compare, setCompare] = useState(""),
    [form, setForm] = useState({
      title: "",
      date: "",
      start: "",
      end: "",
      location: "",
      acknowledged: false,
    }),
    [busy, setBusy] = useState(false);
  useUnsavedChanges(!!memo || !!form.title || !!form.date, true);
  useEffect(() => {
    if (d && expected === undefined) setExpected(d.revision || 1);
  }, [d?.id]);
  useEffect(() => {
    void run(() => markDispositionRead(did, user.id), "");
  }, [did, user.id]);
  if (!d || !letter)
    return <Empty text="Memuat disposisi atau sumber tidak ditemukan." />;
  if (!d.digital)
    return (
      <section className="panel">
        <p>Dokumen ini memakai alur disposisi tahap sebelumnya.</p>
        <Link to={"/surat-masuk/" + d.letterId}>
          Buka surat dan riwayat lama
        </Link>
      </section>
    );
  const progress = dispositionProgress(d, tasks, receipts),
    canChange = user.role === "Admin Sistem" || d.issuerId === user.id,
    file = files.find((f) => f.id === (fileId || letter.attachmentIds[0])),
    old = versions.find((v) => v.id === compare)?.snapshot;
  const renderTree = (t: Task, seen = new Set<string>()): React.ReactNode => {
    if (seen.has(t.id))
      return (
        <p key={t.id} role="alert">
          Siklus tugas terdeteksi; periksa cadangan.
        </p>
      );
    const next = new Set(seen);
    next.add(t.id);
    const children = tasks.filter((x) => x.parentId === t.id);
    return (
      <details className="digital-tree-node" key={t.id} open>
        <summary>
          {t.unitName} · {t.userName} · {t.status}
        </summary>
        <DigitalTaskPanel task={t} />
        {children.map((child) => renderTree(child, next))}
      </details>
    );
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DISPOSISI DIGITAL · VERSI {d.version}</p>
          <h1>{letter.subject}</h1>
          <Badge>{progress.status}</Badge>
          <p>
            {progress.done} dari {progress.total} {progress.label} · {d.giver}
          </p>
        </div>
        <Link className="button" to="/disposisi">
          Pusat disposisi
        </Link>
      </div>
      <div className="panel">
        <div className="toolbar">
          <Link
            className="button"
            to={"/cetak-disposisi/" + d.id + "?version=" + d.version}
          >
            Cetak versi {d.version}
          </Link>
          {canChange && !d.cancelled && (
            <>
              <button
                onClick={() =>
                  run(async () => {
                    const draft = await createDispositionDraft(
                      d.letterId,
                      user.id,
                      d.id,
                    );
                    navigate("/disposisi/draf/" + draft.id);
                  }, "Draf revisi dibuat.")
                }
              >
                Buat revisi arahan
              </button>
              <button onClick={() => setCancel(true)}>
                Batalkan disposisi digital
              </button>
            </>
          )}
          {!d.cancelled && (
            <>
              <button onClick={() => setOutput("notes")}>
                Buat Nota Dinas hasil
              </button>
              <button onClick={() => setOutput("events")}>
                Buat agenda dari arahan
              </button>
            </>
          )}
          {["Admin Sistem", "Petugas Urtu/Administrasi"].includes(
            user.role,
          ) && (
            <button
              disabled={letter.status !== "Selesai"}
              onClick={() =>
                run(
                  () => archive(letter.id, user.name),
                  "Surat diarsipkan setelah seluruh kewajiban selesai.",
                )
              }
            >
              Arsipkan surat sumber
            </button>
          )}
        </div>
        <p className="muted">
          Tenggat tanggal berlaku sampai akhir hari zona{" "}
          {settings?.timezone || "Asia/Jakarta"}. Pengingat dihitung saat
          aplikasi dibuka/aktif. Tembusan tidak masuk pembagi tugas.
          Persetujuan/peran adalah simulasi lokal.
        </p>
      </div>
      <div
        className="digital-mobile-tabs"
        role="tablist"
        aria-label="Panel disposisi digital"
      >
        {["Dokumen", "Disposisi"].map((t) => (
          <button
            role="tab"
            aria-selected={mobile === t}
            key={t}
            onClick={() => setMobile(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className={"digital-columns digital-tab-" + mobile}>
        <section className="panel digital-document">
          <h2>Surat & lampiran lokal</h2>
          <Field label="Pilih dokumen sumber">
            <select
              value={fileId || letter.attachmentIds[0] || ""}
              onChange={(e) => setFileId(e.target.value)}
            >
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          {file ? (
            <LocalDocumentPreview file={file} />
          ) : (
            <Empty text="Sumber belum memiliki lampiran." />
          )}
        </section>
        <section className="panel digital-directions">
          <div className="tabs" role="tablist" aria-label="Detail disposisi">
            {[
              "Identitas surat",
              "Arahan",
              "Penerima dan progres",
              "Laporan hasil",
              "Riwayat",
            ].map((t) => (
              <button
                role="tab"
                aria-selected={tab === t}
                key={t}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "Identitas surat" && (
            <>
              <h2>Identitas surat</h2>
              {[
                ["Agenda", letter.agenda],
                ["Nomor surat", letter.number],
                ["Pengirim", letter.sender],
                ["Diterima", dateLabel(letter.received)],
                ["Derajat", letter.urgency],
                ["Klasifikasi", letter.classification],
                ["Status surat", letter.status],
              ].map(([k, v]) => (
                <p key={k}>
                  <strong>{k}:</strong> {v}
                </p>
              ))}
              <Link to={"/surat-masuk/" + letter.id}>Buka Surat Masuk</Link>
              <Link className="button" to="/berkas-kegiatan">
                Hubungkan ke berkas kegiatan
              </Link>
            </>
          )}
          {tab === "Arahan" && (
            <>
              <h2>Arahan versi {d.version}</h2>
              <p>
                {d.mode} · {d.giver} · {d.issuerPosition}
              </p>
              <p>Terbit: {timestampLabel(d.issuedAt || d.createdAt)}</p>
              <p>Instruksi: {d.instructions.join(", ")}</p>
              <p className="digital-prewrap">{d.notes}</p>
              <p>
                Tenggat umum:{" "}
                {d.deadline ? dateLabel(d.deadline) : "Tanpa tenggat"}
              </p>
              <p>
                Laporan {d.reportRequired ? "wajib" : "tidak wajib"} ·
                Pemeriksaan {d.review ? "wajib" : "tidak wajib"}
              </p>
              {d.cancelled && (
                <p className="warning">
                  DIBATALKAN — {d.reason}. Bukti dan tugas selesai tetap menjadi
                  riwayat.
                </p>
              )}
              <h3>Penerima pada saat terbit</h3>
              {d.recipients.map((r) => (
                <p key={r.id || r.userId}>
                  <strong>
                    {r.unitName} · {r.userName} · {r.kind}
                  </strong>
                  <br />
                  {r.positionName} ({r.assignmentStart || "awal tidak diatur"} —{" "}
                  {r.assignmentEnd || "akhir tidak diatur"})<br />
                  {r.instruction} ·{" "}
                  {r.deadline ? dateLabel(r.deadline) : "Tanpa tenggat"}
                </p>
              ))}
            </>
          )}
          {tab === "Penerima dan progres" && (
            <>
              <h2>Penerima dan progres</h2>
              <p>
                {progress.done} dari {progress.total} {progress.label}
              </p>
              {receipts
                .filter((r) => !r.retired)
                .map((r) => (
                  <p key={r.id}>
                    {r.positionName} · {r.userName}:{" "}
                    <Badge>{r.readAt ? "Dibaca" : "Belum dibaca"}</Badge>
                  </p>
                ))}
              <Field label="Tampilan delegasi">
                <select
                  value={tree}
                  onChange={(e) => {
                    setTree(e.target.value);
                    localStorage.setItem("rsas-digital-tree", e.target.value);
                  }}
                >
                  <option value="list">Daftar sederhana</option>
                  <option value="tree">Struktur bertingkat</option>
                </select>
              </Field>
              {tree === "tree"
                ? tasks.filter((t) => !t.parentId).map((t) => renderTree(t))
                : tasks.map((t) => <DigitalTaskPanel key={t.id} task={t} />)}
            </>
          )}
          {tab === "Laporan hasil" && (
            <>
              <h2>Laporan hasil dan antrean perbaikan</h2>
              {tasks
                .filter((t) => t.status === "Perlu perbaikan")
                .map((t) => (
                  <p className="warning" key={t.id}>
                    Perlu perbaikan: {t.unitName} · {t.userName}
                  </p>
                ))}
              {tasks.map((t) => (
                <DigitalTaskPanel key={t.id} task={t} />
              ))}
            </>
          )}
          {tab === "Riwayat" && (
            <>
              <h2>Riwayat versi dan tindakan</h2>
              <Field label="Bandingkan versi disposisi">
                <select
                  value={compare}
                  onChange={(e) => setCompare(e.target.value)}
                >
                  <option value="">Pilih versi historis</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      Versi {v.version} · {v.reason}
                    </option>
                  ))}
                </select>
              </Field>
              {old && (
                <>
                  <div className="digital-diff">
                    <pre>{JSON.stringify(old, null, 2)}</pre>
                    <pre>{JSON.stringify(d, null, 2)}</pre>
                  </div>
                  <Link
                    className="button"
                    to={"/cetak-disposisi/" + d.id + "?version=" + old.version}
                  >
                    Cetak versi historis {old.version}
                  </Link>
                </>
              )}
              {logs
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((l) => (
                  <div className="timeline" key={l.id}>
                    <strong>{l.text}</strong>
                    <small>
                      {l.author} · {timestampLabel(l.createdAt)}
                    </small>
                    <details>
                      <summary>Sebelum / sesudah</summary>
                      <pre>
                        {JSON.stringify(
                          { sebelum: l.before, sesudah: l.after },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </div>
                ))}
            </>
          )}
          {outputs.length > 0 && (
            <>
              <h3>Dokumen keluaran terkait</h3>
              {outputs.map((o) => (
                <p key={o.id}>
                  <Link
                    to={
                      o.kind === "notes"
                        ? "/nota-dinas/" + o.targetId
                        : "/agenda"
                    }
                  >
                    {o.kind === "notes"
                      ? "Nota Dinas hasil"
                      : "Agenda dari arahan"}{" "}
                    · {o.taskId ? "sumber tugas" : "sumber disposisi"}
                  </Link>
                </p>
              ))}
            </>
          )}
        </section>
      </div>
      {cancel && (
        <Modal
          title="Pembatalan disposisi digital"
          onClose={() => !busy && setCancel(false)}
        >
          <p>
            Hanya tugas terbuka yang dibatalkan. Laporan/bukti dan hasil selesai
            dipertahankan.
          </p>
          <Field label="Alasan pembatalan digital">
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} />
          </Field>
          <p>
            Revisi yang ditinjau: {expected}; revisi terkini: {d.revision}.
          </p>
          <button onClick={() => setExpected(d.revision || 1)}>
            Saya sudah meninjau revisi terbaru
          </button>
          <button
            disabled={busy || !memo.trim()}
            className="danger"
            onClick={() =>
              run(async () => {
                setBusy(true);
                try {
                  const next = await cancelDigitalDisposition(
                    d.id,
                    expected || 1,
                    memo,
                    user.id,
                  );
                  setExpected(next.revision);
                  setMemo("");
                  setCancel(false);
                } finally {
                  setBusy(false);
                }
              }, "Pembatalan dicatat.")
            }
          >
            Konfirmasi batalkan digital
          </button>
        </Modal>
      )}
      {output && (
        <Modal
          title={
            output === "notes"
              ? "Konfirmasi konsep Nota Dinas"
              : "Konfirmasi agenda"
          }
          onClose={() => !busy && setOutput(undefined)}
        >
          <p>
            Dokumen baru menyimpan referensi disposisi dan surat. Pengulangan
            pada sumber yang sama membuka dokumen yang telah dibuat.
          </p>
          <Field label="Tugas sumber keluaran (opsional)">
            <select
              value={sourceTask}
              onChange={(e) => setSourceTask(e.target.value)}
            >
              <option value="">Disposisi ini</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.unitName} · {t.userName}
                </option>
              ))}
            </select>
          </Field>
          {output === "events" && (
            <>
              {(["title", "date", "start", "end", "location"] as const).map(
                (k, i) => (
                  <Field
                    key={k}
                    label={
                      [
                        "Judul agenda dari disposisi",
                        "Tanggal agenda",
                        "Mulai agenda",
                        "Selesai agenda",
                        "Lokasi agenda",
                      ][i]
                    }
                  >
                    <input
                      type={
                        k === "date"
                          ? "date"
                          : k === "start" || k === "end"
                            ? "time"
                            : "text"
                      }
                      value={form[k]}
                      onChange={(e) =>
                        setForm({ ...form, [k]: e.target.value })
                      }
                    />
                  </Field>
                ),
              )}
              <label>
                <input
                  type="checkbox"
                  checked={form.acknowledged}
                  onChange={(e) =>
                    setForm({ ...form, acknowledged: e.target.checked })
                  }
                />{" "}
                Benturan jadwal telah saya periksa; simpan meskipun bertumpang
                tindih
              </label>
            </>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                setBusy(true);
                try {
                  const target = await dispositionOutput(
                    d.id,
                    user.id,
                    output,
                    true,
                    {
                      ...form,
                      taskId: sourceTask || undefined,
                      unitId: user.unitId,
                    },
                  );
                  setOutput(undefined);
                  setForm({
                    title: "",
                    date: "",
                    start: "",
                    end: "",
                    location: "",
                    acknowledged: false,
                  });
                  navigate(
                    output === "notes" ? "/nota-dinas/" + target : "/agenda",
                  );
                } finally {
                  setBusy(false);
                }
              }, "Dokumen keluaran ditautkan.")
            }
          >
            Konfirmasi buat {output === "notes" ? "Nota Dinas" : "agenda"}
          </button>
        </Modal>
      )}
    </>
  );
}
