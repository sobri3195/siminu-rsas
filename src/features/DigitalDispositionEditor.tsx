import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { useApp } from "../app/context";
import { useUnsavedChanges } from "../app/unsaved";
import type {
  DispositionContent,
  DispositionDraft,
  DigitalRecipient,
} from "../types";
import {
  saveDispositionDraft,
  publishDisposition,
  dispositionWarnings,
  noteSuggestions,
} from "../repositories/digitalDisposition";
import { Field, Modal, Empty } from "../components/common";
import { LocalDocumentPreview } from "../components/LocalDocumentPreview";
import { id, timestampLabel, download } from "../utils";
export function DigitalDispositionEditor() {
  const { id: did = "" } = useParams(),
    draft = useLiveQuery(() => db.dispositionDrafts.get(did), [did]);
  return draft ? (
    <Editor initial={draft} key={draft.id} />
  ) : (
    <Empty text="Draf belum tersedia." />
  );
}
function Editor({ initial }: { initial: DispositionDraft }) {
  const { user, run } = useApp(),
    navigate = useNavigate();
  const [saved, setSaved] = useState(initial),
    [content, setContent] = useState<DispositionContent>(
      structuredClone(initial.content),
    ),
    [reason, setReason] = useState(initial.reason);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    busy = useRef(false);
  const [summary, setSummary] = useState(false),
    [ack, setAck] = useState(false),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(""),
    [kind, setKind] = useState<DigitalRecipient["kind"]>("Utama"),
    [mobile, setMobile] = useState("Disposisi"),
    [fileId, setFileId] = useState("");
  const letter = useLiveQuery(
      () => db.letters.get(content.letterId),
      [content.letterId],
    ),
    files =
      useLiveQuery(
        () => db.attachments.where({ letterId: content.letterId }).toArray(),
        [content.letterId],
      ) || [];
  const users = useLiveQuery(() => db.users.toArray()) || [],
    units = useLiveQuery(() => db.units.toArray()) || [],
    positions = useLiveQuery(() => db.positions.toArray()) || [],
    catalogs =
      useLiveQuery(() =>
        db.catalogs.where({ category: "instruction" }).toArray(),
      ) || [];
  const dirty =
      JSON.stringify(content) !== JSON.stringify(saved.content) ||
      reason !== saved.reason,
    locked =
      !!saved.publishedId ||
      (saved.authorId !== user.id && user.role !== "Admin Sistem");
  useUnsavedChanges(dirty, true);
  const patch = (p: Partial<DispositionContent>) => {
    setAck(false);
    setContent((c) => ({ ...c, ...p }));
  };
  const store = async () => {
    if (busy.current) throw Error("Tunggu penyimpanan selesai.");
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const d = await saveDispositionDraft(
        saved.id,
        saved.revision,
        content,
        reason,
        user.id,
      );
      setSaved(d);
      return d;
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  useEffect(() => {
    if (!dirty || saving || error || locked) return;
    const timer = setTimeout(() => void store().catch(() => {}), 900);
    return () => clearTimeout(timer);
  }, [content, reason, dirty, saving, error, locked, saved.revision]);
  const add = () => {
    const u = users.find((u) => u.id === selected),
      unit = units.find((x) => x.id === u?.unitId);
    if (!u || !unit) return;
    if (content.recipients.some((r) => r.userId === u.id)) {
      setError(
        "Penerima sudah dipilih. Ubah perannya pada baris yang tersedia.",
      );
      return;
    }
    const p = positions.find(
      (p) => p.unitId === unit.id && p.userId === u.id && p.active !== false,
    );
    patch({
      recipients: [
        ...content.recipients,
        {
          id: id(),
          unitId: unit.id,
          unitName: unit.name,
          userId: u.id,
          userName: u.name,
          positionId: p?.id || "",
          positionName: p?.name || "",
          assignmentStart: p?.assignmentStart || "",
          assignmentEnd: p?.assignmentEnd || "",
          kind: content.mode === "Untuk diketahui" ? "Tembusan" : kind,
          instruction:
            content.mode === "Untuk diketahui" || kind === "Tembusan"
              ? "Untuk diketahui"
              : content.instructions.join(", "),
          deadline: content.deadline,
        },
      ],
    });
    setSelected("");
  };
  const warnings = dispositionWarnings(content),
    file = files.find((f) => f.id === (fileId || files[0]?.id));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {saved.sourceId ? "REVISI DISPOSISI" : "DRAF ARAHAN"}
          </p>
          <h1>{letter?.subject || "Disposisi Digital"}</h1>
          <p>ID draf: {saved.id}</p>
        </div>
        <Link className="button" to="/disposisi">
          Pusat disposisi
        </Link>
      </div>
      <div className="panel">
        <div className="toolbar">
          <button
            disabled={locked || !dirty || saving}
            onClick={() => run(store, "Draf arahan disimpan.")}
          >
            Simpan draf arahan
          </button>
          {!locked && (
            <Link className="button" to={"/cetak-disposisi/draf/" + saved.id}>
              Cetak draf tersimpan
            </Link>
          )}
          <button
            disabled={locked || saving}
            className="primary"
            onClick={() => setSummary(true)}
          >
            Tinjau penerbitan
          </button>
          <button
            onClick={() =>
              download(
                new Blob([JSON.stringify({ content, reason }, null, 2)], {
                  type: "application/json",
                }),
                "salinan-draf-disposisi.json",
              )
            }
          >
            Unduh salinan input
          </button>
          <button
            onClick={() =>
              run(async () => {
                if (
                  dirty &&
                  !confirm("Buang perubahan lokal dan muat draf terbaru?")
                )
                  return;
                const d = await db.dispositionDrafts.get(saved.id);
                if (d) {
                  setSaved(d);
                  setContent(structuredClone(d.content));
                  setReason(d.reason);
                  setError("");
                }
              }, "")
            }
          >
            Muat draf terbaru
          </button>
        </div>
        <p role="status">
          {saving
            ? "Menyimpan"
            : error
              ? "Gagal menyimpan: " + error
              : dirty
                ? "Perubahan belum tersimpan"
                : "Tersimpan"}{" "}
          · {timestampLabel(saved.updatedAt)}
        </p>
        {locked && (
          <p>
            Draf sudah diterbitkan atau milik pengguna lain.{" "}
            {saved.publishedId && (
              <Link to={"/disposisi/" + saved.publishedId}>
                Buka disposisi terbit
              </Link>
            )}
          </p>
        )}
      </div>
      <div
        className="digital-mobile-tabs"
        role="tablist"
        aria-label="Panel arahan"
      >
        {["Dokumen", "Disposisi"].map((t) => (
          <button
            role="tab"
            key={t}
            aria-selected={mobile === t}
            onClick={() => setMobile(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className={"digital-columns digital-tab-" + mobile}>
        <section className="panel digital-document">
          <h2>Dokumen sumber</h2>
          <Field label="Lampiran sumber">
            <select
              value={fileId || files[0]?.id || ""}
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
            <Empty text="Surat belum memiliki lampiran. Identitas tetap dapat dibaca." />
          )}
          <Link to={"/surat-masuk/" + content.letterId}>
            Buka identitas surat masuk
          </Link>
        </section>
        <section className="panel digital-directions">
          <h2>Arahan</h2>
          <div className="form-grid">
            <Field label="Surat sumber">
              <input
                disabled
                value={(letter?.agenda || "") + " · " + (letter?.number || "")}
              />
            </Field>
            <Field label="Pemberi disposisi">
              <input disabled value={content.giver} />
            </Field>
            <Field label="Jabatan pemberi">
              <input disabled value={content.giverPosition} />
            </Field>
            <Field label="Jenis arahan">
              <select
                disabled={locked}
                value={content.mode}
                onChange={(e) =>
                  patch(
                    e.target.value === "Untuk diketahui"
                      ? {
                          mode: "Untuk diketahui",
                          instructions: ["Untuk diketahui"],
                          reportRequired: false,
                          review: false,
                          recipients: content.recipients.map((r) => ({
                            ...r,
                            kind: "Tembusan",
                            instruction: "Untuk diketahui",
                          })),
                        }
                      : {
                          mode: "Penugasan",
                          reportRequired: true,
                          review: true,
                        },
                  )
                }
              >
                <option>Penugasan</option>
                <option>Untuk diketahui</option>
              </select>
            </Field>
            <Field label="Tenggat umum">
              <input
                disabled={locked}
                type="date"
                value={content.deadline}
                onChange={(e) => patch({ deadline: e.target.value })}
              />
            </Field>
            <Field label="Pemeriksa hasil">
              <select
                disabled={locked}
                value={content.reviewerId}
                onChange={(e) => patch({ reviewerId: e.target.value })}
              >
                <option value="">Pilih pemeriksa</option>
                {users
                  .filter(
                    (u) =>
                      u.active &&
                      ["Admin Sistem", "Kepala RSAU", "Kepala Unit"].includes(
                        u.role,
                      ),
                  )
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.role}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <p className="muted">
            Tanggal/waktu terbit dicatat saat konfirmasi penerbitan. Tenggat
            tanggal berlaku sampai akhir hari pada zona waktu aplikasi. Kosong
            berarti tanpa tenggat.
          </p>
          <label>
            <input
              disabled={locked}
              type="checkbox"
              checked={content.reportRequired}
              onChange={(e) => patch({ reportRequired: e.target.checked })}
            />{" "}
            Wajib laporan hasil
          </label>
          <br />
          <label>
            <input
              disabled={locked}
              type="checkbox"
              checked={content.review}
              onChange={(e) => patch({ review: e.target.checked })}
            />{" "}
            Hasil/penyelesaian wajib diperiksa
          </label>
          <h3>Instruksi umum</h3>
          <div className="digital-instructions">
            {catalogs
              .filter((c) => c.active)
              .sort((a, b) => a.order - b.order)
              .map((i) => (
                <label key={i.id}>
                  <input
                    disabled={locked}
                    type="checkbox"
                    checked={content.instructions.includes(i.name)}
                    onChange={(e) =>
                      patch({
                        instructions: e.target.checked
                          ? [...content.instructions, i.name]
                          : content.instructions.filter((x) => x !== i.name),
                      })
                    }
                  />
                  {i.name}
                </label>
              ))}
          </div>
          <Field label="Template catatan">
            <select
              disabled={locked}
              value=""
              onChange={(e) => patch({ notes: e.target.value })}
            >
              <option value="">Salin contoh catatan yang dapat diedit</option>
              {noteSuggestions.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Catatan arahan">
            <textarea
              disabled={locked}
              rows={4}
              value={content.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </Field>
          <h3>Penerima</h3>
          <Field label="Cari unit, jabatan, atau pengguna">
            <input
              disabled={locked}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label="Pilih penerima digital">
            <select
              disabled={locked}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Pilih pengguna aktif</option>
              {users
                .filter(
                  (u) =>
                    u.active &&
                    units.some((x) => x.id === u.unitId && x.active) &&
                    [
                      u.name,
                      units.find((x) => x.id === u.unitId)?.name,
                      ...positions
                        .filter((p) => p.userId === u.id)
                        .map((p) => p.name),
                    ]
                      .join(" ")
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {units.find((x) => x.id === u.unitId)?.name} · {u.name} ·{" "}
                    {u.role}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Peran penerima baru">
            <select
              disabled={locked || content.mode === "Untuk diketahui"}
              value={content.mode === "Untuk diketahui" ? "Tembusan" : kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option>Utama</option>
              <option>Pendukung</option>
              <option>Tembusan</option>
            </select>
          </Field>
          <button disabled={locked || !selected} onClick={add}>
            Tambahkan penerima
          </button>
          <div className="toolbar">
            <button
              disabled={locked}
              onClick={() =>
                patch({
                  recipients: content.recipients.map((r) => ({
                    ...r,
                    instruction:
                      r.kind === "Tembusan"
                        ? "Untuk diketahui"
                        : content.instructions.join(", "),
                  })),
                })
              }
            >
              Salin instruksi umum ke penerima
            </button>
            <button
              disabled={locked}
              onClick={() =>
                patch({
                  recipients: content.recipients.map((r) => ({
                    ...r,
                    deadline: content.deadline,
                  })),
                })
              }
            >
              Terapkan tenggat umum ke penerima
            </button>
          </div>
          {content.recipients.map((r, i) => (
            <div
              className="mini-card"
              key={r.id}
              data-testid={"recipient-" + r.userId}
            >
              <strong>
                {r.unitName} · {r.userName}
              </strong>
              <div className="form-grid">
                <Field label={"Peran penerima " + (i + 1)}>
                  <select
                    disabled={locked}
                    value={r.kind}
                    onChange={(e) =>
                      patch({
                        recipients: content.recipients.map((x) =>
                          x.id === r.id
                            ? {
                                ...x,
                                kind: e.target.value as typeof r.kind,
                                instruction:
                                  e.target.value === "Tembusan"
                                    ? "Untuk diketahui"
                                    : x.instruction,
                              }
                            : x,
                        ),
                      })
                    }
                  >
                    <option>Utama</option>
                    <option>Pendukung</option>
                    <option>Tembusan</option>
                  </select>
                </Field>
                <Field label={"Jabatan penerima " + (i + 1)}>
                  <select
                    disabled={locked}
                    value={r.positionId}
                    onChange={(e) =>
                      patch({
                        recipients: content.recipients.map((x) =>
                          x.id === r.id
                            ? { ...x, positionId: e.target.value }
                            : x,
                        ),
                      })
                    }
                  >
                    <option value="">Tanpa jabatan</option>
                    {positions
                      .filter(
                        (p) =>
                          p.active !== false &&
                          p.unitId === r.unitId &&
                          (!p.userId || p.userId === r.userId),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.assignmentStart || "awal tidak diatur"}{" "}
                          s.d. {p.assignmentEnd || "akhir tidak diatur"}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
              <Field label={"Instruksi penerima " + (i + 1)}>
                <textarea
                  disabled={locked}
                  value={r.instruction}
                  onChange={(e) =>
                    patch({
                      recipients: content.recipients.map((x) =>
                        x.id === r.id
                          ? { ...x, instruction: e.target.value }
                          : x,
                      ),
                    })
                  }
                />
              </Field>
              <Field label={"Tenggat penerima " + (i + 1)}>
                <input
                  type="date"
                  disabled={locked}
                  value={r.deadline}
                  onChange={(e) =>
                    patch({
                      recipients: content.recipients.map((x) =>
                        x.id === r.id ? { ...x, deadline: e.target.value } : x,
                      ),
                    })
                  }
                />
              </Field>
              <button
                disabled={locked}
                onClick={() =>
                  patch({
                    recipients: content.recipients.filter((x) => x.id !== r.id),
                  })
                }
              >
                Lepas penerima {i + 1}
              </button>
            </div>
          ))}
          {saved.sourceId && (
            <Field label="Alasan revisi disposisi">
              <textarea
                disabled={locked}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
          <p className="muted">
            Menghapus penerima membatalkan tugas terbukanya, tanpa menghapus
            laporan. Perubahan instruksi material meminta konfirmasi ulang.
            Kewajiban yang telah selesai tidak diubah menjadi pekerjaan baru
            secara diam-diam.
          </p>
        </section>
      </div>
      {summary && (
        <Modal
          title="Ringkasan sebelum penerbitan"
          onClose={() => !saving && setSummary(false)}
        >
          <p>
            {content.giver} · {content.giverPosition} · {content.mode}
          </p>
          <p>
            {content.instructions.join(", ")} · {content.notes}
          </p>
          <ul>
            {content.recipients.map((r) => (
              <li key={r.id}>
                {r.unitName} / {r.userName} ({r.kind}): {r.instruction};{" "}
                {r.deadline || "Tanpa tenggat"}
              </li>
            ))}
          </ul>
          <p>
            Laporan:{" "}
            {content.reportRequired ? "wajib" : "boleh konfirmasi penyelesaian"}{" "}
            · Pemeriksaan: {content.review ? "wajib" : "tanpa pemeriksaan"}
          </p>
          {saved.sourceId && (
            <p>
              Revisi sumber versi revisi {saved.sourceRevision}. Alasan:{" "}
              {reason || "BELUM DIISI"}
            </p>
          )}
          {warnings.length > 0 && (
            <>
              <ul className="warning">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <label>
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />{" "}
                Saya telah meninjau peringatan instruksi
              </label>
            </>
          )}
          <p>
            Penerbitan dan pembuatan tugas disimpan dalam satu transaksi.
            Tembusan hanya menerima informasi.
          </p>
          <button
            className="primary"
            disabled={
              dirty || saving || !!error || (warnings.length > 0 && !ack)
            }
            onClick={() =>
              run(async () => {
                setSaving(true);
                try {
                  const d = await publishDisposition(
                    saved.id,
                    saved.revision,
                    user.id,
                    ack,
                  );
                  setSaved({ ...saved, publishedId: d.id });
                  setSummary(false);
                  navigate("/disposisi/" + d.id);
                } finally {
                  setSaving(false);
                }
              }, "Disposisi diterbitkan.")
            }
          >
            Konfirmasi terbitkan disposisi
          </button>
        </Modal>
      )}
    </>
  );
}
