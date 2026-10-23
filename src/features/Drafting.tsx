import { MailDraftTools } from "./MailDraftTools";
import { richBlocks, inlineRuns } from "../repositories/notaDocument";
import { useEffect as useImageEffect } from "react";
import type { Attachment } from "../types";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import {
  createDraft,
  saveDraft,
  draftAction,
  restoreDraftVersion,
} from "../repositories/drafts";
import { draftDocx } from "../repositories/docx";
import { useApp } from "../app/context";
import { useUnsavedChanges } from "../app/unsaved";
import { Badge, Empty, Field, Modal } from "../components/common";
import { dateLabel, download, now, id } from "../utils";
import type { OfficialDraft, DraftContent, DraftTemplate } from "../types";
const labels: Record<keyof DraftContent, string> = {
  conceptNumber: "Nomor konsep",
  address: "Alamat",
  opening: "Pembukaan",
  referenceText: "Referensi surat terpilih",
  attachmentCount: "Jumlah lampiran disebut",
  font: "Font (Times New Roman atau Arial)",
  margin: "Margin A4 (20, 25, atau 30 mm)",
  heading: "Kop",
  number: "Nomor (setelah persetujuan)",
  date: "Tanggal",
  to: "Kepada",
  from: "Dari",
  subject: "Perihal",
  basis: "Dasar",
  body: "Isi",
  closing: "Penutup",
  copies: "Tembusan",
  signer: "Identitas penandatangan",
};
export function Drafting() {
  const drafts = useLiveQuery(() => db.drafts.toArray()) || [];
  const templates = useLiveQuery(() => db.templates.toArray()) || [];
  const { user, run } = useApp();
  const navigate = useNavigate();
  const [template, setTemplate] = useState("");
  const [edit, setEdit] = useState<DraftTemplate>();
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">PENYUSUNAN NASKAH</p>
          <h1>Pembuat Naskah Dinas</h1>
          <p className="muted">
            Template awal generik dan dapat disesuaikan. Persetujuan lokal
            adalah simulasi.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="toolbar">
          <Field label="Template naskah">
            <select
              value={template || templates[0]?.id || ""}
              onChange={(e) => setTemplate(e.target.value)}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <button
            className="primary"
            disabled={!templates.length}
            onClick={() =>
              run(async () => {
                const d = await createDraft(
                  template || templates[0]?.id,
                  user.id,
                  user.unitId,
                  true,
                );
                navigate("/naskah/" + d.id);
              }, "Draf naskah dibuat.")
            }
          >
            Buat naskah
          </button>
          {user.role === "Admin Sistem" && (
            <button
              onClick={() => {
                const t = templates.find(
                  (t) => t.id === (template || templates[0]?.id),
                );
                if (t)
                  setEdit({
                    ...t,
                    id: id(),
                    name: t.name + " — salinan khusus",
                  });
              }}
            >
              Duplikasi template khusus
            </button>
          )}
          {user.role === "Admin Sistem" && templates.length > 0 && (
            <button
              onClick={() =>
                setEdit({
                  ...templates.find(
                    (t) => t.id === (template || templates[0]?.id),
                  )!,
                })
              }
            >
              Atur template
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Perihal / jenis</th>
                <th>Versi</th>
                <th>Tahap</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.content.subject}</strong>
                    <small>
                      {d.kind} · {d.content.number || "Belum bernomor"}
                    </small>
                  </td>
                  <td>v{d.version}</td>
                  <td>
                    <Badge>{d.stage}</Badge>
                  </td>
                  <td>
                    <Link className="button" to={"/naskah/" + d.id}>
                      Buka editor
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!drafts.length && (
          <Empty text="Pilih template dan tekan Buat naskah untuk mulai menyusun." />
        )}
      </section>
      {edit && (
        <Modal
          title="Pengaturan template naskah"
          onClose={() => setEdit(undefined)}
        >
          <Field label="Nama template">
            <input
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </Field>
          <p>
            Template generik tidak boleh disebut resmi. Tandai resmi hanya
            setelah Anda memverifikasi acuan RSAS yang sah.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={edit.official}
              onChange={(e) => setEdit({ ...edit, official: e.target.checked })}
            />{" "}
            Acuan resmi telah diverifikasi oleh pengguna
          </label>
          {(["heading", "basis", "body", "closing", "signer"] as const).map(
            (k) => (
              <Field key={k} label={labels[k]}>
                <textarea
                  value={edit.content[k] || ""}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      content: { ...edit.content, [k]: e.target.value },
                    })
                  }
                />
              </Field>
            ),
          )}
          <button
            className="primary"
            onClick={() =>
              run(async () => {
                await db.templates.put({ ...edit, updatedAt: now() });
                setEdit(undefined);
              }, "Template disimpan. Naskah lama tidak diubah.")
            }
          >
            Simpan template
          </button>
        </Modal>
      )}
    </>
  );
}
export function DraftEditor() {
  const { id = "" } = useParams();
  const d = useLiveQuery(() => db.drafts.get(id), [id]);
  return d?.id === id ? (
    <Workspace key={id} original={d} />
  ) : (
    <Empty text="Memuat naskah atau naskah tidak ditemukan." />
  );
}
function Workspace({ original }: { original: OfficialDraft }) {
  const { user, run } = useApp();
  const [saved, setSaved] = useState(original);
  const [content, setContent] = useState(original.content);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [note, setNote] = useState("");
  const [reviewers, setReviewers] = useState<string[]>(original.reviewerIds);
  const [candidate, setCandidate] = useState("");
  const [compare, setCompare] = useState<number>();
  const numberedHistory =
    useLiveQuery(
      () => db.outgoing.filter((o) => o.draftId === original.id).toArray(),
      [original.id],
    ) || [];
  const current =
    useLiveQuery(() => db.drafts.get(original.id), [original.id]) || saved;
  const versions =
    useLiveQuery(
      () => db.draftVersions.where({ draftId: original.id }).toArray(),
      [original.id],
    ) || [];
  const decisions =
    useLiveQuery(
      () => db.draftDecisions.where({ draftId: original.id }).toArray(),
      [original.id],
    ) || [];
  const users = useLiveQuery(() => db.users.toArray()) || [];
  const units = useLiveQuery(() => db.units.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.get("main"));
  const template = useLiveQuery(
    () => db.templates.get(original.templateId),
    [original.templateId],
  );
  const issued =
    !!saved.integrated &&
    ["Pengiriman", "Tercatat dikirim", "Diarsipkan"].includes(saved.stage);
  const attachmentFiles =
    useLiveQuery(
      () => db.attachments.where({ letterId: original.id }).toArray(),
      [original.id],
    ) || [];
  const exportFiles = (ids: string[]) =>
    ids.map((aid) => {
      const f = attachmentFiles.find((f) => f.id === aid);
      if (!f) throw Error("Lampiran hilang: " + aid);
      return f;
    });
  const dirty = JSON.stringify(content) !== JSON.stringify(saved.content);
  useUnsavedChanges(dirty, true);
  const commit = async () => {
    if (lock.current)
      throw Error("Penyimpanan sedang berjalan. Tunggu sebentar.");
    lock.current = true;
    setSaving(true);
    try {
      const d = await saveDraft(saved.id, saved.revision, content, user.id);
      setSaved(d);
      setContent((c) =>
        JSON.stringify(c) === JSON.stringify(content) ? d.content : c,
      );
      setError("");
      return d;
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  useEffect(() => {
    if (!dirty || saving || acting || error || issued) return;
    const timer = setTimeout(
      () => void commit().catch((e) => setError(String(e))),
      1000,
    );
    return () => clearTimeout(timer);
  }, [content, dirty, saving, acting, error, saved.revision]);
  const act = (action: Parameters<typeof draftAction>[2]) =>
    run(async () => {
      setActing(true);
      try {
        const d = dirty ? await commit() : saved;
        const next = await draftAction(
          d.id,
          d.revision,
          action,
          user.id,
          note,
          reviewers,
        );
        setSaved(next);
        setContent((c) =>
          JSON.stringify(c) === JSON.stringify(content) ? next.content : c,
        );
        setNote((c) => (c === note ? "" : c));
      } finally {
        setActing(false);
      }
    }, "Keputusan naskah disimpan untuk versi yang ditampilkan.");
  const canReview =
    user.role === "Admin Sistem" ||
    current.reviewerIds[current.reviewIndex] === user.id;
  const canApprove = ["Admin Sistem", "Kepala RSAU"].includes(user.role);
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">NASKAH / {current.kind}</p>
          <h1>{current.content.subject}</h1>
          <p className="muted">
            Versi {current.version} ·{" "}
            {current.reviewingVersion
              ? `Diperiksa: v${current.reviewingVersion}`
              : "Belum diperiksa"}{" "}
            ·{" "}
            {saving
              ? "Menyimpan…"
              : `Simpan terakhir: ${new Date(saved.updatedAt).toLocaleTimeString("id-ID")}`}
          </p>
        </div>
        <Link className="button" to="/naskah">
          Daftar naskah
        </Link>
      </div>
      <section className="panel">
        <div className="toolbar">
          <Badge>{current.stage}</Badge>
          <button
            disabled={saving || !dirty}
            onClick={() => void commit().catch((e) => setError(String(e)))}
          >
            Simpan sekarang
          </button>
          <div className="tabs no-print" aria-label="Isi dan Pratinjau">
            <button
              className={!preview ? "active" : ""}
              onClick={() => setPreview(false)}
            >
              Isi
            </button>
            <button
              className={preview ? "active" : ""}
              onClick={() => setPreview(true)}
            >
              Pratinjau A4
            </button>
          </div>
          <button
            onClick={() =>
              run(async () => {
                const d = dirty ? await commit() : saved;
                download(
                  await draftDocx(
                    d.kind,
                    d.content,
                    d.templateOfficial,
                    exportFiles(d.attachmentIds),
                  ),
                  d.kind + ".docx",
                );
              }, "DOCX teks dapat diedit berhasil dibuat.")
            }
          >
            Ekspor DOCX
          </button>
          <button
            onClick={() => {
              setPreview(true);
              setTimeout(() => window.print(), 100);
            }}
          >
            Cetak naskah
          </button>
          <button
            onClick={() => {
              if (
                !dirty ||
                confirm("Ganti input dengan versi tersimpan terbaru?")
              ) {
                setSaved(current);
                setContent(current.content);
                setError("");
              }
            }}
          >
            Muat versi terbaru
          </button>
        </div>
        {error && (
          <p role="alert" className="error">
            {error} Input dipertahankan.{" "}
            <button
              onClick={() =>
                download(
                  new Blob([JSON.stringify(content)], {
                    type: "application/json",
                  }),
                  "draf-naskah.json",
                )
              }
            >
              Ekspor input draf
            </button>
          </p>
        )}
        {!current.templateOfficial && (
          <p className="warning no-print">
            Template generik — belum diverifikasi sebagai format resmi RSAS.
          </p>
        )}
        <div
          className={
            "mail-editor-layout " + (preview ? "show-paper" : "show-form")
          }
        >
          <div className="mail-a4-preview">
            <DraftPaper
              kind={current.kind}
              content={content}
              official={!!current.templateOfficial}
              files={saved.attachmentIds.flatMap(
                (aid) => attachmentFiles.find((f) => f.id === aid) || [],
              )}
            />
          </div>
          <div className="grid2 no-print mail-editor-form">
            {(Object.keys(labels) as (keyof DraftContent)[]).map((k) => (
              <Field key={k} label={labels[k]}>
                {[
                  "heading",
                  "basis",
                  "body",
                  "closing",
                  "copies",
                  "opening",
                  "referenceText",
                ].includes(k) ? (
                  <textarea
                    disabled={
                      issued || (saved.integrated && k === "referenceText")
                    }
                    onPaste={(e) => {
                      e.preventDefault();
                      const input = e.currentTarget;
                      const text = e.clipboardData.getData("text/plain");
                      setContent({
                        ...content,
                        [k]:
                          (content[k] || "").slice(0, input.selectionStart) +
                          text +
                          (content[k] || "").slice(input.selectionEnd),
                      });
                    }}
                    value={content[k] || ""}
                    onChange={(e) =>
                      setContent({ ...content, [k]: e.target.value })
                    }
                  />
                ) : k === "font" || k === "margin" ? (
                  <select
                    disabled={issued}
                    value={
                      content[k] || (k === "font" ? "Times New Roman" : "25")
                    }
                    onChange={(e) =>
                      setContent({ ...content, [k]: e.target.value })
                    }
                  >
                    {(k === "font"
                      ? ["Times New Roman", "Arial"]
                      : ["20", "25", "30"]
                    ).map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    disabled={
                      k === "number" ||
                      issued ||
                      (saved.integrated && k === "referenceText")
                    }
                    type={k === "date" ? "date" : "text"}
                    value={content[k] || ""}
                    onChange={(e) =>
                      setContent({ ...content, [k]: e.target.value })
                    }
                  />
                )}
              </Field>
            ))}
            <Field label="Sisipkan nama unit pada tujuan">
              <select
                disabled={issued}
                value=""
                onChange={(e) =>
                  setContent({
                    ...content,
                    to: content.to + (content.to ? "\n" : "") + e.target.value,
                  })
                }
              >
                <option value="">Pilih unit</option>
                {units
                  .filter((u) => u.active)
                  .map((u) => (
                    <option key={u.id}>{u.name}</option>
                  ))}
              </select>
            </Field>
            <button
              disabled={issued}
              onClick={() =>
                setContent({
                  ...content,
                  signer: [settings?.official, settings?.rank, settings?.nrp]
                    .filter(Boolean)
                    .join(" · "),
                })
              }
            >
              Sisipkan pejabat dari pengaturan
            </button>
          </div>
        </div>
        <p className="no-print">
          Format isi: **tebal**, _miring_, daftar 1. / a., tabel | kolom | kolom
          |. Tempelan Word dibersihkan menjadi teks.
        </p>
        <div className="no-print">
          <h2>Pemeriksaan berjenjang</h2>
          <p>
            Paraf dan persetujuan lokal adalah simulasi, bukan autentikasi
            identitas atau tanda tangan elektronik tersertifikasi.
          </p>
          <Field label="Pemeriksa aktif sesuai unit">
            <select
              value={candidate}
              onChange={(e) => setCandidate(e.target.value)}
            >
              <option value="">Pilih pemeriksa</option>
              {users
                .filter(
                  (u) =>
                    u.active &&
                    (u.unitId === current.unitId ||
                      ["Admin Sistem", "Kepala RSAU"].includes(u.role)),
                )
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.role}
                  </option>
                ))}
            </select>
          </Field>
          <button
            disabled={!candidate || reviewers.includes(candidate)}
            onClick={() => {
              setReviewers([...reviewers, candidate]);
              setCandidate("");
            }}
          >
            Tambahkan pemeriksa berurutan
          </button>
          {reviewers.map((uid, i) => (
            <p key={uid}>
              {i + 1}. {users.find((u) => u.id === uid)?.name}{" "}
              <button
                onClick={() => setReviewers(reviewers.filter((v) => v !== uid))}
              >
                Hapus dari urutan
              </button>
            </p>
          ))}
          {current.integrated && (
            <p>
              Checklist pengajuan memeriksa tujuan, isi, penandatangan,
              placeholder, tanggal, referensi berdasarkan ID, dan jumlah/berkas
              lampiran. Pada tahap penomoran, isi catatan berikut dengan nomor
              resmi manual atau kosongkan untuk pola lokal.
            </p>
          )}
          <Field label="Catatan koreksi / keputusan / pemulihan">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="toolbar">
            {["Draf", "Perbaikan"].includes(current.stage) && (
              <button
                className="primary"
                disabled={saving || acting || !reviewers.length}
                onClick={() => act("submit")}
              >
                Ajukan pemeriksaan
              </button>
            )}
            {current.stage === "Pemeriksaan" && canReview && (
              <button
                disabled={saving || acting}
                className="primary"
                onClick={() => act("review")}
              >
                Paraf simulasi versi {current.version}
              </button>
            )}
            {["Pemeriksaan", "Persetujuan"].includes(current.stage) &&
              (canReview || canApprove) && (
                <button
                  disabled={saving || acting || !note.trim()}
                  onClick={() => act("return")}
                >
                  Kembalikan untuk perbaikan
                </button>
              )}
            {current.stage === "Persetujuan" && canApprove && (
              <button
                disabled={saving || acting}
                className="primary"
                onClick={() => act("approve")}
              >
                Setujui simulasi versi {current.version}
              </button>
            )}
            {current.stage === "Penomoran" &&
              ["Admin Sistem", "Petugas Urtu/Administrasi"].includes(
                user.role,
              ) && (
                <button
                  disabled={saving || acting}
                  className="primary"
                  onClick={() => act("number")}
                >
                  Terbitkan nomor
                </button>
              )}
            {current.outgoingId && (
              <Link
                className="button"
                to={
                  "/buku-ekspedisi?surat=" +
                  encodeURIComponent(current.outgoingId)
                }
              >
                Catat pengiriman di Surat Keluar
              </Link>
            )}
          </div>
          <h2>Riwayat versi dan perbandingan</h2>
          {versions
            .slice()
            .sort((a, b) => b.version - a.version)
            .map((v) => (
              <div className="mini-card" key={v.id}>
                <strong>
                  v{v.version} · {v.reason}
                </strong>
                <small>
                  {new Date(v.createdAt).toLocaleString("id-ID")} ·{" "}
                  {users.find((u) => u.id === v.authorId)?.name || v.authorId}
                </small>
                <button
                  onClick={() =>
                    run(
                      async () =>
                        download(
                          await draftDocx(
                            current.kind,
                            {
                              ...v.content,
                              number:
                                numberedHistory.find(
                                  (o) => o.draftVersion === v.version,
                                )?.number || v.content.number,
                            },
                            current.templateOfficial,
                            exportFiles(v.attachmentIds || []),
                          ),
                          `naskah-v${v.version}.docx`,
                        ),
                      "DOCX versi historis dibuat tanpa mengubah naskah.",
                    )
                  }
                >
                  Ekspor DOCX versi {v.version}
                </button>
                <button onClick={() => setCompare(v.version)}>
                  Bandingkan dengan versi sekarang
                </button>
                <button
                  disabled={!note.trim()}
                  onClick={() =>
                    run(async () => {
                      const next = await restoreDraftVersion(
                        current.id,
                        v.version,
                        saved.revision,
                        user.id,
                        note,
                      );
                      setSaved(next);
                      setContent(next.content);
                    }, "Versi dipulihkan sebagai versi baru. Persetujuan perlu diperiksa ulang.")
                  }
                >
                  Pulihkan versi (isi alasan dahulu)
                </button>
              </div>
            ))}
          <h2>Riwayat keputusan</h2>
          {decisions.map((d) => (
            <p key={d.id}>
              <strong>
                {d.action} · v{d.version}
              </strong>
              <small>
                {users.find((u) => u.id === d.userId)?.name} ·{" "}
                {new Date(d.createdAt).toLocaleString("id-ID")}
              </small>
              {d.section && <strong>{d.section}: </strong>}
              {d.note}
            </p>
          ))}
        </div>
      </section>
      <MailDraftTools
        draft={saved}
        disabled={dirty || saving}
        accept={(next) => {
          setSaved(next);
          setContent(next.content);
          setError("");
        }}
      />
      {compare !== undefined && (
        <Modal
          title={`Perbandingan v${compare} → v${current.version}`}
          onClose={() => setCompare(undefined)}
        >
          <h3>Lampiran dan urutan</h3>
          <div className="grid2">
            <pre>
              {(
                versions.find((v) => v.version === compare)?.attachmentIds || []
              )
                .map(
                  (aid) =>
                    attachmentFiles.find((f) => f.id === aid)?.title ||
                    attachmentFiles.find((f) => f.id === aid)?.name ||
                    aid,
                )
                .join("\n") || "Tanpa lampiran"}
            </pre>
            <pre>
              {saved.attachmentIds
                .map(
                  (aid) =>
                    attachmentFiles.find((f) => f.id === aid)?.title ||
                    attachmentFiles.find((f) => f.id === aid)?.name ||
                    aid,
                )
                .join("\n") || "Tanpa lampiran"}
            </pre>
          </div>
          {(Object.keys(labels) as (keyof DraftContent)[])
            .filter(
              (k) =>
                versions.find((v) => v.version === compare)?.content[k] !==
                current.content[k],
            )
            .map((k) => (
              <div key={k}>
                <h3>{labels[k]}</h3>
                <div className="grid2">
                  <pre>
                    {versions.find((v) => v.version === compare)?.content[k] ||
                      "—"}
                  </pre>
                  <pre>{current.content[k] || "—"}</pre>
                </div>
              </div>
            ))}
        </Modal>
      )}
    </>
  );
}
export function DraftPaper({
  kind,
  content: c,
  official = false,
  files = [],
}: {
  kind: string;
  content: DraftContent;
  official?: boolean;
  files?: Attachment[];
}) {
  return (
    <article
      className="print-sheet document-paper mail-paper"
      style={{
        fontFamily:
          c.font === "Arial"
            ? "Arial, RSAS Sans, sans-serif"
            : "Times New Roman, RSAS Serif, serif",
        padding: `${c.margin || 25}mm`,
      }}
    >
      <style>{`@page rsasMail {size:A4;margin:${c.margin || 25}mm;} @media print {.mail-paper {page:rsasMail;}}`}</style>
      <header style={{ whiteSpace: "pre-wrap" }}>{c.heading}</header>
      <h1>{kind.toUpperCase()}</h1>
      {!c.number && <p className="demo-stamp">DRAF — BELUM DITERBITKAN</p>}
      <p className="demo-stamp">
        {official
          ? "CONTOH/DEMO"
          : "CONTOH/DEMO — TEMPLATE GENERIK, BUKAN FORMAT RESMI"}
      </p>
      <dl>
        {(["number", "date", "to", "from", "subject"] as const).map((k) => (
          <div key={k}>
            <dt>{labels[k]}</dt>
            <dd>{k === "date" ? dateLabel(c[k]) : c[k] || "—"}</dd>
          </div>
        ))}
      </dl>
      {c.address && <p>Alamat: {c.address}</p>}
      {c.conceptNumber && <p>Nomor konsep: {c.conceptNumber}</p>}
      {c.referenceText && (
        <>
          <h3>Referensi</h3>
          <RichDraft text={c.referenceText} />
        </>
      )}
      {c.basis && (
        <>
          <h3>Dasar</h3>
          <RichDraft text={c.basis} />
        </>
      )}
      <RichDraft text={c.opening || ""} />
      <RichDraft text={c.body} />
      <RichDraft text={c.closing} />
      <p>Lampiran: {c.attachmentCount || files.length}</p>
      <div className="signature">
        <div className="signature-space" />
        {c.signer}
      </div>
      <h3>Tembusan</h3>
      <RichDraft text={c.copies} />
      {files.map((f, i) => (
        <DraftAttachmentFigure
          key={f.id}
          file={f}
          number={c.number || c.conceptNumber || "DRAF"}
          index={i + 1}
        />
      ))}
    </article>
  );
}

