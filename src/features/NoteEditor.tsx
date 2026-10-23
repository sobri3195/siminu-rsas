import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, dataMode } from "../storage/db";
import { useApp } from "../app/context";
import { useUnsavedChanges } from "../app/unsaved";
import { Field, Modal, Badge, Empty } from "../components/common";
import type {
  ServiceNote,
  NoteContent,
  Attachment,
  NoteTemplate,
} from "../types";
import {
  saveNote,
  noteAction,
  noteChecklist,
  restoreNote,
  templateContent,
} from "../repositories/nota";
import type { NoteAction } from "../repositories/nota";
import { noteDocx, prepareNoteImage } from "../repositories/notaDocument";
import { linkToCase } from "../repositories/cases";
import { id, timestampLabel, download } from "../utils";
import { SignerFields, FormatFields } from "./NoteSettings";
import { NotePaper } from "./NotePaper";

function RichEditor({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const format = (kind: string) => {
    const el = ref.current;
    if (!el) return;
    const a = el.selectionStart,
      b = el.selectionEnd,
      selected = value.slice(a, b) || "teks";
    const next =
      kind === "bold"
        ? "**" + selected + "**"
        : kind === "italic"
          ? "_" + selected + "_"
          : kind === "number"
            ? "\n1. " + selected + "\n2. "
            : kind === "letter"
              ? "\na. " + selected + "\nb. "
              : "\n| Kolom 1 | Kolom 2 |\n| --- | --- |\n| Isi 1 | Isi 2 |\n";
    onChange(value.slice(0, a) + next + value.slice(b));
    el.focus();
  };
  return (
    <div className="nota-rich">
      <div className="toolbar" aria-label={"Format " + label}>
        {[
          ["bold", "Tebal"],
          ["italic", "Miring"],
          ["number", "Daftar angka"],
          ["letter", "Daftar huruf"],
          ["table", "Tabel"],
        ].map(([k, n]) => (
          <button
            type="button"
            disabled={disabled}
            key={k}
            onClick={() => format(k)}
          >
            {n}
          </button>
        ))}
      </div>
      <Field label={label}>
        <textarea
          ref={ref}
          rows={4}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            const el = e.currentTarget,
              a = el.selectionStart,
              b = el.selectionEnd;
            onChange(
              value.slice(0, a) +
                e.clipboardData.getData("text/plain").replace(/\u0000/g, "") +
                value.slice(b),
            );
          }}
        />
      </Field>
    </div>
  );
}
export function NoteEditor() {
  const { id: nid = "" } = useParams(),
    n = useLiveQuery(() => db.notes.get(nid), [nid]);
  return n ? (
    <Workspace initial={n} key={n.id} />
  ) : (
    <Empty text="Memuat nota dinas atau dokumen tidak ditemukan." />
  );
}
function Workspace({ initial }: { initial: ServiceNote }) {
  const { user, run } = useApp();
  const [saved, setSaved] = useState(initial),
    [content, setContent] = useState<NoteContent>(
      structuredClone(initial.content),
    ),
    [pending, setPending] = useState<Attachment[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(794),
    [zoom, setZoom] = useState("fit");
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) =>
      setPreviewWidth(entries[0].contentRect.width),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [actionBusy, setActionBusy] = useState(false);
  const [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState(""),
    lock = useRef(false);
  const [memo, setMemo] = useState(""),
    [section, setSection] = useState("Dokumen"),
    [channel, setChannel] = useState(""),
    [reviewers, setReviewers] = useState<string[]>(initial.reviewerIds);
  const [tab, setTab] = useState(
      localStorage.getItem("rsas-note-tab") || "Isi",
    ),
    [full, setFull] = useState(false),
    [candidate, setCandidate] = useState<NoteTemplate>(),
    [templateId, setTemplateId] = useState("");
  const [compareA, setCompareA] = useState(""),
    [compareB, setCompareB] = useState(""),
    [bundle, setBundle] = useState("");
  const files =
      useLiveQuery(
        () => db.attachments.where({ letterId: initial.id }).toArray(),
        [initial.id],
      ) || [],
    allFiles = [
      ...files,
      ...pending.filter((p) => !files.some((f) => f.id === p.id)),
    ];
  const versions = (
    useLiveQuery(
      () => db.noteVersions.where({ noteId: initial.id }).toArray(),
      [initial.id],
    ) || []
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const reviews =
    useLiveQuery(
      () => db.noteReviews.where({ noteId: initial.id }).toArray(),
      [initial.id],
    ) || [];
  const units = useLiveQuery(() => db.units.toArray()) || [],
    users = useLiveQuery(() => db.users.toArray()) || [],
    letters = useLiveQuery(() => db.letters.toArray()) || [],
    dispositions = useLiveQuery(() => db.dispositions.toArray()) || [],
    tasks = useLiveQuery(() => db.tasks.toArray()) || [],
    templates = useLiveQuery(() => db.noteTemplates.toArray()) || [],
    bundles = useLiveQuery(() => db.caseFiles.toArray()) || [];
  const editable =
    ["Draf", "Perlu perbaikan"].includes(saved.status) &&
    (saved.authorId === user.id || user.role === "Admin Sistem");
  const dirty =
    JSON.stringify(content) !== JSON.stringify(saved.content) ||
    pending.length > 0;
  useUnsavedChanges(dirty, true);
  const patch = (p: Partial<NoteContent>) =>
    setContent((c) => ({ ...c, ...p }));
  const store = async () => {
    if (lock.current) throw Error("Tunggu penyimpanan selesai.");
    lock.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const n = await saveNote(
        saved.id,
        saved.revision,
        content,
        user.id,
        pending,
      );
      setSaved(n);
      setPending((p) => p.filter((f) => !pending.some((x) => x.id === f.id)));
      return n;
    } catch (e) {
      setSaveError(String(e));
      throw e;
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  useEffect(() => {
    if (!dirty || saving || saveError || !editable) return;
    const timer = setTimeout(() => void store().catch(() => {}), 900);
    return () => clearTimeout(timer);
  }, [content, pending, dirty, saving, saveError, editable, saved.revision]);
  const action = (kind: NoteAction) => {
    setActionBusy(true);
    return run(async () => {
      try {
        if (dirty || lock.current)
          throw Error("Simpan perubahan terlebih dahulu.");
        const n = await noteAction(saved.id, saved.revision, kind, user.id, {
          note: memo,
          section,
          reviewers,
          date: content.signer.date,
          channel,
        });
        setSaved(n);
        setContent(structuredClone(n.content));
        setMemo((current) => (current === memo ? "" : current));
      } finally {
        setActionBusy(false);
      }
    }, "Tindakan nota dinas dicatat.");
  };
  const stable = !dirty && !saving && !actionBusy;
  const doc = { ...saved, content },
    demo = dataMode === "demo",
    checklist = noteChecklist(content, saved.officialNumber, saved.status);
  const activeReviewer =
    saved.reviewerIds[saved.reviewIndex] === user.id ||
    user.role === "Admin Sistem";
  const approval = user.role === "Kepala RSAU" || user.role === "Admin Sistem",
    registrar = ["Admin Sistem", "Petugas Urtu/Administrasi"].includes(
      user.role,
    );
  const old = versions.find((v) => v.id === compareA) || versions[1],
    other = versions.find((v) => v.id === compareB);
  const diffs = old
    ? Object.keys(content).filter(
        (k) =>
          JSON.stringify(old.content[k as keyof NoteContent]) !==
          JSON.stringify((other?.content || content)[k as keyof NoteContent]),
      )
    : [];
  const fileInput = async (selected: File[]) => {
    if (content.attachments.length + selected.length > 100)
      throw Error("Maksimal 100 lampiran per nota.");
    const added: Attachment[] = [];
    for (const f of selected) {
      const ext = f.name.split(".").pop()?.toLowerCase(),
        types: Record<string, string> = {
          pdf: "application/pdf",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        };
      if (!ext || !types[ext] || f.size > 15 * 1024 * 1024)
        throw Error(
          "Pilih PDF, JPG, PNG, atau DOCX maksimal 15 MB per berkas.",
        );
      if (ext === "png" || ext === "jpg" || ext === "jpeg") {
        const bitmap = await createImageBitmap(f);
        bitmap.close();
      }
      added.push({
        id: id(),
        letterId: saved.id,
        name: f.name,
        type: types[ext],
        blob: f,
      });
    }
    setPending((p) => [...p, ...added]);
    setContent((current) => ({
      ...current,
      attachments: [
        ...current.attachments,
        ...added.map((f) => ({
          id: f.id,
          title: f.name,
          caption: "",
          source: "",
          inline: f.type.startsWith("image/"),
          width: 150,
          rotation: 0 as const,
          crop: { top: 0, right: 0, bottom: 0, left: 0 },
        })),
      ],
    }));
  };
  const print = () =>
    run(async () => {
      for (const a of content.attachments.filter((a) => a.inline)) {
        const f = allFiles.find((f) => f.id === a.id);
        if (!f) throw Error("Lampiran hilang.");
        await prepareNoteImage(f, a);
      }
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      window.print();
    }, "");
  return (
    <div className={"nota-workspace " + (full ? "nota-full" : "")}>
      <style media="print">
        {"@page { size: A4; margin: " +
          content.format.top +
          "mm " +
          content.format.right +
          "mm " +
          content.format.bottom +
          "mm " +
          content.format.left +
          "mm; }"}
      </style>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">NOTA DINAS · VERSI {saved.version}</p>
          <h1>{content.subject || "Nota Dinas Baru"}</h1>
          <Badge>{saved.status}</Badge>
          <p>
            {saved.officialNumber || "Belum bernomor"} · ID internal: {saved.id}
          </p>
        </div>
        <Link className="button" to="/nota-dinas">
          Daftar nota dinas
        </Link>
      </div>
      <div className="panel no-print">
        <div className="toolbar">
          <button
            disabled={!editable || !dirty || saving}
            onClick={() => run(store, "Nota dinas disimpan.")}
          >
            Simpan sekarang
          </button>
          <button
            onClick={() =>
              run(
                async () =>
                  download(
                    await noteDocx(doc, allFiles, demo),
                    "nota-dinas-v" + saved.version + ".docx",
                  ),
                "DOCX diekspor.",
              )
            }
          >
            Ekspor DOCX
          </button>
          <button onClick={print}>Cetak / Simpan sebagai PDF</button>
          <button onClick={() => setFull(!full)}>
            {full ? "Kembali ke editor" : "Pratinjau penuh"}
          </button>
          <button
            onClick={() =>
              run(async () => {
                if (
                  dirty &&
                  !confirm(
                    "Buang perubahan lokal dan muat versi terbaru? Ekspor salinan jika perlu.",
                  )
                )
                  return;
                const n = await db.notes.get(saved.id);
                if (n) {
                  setSaved(n);
                  setContent(structuredClone(n.content));
                  setPending([]);
                  setSaveError("");
                  setReviewers(n.reviewerIds);
                }
              }, "")
            }
          >
            Muat versi terbaru
          </button>
          <button
            onClick={() =>
              download(
                new Blob([JSON.stringify(doc, null, 2)], {
                  type: "application/json",
                }),
                "salinan-konsep-nota.json",
              )
            }
          >
            Unduh salinan isi JSON
          </button>
        </div>
        <p role="status" className={saveError ? "error-text" : "muted"}>
          {saving
            ? "Menyimpan"
            : saveError
              ? "Gagal menyimpan: " + saveError
              : dirty
                ? "Perubahan belum tersimpan"
                : "Tersimpan"}{" "}
          · Simpan terakhir: {timestampLabel(saved.updatedAt)}
        </p>
        {!content.format.verified && (
          <p className="warning">
            Format berdasarkan struktur teks RSAS yang diberikan. Contoh resmi
            belum tersedia; pengguna perlu memeriksa margin, font, kop, dan
            posisi tanda tangan.
          </p>
        )}
        <p className="muted">
          Persetujuan dan peran berjalan sebagai simulasi lokal, bukan tanda
          tangan elektronik tersertifikasi. Nomor dan tanggal konsep tidak
          menyatakan pengesahan.
        </p>
      </div>
      <div
        className="nota-mobile-tabs no-print"
        role="tablist"
        aria-label="Panel nota dinas"
      >
        {["Isi", "Pratinjau"].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            onClick={() => {
              setTab(t);
              localStorage.setItem("rsas-note-tab", t);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className={"nota-columns nota-tab-" + tab}>
        <section className="panel nota-form no-print">
          {!editable && (
            <p className="warning">
              Isi terkunci pada tahap ini atau Anda bukan pembuat. Gunakan “Buat
              revisi” untuk mengubah naskah yang disetujui.
            </p>
          )}
          <h2>Identitas</h2>
          <div className="form-grid">
            <Field label="Unit pembuat nota">
              <select
                disabled={!editable}
                value={content.unitId}
                onChange={(e) => patch({ unitId: e.target.value })}
              >
                {units
                  .filter((u) => u.active || u.id === content.unitId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Jenis nota">
              <select
                disabled={!editable}
                value={content.category}
                onChange={(e) =>
                  patch({ category: e.target.value as NoteContent["category"] })
                }
              >
                {["Permohonan", "Laporan", "Pemberitahuan", "Usulan"].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </Field>
            {(
              [
                ["to", "Kepada"],
                ["from", "Dari"],
                ["subject", "Perihal"],
                ["conceptDate", "Tanggal konsep"],
                ["conceptNumber", "Nomor konsep"],
                ["urgency", "Derajat"],
                ["classification", "Klasifikasi"],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <input
                  disabled={!editable}
                  type={k === "conceptDate" ? "date" : "text"}
                  value={content[k]}
                  onChange={(e) => patch({ [k]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <h2>Template isi</h2>
          <Field label="Ganti template isi">
            <select
              disabled={!editable}
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">Pilih template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <button
            disabled={!editable || !templateId}
            onClick={() =>
              setCandidate(templates.find((t) => t.id === templateId))
            }
          >
            Pratinjau penggantian template
          </button>
          <h2>Isi</h2>
          <p className="muted">
            Format terbatas: **tebal**, _miring_, 1. daftar angka, a. daftar
            huruf, dan tabel | kolom | kolom |. Tempelan Word diubah menjadi
            teks polos; susun kembali tabel melalui tombol Tabel.
          </p>
          <h3>Dasar</h3>
          {content.basis.map((v, i) => (
            <div className="nota-basis" key={i}>
              <Field label={"Dasar " + (i + 1)}>
                <textarea
                  disabled={!editable}
                  value={v}
                  rows={2}
                  onChange={(e) =>
                    patch({
                      basis: content.basis.map((x, j) =>
                        j === i ? e.target.value : x,
                      ),
                    })
                  }
                />
              </Field>
              <button
                disabled={!editable || content.basis.length <= 1}
                onClick={() =>
                  patch({ basis: content.basis.filter((_, j) => j !== i) })
                }
              >
                Hapus dasar {i + 1}
              </button>
            </div>
          ))}
          <button
            disabled={!editable}
            onClick={() => patch({ basis: [...content.basis, ""] })}
          >
            Tambah dasar
          </button>
          {(
            [
              ["opening", "Pembukaan"],
              ["discussion", "Uraian atau pembahasan"],
              ["request", "Permohonan atau rekomendasi"],
              ["closing", "Penutup"],
              ["copies", "Tembusan"],
            ] as const
          ).map(([k, label]) => (
            <RichEditor
              key={k}
              label={label}
              value={content[k]}
              onChange={(v) => patch({ [k]: v })}
              disabled={!editable}
            />
          ))}
          <h2>Penandatangan</h2>
          <SignerFields
            value={content.signer}
            disabled={!editable}
            onChange={(signer) => patch({ signer })}
          />
          <p className="muted">
            Tanggal penandatanganan boleh kosong dalam draf. Untuk memberi
            nomor, petugas harus mengonfirmasi tanggal yang sudah tercantum pada
            versi yang disetujui.
          </p>
          <details>
            <summary>Format dan pola nomor dokumen</summary>
            <FormatFields
              value={content.format}
              onChange={(format) => patch({ format })}
              disabled={!editable}
            />
          </details>
          <h2>Lampiran & tangkapan layar</h2>
          <Field label="Tambah berkas lampiran">
            <input
              disabled={!editable}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx"
              multiple
              onChange={(e) => {
                const selected = Array.from(e.target.files || []);
                e.target.value = "";
                void run(() => fileInput(selected), "");
              }}
            />
          </Field>
          <p className="muted">
            Pilih screenshot dari perangkat. Maksimal 15 MB per berkas, 100
            lampiran. Asli disimpan; crop dan rotasi hanya memengaruhi salinan
            gambar dalam dokumen.
          </p>
          {content.attachments.map((a, i) => (
            <div className="mini-card" key={a.id}>
              <strong>
                Lampiran {i + 1} · {allFiles.find((f) => f.id === a.id)?.name}
              </strong>
              {(["title", "caption", "source"] as const).map((k, j) => (
                <Field
                  key={k}
                  label={
                    ["Judul", "Keterangan", "Sumber opsional"][j] +
                    " lampiran " +
                    (i + 1)
                  }
                >
                  <input
                    disabled={!editable}
                    value={a[k]}
                    onChange={(e) =>
                      patch({
                        attachments: content.attachments.map((x) =>
                          x.id === a.id ? { ...x, [k]: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </Field>
              ))}
              {allFiles
                .find((f) => f.id === a.id)
                ?.type.startsWith("image/") && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={a.inline}
                      onChange={(e) =>
                        patch({
                          attachments: content.attachments.map((x) =>
                            x.id === a.id
                              ? { ...x, inline: e.target.checked }
                              : x,
                          ),
                        })
                      }
                    />{" "}
                    Masukkan gambar pada halaman lanjutan
                  </label>
                  <div className="form-grid">
                    <Field label={"Lebar gambar " + (i + 1) + " (mm)"}>
                      <input
                        type="number"
                        disabled={!editable}
                        min={10}
                        max={180}
                        value={a.width}
                        onChange={(e) =>
                          patch({
                            attachments: content.attachments.map((x) =>
                              x.id === a.id
                                ? { ...x, width: Number(e.target.value) }
                                : x,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label={"Rotasi gambar " + (i + 1)}>
                      <select
                        disabled={!editable}
                        value={a.rotation}
                        onChange={(e) =>
                          patch({
                            attachments: content.attachments.map((x) =>
                              x.id === a.id
                                ? {
                                    ...x,
                                    rotation: Number(
                                      e.target.value,
                                    ) as typeof a.rotation,
                                  }
                                : x,
                            ),
                          })
                        }
                      >
                        {[0, 90, 180, 270].map((v) => (
                          <option key={v} value={v}>
                            {v}°
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <details>
                    <summary>Crop gambar {i + 1} (tindakan manual)</summary>
                    <p>
                      Potong persentase dari tepi gambar asli. Nol
                      mempertahankan seluruh gambar.
                    </p>
                    {(["top", "right", "bottom", "left"] as const).map(
                      (k, j) => (
                        <Field
                          key={k}
                          label={
                            [
                              "Crop atas",
                              "Crop kanan",
                              "Crop bawah",
                              "Crop kiri",
                            ][j] +
                            " gambar " +
                            (i + 1) +
                            " (%)"
                          }
                        >
                          <input
                            disabled={!editable}
                            type="number"
                            min={0}
                            max={40}
                            value={a.crop[k]}
                            onChange={(e) =>
                              patch({
                                attachments: content.attachments.map((x) =>
                                  x.id === a.id
                                    ? {
                                        ...x,
                                        crop: {
                                          ...x.crop,
                                          [k]: Number(e.target.value),
                                        },
                                      }
                                    : x,
                                ),
                              })
                            }
                          />
                        </Field>
                      ),
                    )}
                  </details>
                </>
              )}
              <div className="toolbar">
                <button
                  disabled={!editable || i === 0}
                  onClick={() => {
                    const rows = [...content.attachments];
                    [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
                    patch({ attachments: rows });
                  }}
                >
                  Naikkan lampiran {i + 1}
                </button>
                <button
                  disabled={!editable || i === content.attachments.length - 1}
                  onClick={() => {
                    const rows = [...content.attachments];
                    [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
                    patch({ attachments: rows });
                  }}
                >
                  Turunkan lampiran {i + 1}
                </button>
                <button
                  onClick={() => {
                    const f = allFiles.find((f) => f.id === a.id);
                    if (f) download(f.blob, f.name);
                  }}
                >
                  Unduh asli lampiran {i + 1}
                </button>
                <button
                  disabled={!editable}
                  onClick={() => {
                    patch({
                      attachments: content.attachments.filter(
                        (x) => x.id !== a.id,
                      ),
                    });
                    setPending((p) => p.filter((f) => f.id !== a.id));
                  }}
                >
                  Lepas lampiran {i + 1}
                </button>
              </div>
            </div>
          ))}
          <h2>Hubungan dokumen</h2>
          <Field label="Surat masuk terkait">
            <select
              disabled={!editable}
              value={content.letterId}
              onChange={(e) =>
                patch({
                  letterId: e.target.value,
                  dispositionId: "",
                  taskId: "",
                })
              }
            >
              <option value="">Tanpa surat</option>
              {letters.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.agenda} · {l.subject}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Disposisi terkait">
            <select
              disabled={!editable}
              value={content.dispositionId}
              onChange={(e) =>
                patch({ dispositionId: e.target.value, taskId: "" })
              }
            >
              <option value="">Tanpa disposisi</option>
              {dispositions
                .filter(
                  (d) => !content.letterId || d.letterId === content.letterId,
                )
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id.slice(0, 8)} · {d.notes || d.instructions.join(", ")}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Tugas terkait">
            <select
              disabled={!editable}
              value={content.taskId}
              onChange={(e) => patch({ taskId: e.target.value })}
            >
              <option value="">Tanpa tugas</option>
              {tasks
                .filter(
                  (t) =>
                    (!content.letterId || t.letterId === content.letterId) &&
                    (!content.dispositionId ||
                      t.dispositionId === content.dispositionId),
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.instruction}
                  </option>
                ))}
            </select>
          </Field>
          {content.letterId && (
            <Link to={"/surat-masuk/" + content.letterId}>
              Buka surat sumber
            </Link>
          )}
          <Field label="Berkas kegiatan terkait">
            <select value={bundle} onChange={(e) => setBundle(e.target.value)}>
              <option value="">Pilih berkas kegiatan</option>
              {bundles.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </Field>
          <button
            disabled={!bundle}
            onClick={() =>
              run(
                () => linkToCase(bundle, [{ kind: "notes", id: saved.id }]),
                "Nota ditautkan ke berkas kegiatan.",
              )
            }
          >
            Tautkan nota ke berkas
          </button>
        </section>
        <div
          className="nota-preview"
          ref={previewRef}
          style={
            {
              "--nota-zoom":
                zoom === "fit"
                  ? Math.min(1, previewWidth / 794)
                  : Number(zoom) / 100,
            } as React.CSSProperties
          }
        >
          <div className="no-print">
            <Field label="Zoom pratinjau nota">
              <select value={zoom} onChange={(e) => setZoom(e.target.value)}>
                <option value="fit">Sesuai lebar panel</option>
                {["50", "75", "100", "125"].map((z) => (
                  <option key={z} value={z}>
                    {z}%
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <NotePaper note={doc} files={allFiles} demo={demo} />
        </div>
      </div>
      <section className="panel no-print">
        <h2>Pemeriksaan kelengkapan</h2>
        <p>
          Pemeriksaan isian ini tidak memverifikasi hukum atau kebenaran isi.
        </p>
        <ul className="nota-checklist">
          {checklist.map((x) => (
            <li key={x.label}>
              {x.ok ? "✓" : "✗"} {x.label}
            </li>
          ))}
        </ul>
        {!content.basis.some((x) => x.trim()) && (
          <p className="warning">
            Saran editorial: bagian dasar belum terisi. Cantumkan hanya dasar
            yang benar-benar tersedia.
          </p>
        )}
        <Field label="Urutan pemeriksa nota">
          <select
            multiple
            value={reviewers}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions).map(
                (o) => o.value,
              );
              setReviewers([
                ...reviewers.filter((x) => selected.includes(x)),
                ...selected.filter((x) => !reviewers.includes(x)),
              ]);
            }}
          >
            {users
              .filter(
                (u) =>
                  u.active &&
                  (u.unitId === content.unitId ||
                    ["Admin Sistem", "Kepala RSAU"].includes(u.role)),
              )
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.role}
                </option>
              ))}
          </select>
        </Field>
        <ol>
          {reviewers.map((rid, i) => (
            <li key={rid}>
              {users.find((u) => u.id === rid)?.name}{" "}
              <button
                disabled={i === 0}
                onClick={() =>
                  setReviewers((r) => {
                    const copy = [...r];
                    [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
                    return copy;
                  })
                }
              >
                Dahulukan pemeriksa {i + 1}
              </button>
            </li>
          ))}
        </ol>
        <p>
          Pemeriksa berikutnya:{" "}
          {users.find((u) => u.id === saved.reviewerIds[saved.reviewIndex])
            ?.name ||
            (["Diajukan", "Dalam pemeriksaan"].includes(saved.status)
              ? "Kepala RSAU / admin"
              : "Belum diajukan")}
        </p>
        <div className="form-grid">
          <Field label="Bagian yang diberi catatan">
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
            >
              {[
                "Dokumen",
                "Identitas",
                "Dasar",
                "Pembukaan",
                "Uraian",
                "Permohonan",
                "Penutup",
                "Penandatangan",
                "Lampiran",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Catatan tindakan nota">
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} />
          </Field>
        </div>
        <Field label="Saluran pengiriman manual">
          <input
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="Contoh: diserahkan langsung ke penerima"
          />
        </Field>
        <div className="toolbar">
          {editable && (
            <button
              className="primary"
              disabled={
                !stable || checklist.some((x) => !x.ok) || !reviewers.length
              }
              onClick={() => action("submit")}
            >
              Ajukan pemeriksaan nota
            </button>
          )}
          {["Diajukan", "Dalam pemeriksaan"].includes(saved.status) &&
            (activeReviewer ||
              (approval && saved.reviewIndex === saved.reviewerIds.length)) && (
              <>
                {saved.status === "Diajukan" && (
                  <button disabled={!stable} onClick={() => action("begin")}>
                    Mulai pemeriksaan
                  </button>
                )}
                <button
                  disabled={!stable || !memo.trim()}
                  onClick={() => action("comment")}
                >
                  Simpan catatan bagian
                </button>
                <button
                  disabled={!stable || !memo.trim()}
                  onClick={() => action("return")}
                >
                  Kembalikan untuk perbaikan
                </button>
                {saved.reviewIndex < saved.reviewerIds.length && (
                  <button disabled={!stable} onClick={() => action("review")}>
                    Pemeriksaan selesai
                  </button>
                )}
              </>
            )}
          {saved.status === "Dalam pemeriksaan" &&
            saved.reviewIndex === saved.reviewerIds.length &&
            approval && (
              <button
                className="primary"
                disabled={!stable}
                onClick={() => action("approve")}
              >
                Setujui versi terbaru (simulasi)
              </button>
            )}
          {[
            "Disetujui",
            "Bernomor",
            "Tercatat dikirim",
            "Diajukan",
            "Dalam pemeriksaan",
          ].includes(saved.status) &&
            (saved.authorId === user.id || user.role === "Admin Sistem") && (
              <button
                disabled={!stable || !memo.trim()}
                onClick={() => action("revise")}
              >
                Buat revisi
              </button>
            )}
          {saved.status === "Disetujui" && registrar && (
            <button
              disabled={!stable || !content.signer.date}
              onClick={() => {
                if (
                  confirm(
                    "Berikan nomor resmi untuk versi " +
                      saved.version +
                      " dengan tanggal " +
                      content.signer.date +
                      "?",
                  )
                )
                  void action("number");
              }}
            >
              Beri nomor resmi
            </button>
          )}
          {saved.status === "Bernomor" && registrar && (
            <>
              <button disabled={!stable} onClick={() => action("register")}>
                Daftarkan ke Surat Keluar
              </button>
              <button
                disabled={
                  !stable ||
                  !saved.outgoingId ||
                  !memo.trim() ||
                  !channel.trim()
                }
                onClick={() => action("send")}
              >
                Catat pengiriman manual
              </button>
            </>
          )}
          {["Bernomor", "Tercatat dikirim", "Dibatalkan"].includes(
            saved.status,
          ) &&
            (saved.authorId === user.id || user.role === "Admin Sistem") && (
              <button disabled={!stable} onClick={() => action("archive")}>
                Arsipkan nota
              </button>
            )}
          {!["Diarsipkan", "Dibatalkan"].includes(saved.status) &&
            (saved.authorId === user.id || user.role === "Admin Sistem") && (
              <button
                className="danger"
                disabled={!stable || !memo.trim()}
                onClick={() => {
                  if (
                    confirm(
                      "Batalkan nota dengan alasan yang ditulis? Nomor tetap dicadangkan.",
                    )
                  )
                    void action("cancel");
                }}
              >
                Batalkan dengan alasan
              </button>
            )}
        </div>
        {saved.sentAt && (
          <p>
            Pengiriman manual dicatat pada {timestampLabel(saved.sentAt)}{" "}
            melalui {saved.sentVia}. Catatan ini berasal dari pengguna.
          </p>
        )}
        {saved.cancelledReason && (
          <p>Alasan pembatalan: {saved.cancelledReason}</p>
        )}
      </section>
      <section className="panel no-print" id="riwayat">
        <h2>Riwayat & perbandingan versi</h2>
        <p>
          Setiap simpan isi dan tindakan tahap membuat snapshot. Pemulihan
          membuat versi baru; lampiran asli dan versi lama tetap tersimpan.
        </p>
        <div className="form-grid">
          <Field label="Versi pembanding awal">
            <select
              value={compareA || old?.id || ""}
              onChange={(e) => setCompareA(e.target.value)}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} · {v.reason} · {timestampLabel(v.createdAt)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Versi pembanding akhir">
            <select
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
            >
              <option value="">Isi editor saat ini</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} · {v.reason} · {timestampLabel(v.createdAt)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {old && (
          <>
            <p>
              {diffs.length
                ? diffs.length + " bagian berubah"
                : "Tidak ada perbedaan isi."}
            </p>
            {diffs.map((k) => (
              <details key={k}>
                <summary>{k}</summary>
                <div className="nota-diff">
                  <pre>
                    {JSON.stringify(
                      old.content[k as keyof NoteContent],
                      null,
                      2,
                    )}
                  </pre>
                  <pre>
                    {JSON.stringify(
                      (other?.content || content)[k as keyof NoteContent],
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </details>
            ))}
            <div className="toolbar">
              <button
                disabled={!editable || !stable || !memo.trim()}
                onClick={() =>
                  run(async () => {
                    const n = await restoreNote(
                      saved.id,
                      saved.revision,
                      old.id,
                      user.id,
                      memo,
                    );
                    setSaved(n);
                    setContent(structuredClone(n.content));
                    setMemo("");
                  }, "Versi dipulihkan sebagai versi baru.")
                }
              >
                Pulihkan versi pembanding awal
              </button>
              <button
                onClick={() =>
                  run(async () => {
                    const historical = {
                      ...saved,
                      content: old.content,
                      version: old.version,
                      status: old.status,
                      officialNumber: old.officialNumber,
                    };
                    download(
                      await noteDocx(historical, allFiles, demo),
                      "nota-historis-v" + old.version + ".docx",
                    );
                  }, "DOCX versi historis diekspor.")
                }
              >
                Ekspor DOCX versi pembanding
              </button>
            </div>
          </>
        )}
        {reviews
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((r) => (
            <div className="timeline" key={r.id}>
              <strong>
                {r.action} · v{r.version}
              </strong>
              <p>
                {r.section}: {r.note || "—"}
              </p>
              <small>
                {users.find((u) => u.id === r.userId)?.name} ·{" "}
                {timestampLabel(r.createdAt)}
              </small>
            </div>
          ))}
      </section>
      {candidate && (
        <Modal
          title="Pratinjau perubahan template"
          onClose={() => setCandidate(undefined)}
        >
          <p>{candidate.instructions}</p>
          <p>
            Bagian perihal, dasar, pembukaan, uraian, permohonan, penutup, dan
            jenis akan diganti. Identitas, penandatangan, format, dan lampiran
            tetap mengikuti konsep ini.
          </p>
          <div className="nota-diff">
            <pre>
              {JSON.stringify(
                {
                  subject: content.subject,
                  basis: content.basis,
                  opening: content.opening,
                  discussion: content.discussion,
                  request: content.request,
                  closing: content.closing,
                },
                null,
                2,
              )}
            </pre>
            <pre>{JSON.stringify(candidate.body, null, 2)}</pre>
          </div>
          <button
            className="primary"
            onClick={() => {
              setContent(templateContent(content, candidate));
              setCandidate(undefined);
            }}
          >
            Konfirmasi ganti isi template
          </button>
        </Modal>
      )}
    </div>
  );
}
