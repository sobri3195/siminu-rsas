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
import { dateLabel, download, now } from "../utils";
import type { OfficialDraft, DraftContent, DraftTemplate } from "../types";
const labels: Record<keyof DraftContent, string> = {
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
      <div className="page-heading">
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
                );
                navigate("/naskah/" + d.id);
              }, "Draf naskah dibuat.")
            }
          >
            Buat naskah
          </button>
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
                  value={edit.content[k]}
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
  return d ? (
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
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [note, setNote] = useState("");
  const [reviewers, setReviewers] = useState<string[]>(original.reviewerIds);
  const [candidate, setCandidate] = useState("");
  const [compare, setCompare] = useState<number>();
  const numberedHistory=useLiveQuery(()=>db.outgoing.filter(o=>o.draftId===original.id).toArray(),[original.id])||[];
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
    if (!dirty || saving || error) return;
    const timer = setTimeout(
      () => void commit().catch((e) => setError(String(e))),
      1000,
    );
    return () => clearTimeout(timer);
  }, [content, dirty, saving]);
  const act = (action: Parameters<typeof draftAction>[2]) =>
    run(async () => {
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
      setContent(next.content);
      setNote("");
    }, "Keputusan naskah disimpan untuk versi yang ditampilkan.");
  const canReview =
    user.role === "Admin Sistem" ||
    current.reviewerIds[current.reviewIndex] === user.id;
  const canApprove = ["Admin Sistem", "Kepala RSAU"].includes(user.role);
  return (
    <>
      <div className="page-heading">
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
          <button onClick={() => setPreview(!preview)}>
            {preview ? "Kembali ke editor" : "Pratinjau A4"}
          </button>
          <button
            onClick={() =>
              run(async () => {
                const d = dirty ? await commit() : saved;
                download(
                  await draftDocx(d.kind, d.content, d.templateOfficial),
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
          <p className="warning">
            Template generik — belum diverifikasi sebagai format resmi RSAS.
          </p>
        )}
        {preview ? (
          <DraftPaper
            kind={current.kind}
            content={content}
            official={!!current.templateOfficial}
          />
        ) : (
          <div className="grid2 no-print">
            {(Object.keys(labels) as (keyof DraftContent)[]).map((k) => (
              <Field key={k} label={labels[k]}>
                {["heading", "basis", "body", "closing", "copies"].includes(
                  k,
                ) ? (
                  <textarea
                    value={content[k]}
                    onChange={(e) =>
                      setContent({ ...content, [k]: e.target.value })
                    }
                  />
                ) : (
                  <input
                    disabled={k === "number"}
                    type={k === "date" ? "date" : "text"}
                    value={content[k]}
                    onChange={(e) =>
                      setContent({ ...content, [k]: e.target.value })
                    }
                  />
                )}
              </Field>
            ))}
            <Field label="Sisipkan nama unit pada tujuan">
              <select
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
        )}
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
          <Field label="Catatan koreksi / keputusan / pemulihan">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="toolbar">
            {["Draf", "Perbaikan"].includes(current.stage) && (
              <button
                className="primary"
                disabled={saving || !reviewers.length}
                onClick={() => act("submit")}
              >
                Ajukan pemeriksaan
              </button>
            )}
            {current.stage === "Pemeriksaan" && canReview && (
              <button className="primary" onClick={() => act("review")}>
                Paraf simulasi versi {current.version}
              </button>
            )}
            {["Pemeriksaan", "Persetujuan"].includes(current.stage) &&
              (canReview || canApprove) && (
                <button disabled={!note.trim()} onClick={() => act("return")}>
                  Kembalikan untuk perbaikan
                </button>
              )}
            {current.stage === "Persetujuan" && canApprove && (
              <button className="primary" onClick={() => act("approve")}>
                Setujui simulasi versi {current.version}
              </button>
            )}
            {current.stage === "Penomoran" &&
              ["Admin Sistem", "Petugas Urtu/Administrasi"].includes(
                user.role,
              ) && (
                <button className="primary" onClick={() => act("number")}>
                  Terbitkan nomor
                </button>
              )}
            {current.outgoingId && (
              <Link className="button" to="/surat-keluar">
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
              {d.note}
            </p>
          ))}
        </div>
      </section>
      {compare !== undefined && (
        <Modal
          title={`Perbandingan v${compare} → v${current.version}`}
          onClose={() => setCompare(undefined)}
        >
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
}: {
  kind: string;
  content: DraftContent;
  official?: boolean;
}) {
  return (
    <article className="print-sheet document-paper">
      <header style={{ whiteSpace: "pre-wrap" }}>{c.heading}</header>
      <h1>{kind.toUpperCase()}</h1>
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
      <h3>Dasar</h3>
      <p>{c.basis}</p>
      <p>{c.body}</p>
      <p>{c.closing}</p>
      <div className="signature">
        <div className="signature-space" />
        {c.signer}
      </div>
      <h3>Tembusan</h3>
      <p>{c.copies}</p>
    </article>
  );
}
