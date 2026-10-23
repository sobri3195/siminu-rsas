import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { Field, Modal } from "../components/common";
import { LocalDocumentPreview } from "../components/LocalDocumentPreview";
import {
  changeDraftAttachment,
  updateDraftLinks,
  addReviewComment,
  duplicateMail,
  reviseMail,
} from "../repositories/mail";
import { useApp } from "../app/context";
import { useNavigate } from "react-router-dom";
import { download, timestampLabel } from "../utils";
import type { OfficialDraft, Attachment } from "../types";
export function MailDraftTools({
  draft: d,
  accept,
  disabled,
}: {
  draft: OfficialDraft;
  accept: (d: OfficialDraft) => void;
  disabled: boolean;
}) {
  const { user, run } = useApp(),
    navigate = useNavigate();
  const letters = useLiveQuery(() => db.letters.toArray()) || [],
    files =
      useLiveQuery(
        () => db.attachments.where({ letterId: d.id }).toArray(),
        [d.id],
      ) || [];
  const [preview, setPreview] = useState<Attachment>(),
    [meta, setMeta] = useState<Attachment>(),
    [reason, setReason] = useState(""),
    [section, setSection] = useState("Isi");
  const locked = ["Pengiriman", "Tercatat dikirim", "Diarsipkan"].includes(
      d.stage,
    ),
    edit = !disabled && ["Draf", "Perbaikan"].includes(d.stage);
  return (
    <section className="panel no-print">
      <h2>Referensi dan lampiran</h2>
      <p>
        Pilih setiap sumber secara eksplisit. Melepas hubungan mempertahankan
        dokumen sumber.
      </p>
      <fieldset disabled={disabled || locked}>
        <legend>Surat referensi berdasarkan ID</legend>
        {letters.map((l) => (
          <label className="check" key={l.id}>
            <input
              type="checkbox"
              checked={d.incomingIds?.includes(l.id) || false}
              onChange={(e) =>
                run(
                  async () =>
                    accept(
                      await updateDraftLinks(
                        d.id,
                        d.revision,
                        e.target.checked
                          ? [...(d.incomingIds || []), l.id]
                          : (d.incomingIds || []).filter((x) => x !== l.id),
                        user.id,
                      ),
                    ),
                  "Referensi surat disimpan.",
                )
              }
            />
            {l.number} — {l.subject}
          </label>
        ))}
      </fieldset>
      <Field label="Tambahkan lampiran balasan">
        <input
          type="file"
          multiple
          disabled={!edit}
          onChange={(e) => {
            const selected = Array.from(e.target.files || []);
            void run(
              async () =>
                accept(
                  await changeDraftAttachment(
                    d.id,
                    d.revision,
                    user.id,
                    selected,
                  ),
                ),
              "Lampiran tersimpan.",
            );
            e.target.value = "";
          }}
        />
      </Field>
      <p>
        Batas 20 MB per berkas. PDF/gambar dapat dipratinjau; format lain
        diunduh. Berkas lama dipertahankan saat penggantian.
      </p>
      {d.attachmentIds.map((aid, index) => {
        const f = files.find((f) => f.id === aid);
        return f ? (
          <article className="mini-card" key={aid}>
            <strong>
              {index + 1}. {f.title || f.name}
            </strong>
            <small>
              {f.name} · {Math.ceil(f.blob.size / 1024)} KB ·{" "}
              {f.type || "Berkas"} ·{" "}
              {f.addedAt
                ? timestampLabel(f.addedAt)
                : "Waktu lama belum dicatat"}
            </small>
            <p>{f.caption}</p>
            <button onClick={() => setPreview(f)}>Pratinjau lampiran</button>
            <button onClick={() => download(f.blob, f.name)}>
              Unduh lampiran asli
            </button>
            <button
              disabled={!edit}
              onClick={() => setMeta({ ...f, order: index })}
            >
              Judul, caption, urutan
            </button>
            <Field label={"Ganti berkas " + f.name}>
              <input
                type="file"
                disabled={!edit}
                onChange={(e) => {
                  const selected = Array.from(e.target.files || []);
                  void run(
                    async () =>
                      accept(
                        await changeDraftAttachment(
                          d.id,
                          d.revision,
                          user.id,
                          selected,
                          aid,
                        ),
                      ),
                    "Berkas diganti; versi sebelumnya tetap tersedia.",
                  );
                  e.target.value = "";
                }}
              />
            </Field>
          </article>
        ) : (
          <p className="error" key={aid}>
            Lampiran hilang: {aid}
          </p>
        );
      })}
      <details>
        <summary>Riwayat berkas yang diganti</summary>
        {files
          .filter((f) => !d.attachmentIds.includes(f.id))
          .map((f) => (
            <button key={f.id} onClick={() => download(f.blob, f.name)}>
              Unduh versi lama {f.name}
            </button>
          ))}
      </details>
      <h2>Catatan per bagian dan revisi</h2>
      <Field label="Bagian yang diperiksa">
        <input value={section} onChange={(e) => setSection(e.target.value)} />
      </Field>
      <Field label="Catatan bagian / alasan revisi terbit">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="toolbar">
        <button
          disabled={disabled || !reason.trim()}
          onClick={() =>
            run(
              () =>
                addReviewComment(d.id, d.revision, user.id, section, reason),
              "Catatan pemeriksaan disimpan.",
            )
          }
        >
          Simpan catatan bagian
        </button>
        {d.integrated &&
          ["Pengiriman", "Tercatat dikirim"].includes(d.stage) && (
            <button
              disabled={disabled || !reason.trim()}
              onClick={() =>
                run(
                  async () =>
                    accept(await reviseMail(d.id, d.revision, user.id, reason)),
                  "Versi revisi baru dibuat. Nomor dan surat keluar lama tetap tersimpan.",
                )
              }
            >
              Buat revisi surat terbit
            </button>
          )}
        <button
          disabled={disabled}
          onClick={() =>
            run(async () => {
              const copy = await duplicateMail(d.id, user.id);
              navigate("/naskah/" + copy.id);
            }, "Duplikasi konsep baru dibuat.")
          }
        >
          Duplikasi sebagai konsep baru
        </button>
      </div>
      {preview && (
        <Modal
          title="Pratinjau lampiran lokal"
          onClose={() => setPreview(undefined)}
        >
          <LocalDocumentPreview file={preview} />
        </Modal>
      )}
      {meta && (
        <Modal
          title="Identitas dan urutan lampiran"
          onClose={() => setMeta(undefined)}
        >
          <Field label="Judul lampiran">
            <input
              value={meta.title || ""}
              onChange={(e) => setMeta({ ...meta, title: e.target.value })}
            />
          </Field>
          <Field label="Caption lampiran">
            <textarea
              value={meta.caption || ""}
              onChange={(e) => setMeta({ ...meta, caption: e.target.value })}
            />
          </Field>
          <Field label="Urutan lampiran (mulai 1)">
            <input
              type="number"
              min="1"
              max={d.attachmentIds.length}
              value={(meta.order || 0) + 1}
              onChange={(e) =>
                setMeta({ ...meta, order: Number(e.target.value) - 1 })
              }
            />
          </Field>
          <button
            onClick={() =>
              run(async () => {
                accept(
                  await changeDraftAttachment(
                    d.id,
                    d.revision,
                    user.id,
                    [],
                    "",
                    {
                      id: meta.id,
                      title: meta.title || "",
                      caption: meta.caption || "",
                      order: meta.order || 0,
                    },
                  ),
                );
                setMeta(undefined);
              }, "Identitas lampiran disimpan.")
            }
          >
            Simpan identitas lampiran
          </button>
        </Modal>
      )}
    </section>
  );
}