export function RichDraft({ text }: { text: string }) {
  return (
    <>
      {richBlocks(text).map((b, i) =>
        b.kind === "table" ? (
          <table key={i}>
            <tbody>
              {b.rows.map((row, j) => (
                <tr key={j}>
                  {row.map((cell, k) => (
                    <td key={k}>
                      {inlineRuns(cell).map((r, n) => (
                        <span
                          key={n}
                          style={{
                            fontWeight: r.bold ? 700 : undefined,
                            fontStyle: r.italics ? "italic" : undefined,
                          }}
                        >
                          {r.text}
                        </span>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p key={i}>
            {inlineRuns(b.text).map((r, j) => (
              <span
                key={j}
                style={{
                  fontWeight: r.bold ? 700 : undefined,
                  fontStyle: r.italics ? "italic" : undefined,
                }}
              >
                {r.text}
              </span>
            ))}
          </p>
        ),
      )}
    </>
  );
}
function DraftAttachmentFigure({
  file: f,
  number,
  index,
}: {
  file: Attachment;
  number: string;
  index: number;
}) {
  const [url, setUrl] = useState("");
  useImageEffect(() => {
    const u = URL.createObjectURL(f.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [f.blob]);
  return (
    <figure className="mail-attachment">
      <figcaption>
        Lampiran {index} · {number} · {f.title || f.name}
      </figcaption>
      {f.type.startsWith("image/") ? (
        <img src={url} alt={f.title || f.name} />
      ) : (
        <p>{f.name} — berkas terpisah, unduh lampiran asli.</p>
      )}
      <p>{f.caption}</p>
    </figure>
  );
}
