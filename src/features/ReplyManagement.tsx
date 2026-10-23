import { archive } from "../repositories/workflow";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { useApp } from "../app/context";
import { Field, Modal, Badge, Empty } from "../components/common";
import {
  createReplyDraft,
  setReplyAssignment,
  replyStage,
  linkFollowup,
} from "../repositories/mail";
import { id, dateLabel, timestampLabel, download } from "../utils";
import type { ReplyAssignment } from "../types";
export function ReplyActions({ letterId }: { letterId: string }) {
  const { user, run } = useApp(),
    navigate = useNavigate();
  const l = useLiveQuery(() => db.letters.get(letterId), [letterId]);
  const a = useLiveQuery(() => db.replyAssignments.get(letterId), [letterId]);
  const drafts = useLiveQuery(() => db.drafts.toArray()) || [],
    templates = useLiveQuery(() => db.templates.toArray()) || [];
  const users = useLiveQuery(() => db.users.toArray()) || [],
    units = useLiveQuery(() => db.units.toArray()) || [];
  const files =
    useLiveQuery(
      () => db.attachments.where({ letterId }).toArray(),
      [letterId],
    ) || [];
  const [edit, setEdit] = useState<ReplyAssignment>(),
    [open, setOpen] = useState(false),
    [template, setTemplate] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [additional, setAdditional] = useState(false),
    [busy, setBusy] = useState(false);
  const request = useRef(id()),
    lock = useRef(false);
  const active = drafts.filter(
    (d) =>
      d.incomingIds?.includes(letterId) &&
      !["Diarsipkan", "Tercatat dikirim"].includes(d.stage),
  );
  const admin = ["Admin Sistem", "Petugas Urtu/Administrasi"].includes(
    user.role,
  );
  if (!l) return null;
  return (
    <section className="panel reply-panel">
      <div className="toolbar">
        <div>
          <h2>Kebutuhan balasan</h2>
          <Badge>{a?.decision || "Perlu penilaian"}</Badge>
        </div>
        <button
          className="primary"
          onClick={() => {
            request.current = id();
            setAdditional(false);
            setOpen(true);
          }}
        >
          Buat Balasan
        </button>
        <Link className="button" to={"/rangkaian/" + letterId}>
          Rangkaian surat
        </Link>
        {admin && l.status !== "Diarsipkan" && (
          <button
            onClick={() =>
              run(
                () => archive(letterId, user.name),
                "Surat masuk diarsipkan setelah kewajiban selesai.",
              )
            }
          >
            Arsipkan sumber rangkaian
          </button>
        )}
        {admin && (
          <button
            onClick={() =>
              setEdit(
                a || {
                  id: letterId,
                  decision: "Perlu penilaian",
                  picId: "",
                  picName: "",
                  unitId: l.targetUnitId || user.unitId,
                  unitName: "",
                  deadline: "",
                  instructions: "",
                  reviewerId: "",
                  reason: "",
                  revision: 0,
                  updatedAt: "",
                  userId: user.id,
                },
              )
            }
          >
            Nilai kebutuhan balasan
          </button>
        )}
      </div>
      {a?.decision === "Perlu balasan" && (
        <p>
          PIC: {a.picName} · {a.unitName} · Tenggat {dateLabel(a.deadline)}
          <br />
          {a.instructions}
          <small>Sumber/alasan: {a.reason}</small>
        </p>
      )}
      {edit && (
        <Modal
          title="Penetapan kebutuhan balasan"
          onClose={() => setEdit(undefined)}
        >
          <Field label="Keputusan balasan">
            <select
              value={edit.decision}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  decision: e.target.value as ReplyAssignment["decision"],
                })
              }
            >
              {["Perlu penilaian", "Perlu balasan", "Tidak perlu balasan"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </Field>
          {edit.decision === "Perlu balasan" && (
            <>
              <Field label="Unit penanggung jawab">
                <select
                  value={edit.unitId}
                  onChange={(e) =>
                    setEdit({ ...edit, unitId: e.target.value, picId: "" })
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
              <Field label="PIC penyusun">
                <select
                  value={edit.picId}
                  onChange={(e) => setEdit({ ...edit, picId: e.target.value })}
                >
                  <option value="">Pilih PIC</option>
                  {users
                    .filter((u) => u.active && u.unitId === edit.unitId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Tenggat balasan">
                <input
                  type="date"
                  value={edit.deadline}
                  onChange={(e) =>
                    setEdit({ ...edit, deadline: e.target.value })
                  }
                />
              </Field>
              <Field label="Arahan penyusunan">
                <textarea
                  value={edit.instructions}
                  onChange={(e) =>
                    setEdit({ ...edit, instructions: e.target.value })
                  }
                />
              </Field>
              <Field label="Pemeriksa balasan">
                <select
                  value={edit.reviewerId}
                  onChange={(e) =>
                    setEdit({ ...edit, reviewerId: e.target.value })
                  }
                >
                  <option value="">Pilih pemeriksa</option>
                  {users
                    .filter((u) => u.active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </Field>
            </>
          )}
          <Field label="Alasan / sumber penugasan atau penutupan">
            <textarea
              value={edit.reason}
              onChange={(e) => setEdit({ ...edit, reason: e.target.value })}
            />
          </Field>
          <p>
            Penutupan tanpa balasan menyimpan alasan dan riwayat. Konsep serta
            surat sumber tetap tersedia.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                setBusy(true);
                try {
                  await setReplyAssignment(edit, edit.revision, user.id);
                  setEdit(undefined);
                } finally {
                  setBusy(false);
                }
              }, "Penilaian balasan disimpan.")
            }
          >
            Simpan penilaian
          </button>
        </Modal>
      )}
      {open && (
        <Modal
          title="Buat balasan dari surat sumber"
          onClose={() => setOpen(false)}
        >
          {active.length > 0 && !additional ? (
            <>
              <p>
                Sudah ada konsep aktif. Lanjutkan salah satunya atau buat
                balasan tambahan secara sengaja.
              </p>
              {active.map((d) => (
                <Link className="button" key={d.id} to={"/naskah/" + d.id}>
                  Lanjutkan Konsep — {d.content.subject}
                </Link>
              ))}
              <button onClick={() => setAdditional(true)}>
                Buat Balasan Tambahan
              </button>
            </>
          ) : (
            <>
              <Field label="Jenis dan template balasan">
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
              <p>
                Calon tujuan: <strong>{l.sender}</strong>. Periksa kembali
                tujuan di editor.
              </p>
              <p>
                Referensi: {l.number} · {dateLabel(l.date)} · {l.subject}
              </p>
              <p>Lampiran surat awal tidak ikut disalin kecuali dipilih:</p>
              {files.map((f) => (
                <label className="check" key={f.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(f.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, f.id]
                          : selected.filter((x) => x !== f.id),
                      )
                    }
                  />
                  {f.name}
                </label>
              ))}
              <button
                className="primary"
                disabled={busy || !templates.length}
                onClick={() => {
                  if (lock.current) return;
                  lock.current = true;
                  setBusy(true);
                  void run(async () => {
                    try {
                      const d = await createReplyDraft(
                        letterId,
                        template || templates[0].id,
                        user.id,
                        additional,
                        request.current,
                        selected,
                      );
                      setOpen(false);
                      navigate("/naskah/" + d.id);
                    } finally {
                      lock.current = false;
                      setBusy(false);
                    }
                  }, "Konsep balasan disimpan.");
                }}
              >
                Simpan konsep balasan
              </button>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
export function MailThread() {
  const { id: lid = "" } = useParams(),
    { user, run } = useApp();
  const letters = useLiveQuery(() => db.letters.toArray()) || [],
    drafts = useLiveQuery(() => db.drafts.toArray()) || [],
    outs = useLiveQuery(() => db.outgoing.toArray()) || [],
    ds = useLiveQuery(() => db.dispositions.toArray()) || [],
    decisions = useLiveQuery(() => db.draftDecisions.toArray()) || [],
    dispatches = useLiveQuery(() => db.dispatches.toArray()) || [],
    targets = useLiveQuery(() => db.dispatchTargets.toArray()) || [],
    logs = useLiveQuery(() => db.activities.toArray()) || [],
    links = useLiveQuery(() => db.mailLinks.toArray()) || [],
    files = useLiveQuery(() => db.attachments.toArray()) || [];
  const [follow, setFollow] = useState(""),
    [reason, setReason] = useState("");
  const l = letters.find((l) => l.id === lid);
  if (!l) return <Empty text="Memuat rangkaian surat…" />;
  const concepts = drafts.filter((d) => d.incomingIds?.includes(lid)),
    ids = new Set(concepts.map((d) => d.id));
  const outgoing = outs.filter(
    (o) =>
      o.incomingId === lid ||
      o.incomingIds?.includes(lid) ||
      ids.has(o.draftId || ""),
  );
  const outIds = new Set(outgoing.map((o) => o.id));
  const events = [
    {
      at: l.createdAt,
      title: "Surat masuk " + l.number,
      status: l.status,
      url: "/surat-masuk/" + lid,
    },
    ...ds
      .filter((d) => d.letterId === lid)
      .map((d) => ({
        at: d.createdAt,
        title: "Arahan: " + d.instructions.join(", "),
        status: d.cancelled ? "Dibatalkan" : "Disposisi",
        url: d.digital ? "/disposisi/" + d.id : "/surat-masuk/" + lid,
      })),
    ...concepts.map((d) => ({
      at: d.createdAt,
      title: d.content.subject,
      status: d.stage,
      url: "/naskah/" + d.id,
    })),
    ...decisions
      .filter((d) => ids.has(d.draftId))
      .map((d) => ({
        at: d.createdAt,
        title:
          d.action + " v" + d.version + " " + (d.section || "") + ": " + d.note,
        status: "Pemeriksaan/riwayat",
        url: "/naskah/" + d.draftId,
      })),
    ...outgoing.map((o) => ({
      at: o.createdAt,
      title: "Surat keluar " + o.number,
      status: o.status,
      url: "/buku-ekspedisi?surat=" + encodeURIComponent(o.id),
    })),
    ...dispatches
      .filter((d) => outIds.has(d.outgoingId))
      .map((d) => ({
        at: d.sentAt,
        title:
          targets.find((t) => t.id === d.targetId)?.name + " — " + d.recipient,
        status: d.status,
        url: "/buku-ekspedisi?surat=" + encodeURIComponent(d.outgoingId),
      })),
    ...dispatches
      .filter((d) => outIds.has(d.outgoingId) && d.receivedAt)
      .map((d) => ({
        at: d.receivedAt,
        title: "Penerimaan " + d.recipient,
        status: "Diterima manual",
        url: "/buku-ekspedisi?surat=" + encodeURIComponent(d.outgoingId),
      })),
    ...logs
      .filter((e) => e.letterId === lid)
      .map((e) => ({
        at: e.createdAt,
        title: e.text,
        status: "Riwayat",
        url: "",
      })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RANGKAIAN SURAT</p>
          <h1>{l.subject}</h1>
          <p>
            {l.number} · Balasan:{" "}
            <Badge>{replyStage(lid, drafts, targets, dispatches)}</Badge>
          </p>
        </div>
        <Link className="button" to={"/surat-masuk/" + lid}>
          Buka dokumen sumber
        </Link>
      </div>
      <ReplyActions letterId={lid} />
      <section className="panel">
        <h2>Kronologi berdasarkan ID</h2>
        {events.map((e, i) => (
          <article className="mini-card" key={i}>
            <small>
              {timestampLabel(e.at)} · {e.status}
            </small>
            <strong>{e.title}</strong>
            {e.url && (
              <Link className="button" to={e.url}>
                Buka dokumen / lanjutkan / lihat koreksi
              </Link>
            )}
          </article>
        ))}
      </section>
      <section className="panel">
        <h2>Berkas dan bukti</h2>
        {files
          .filter(
            (f) =>
              f.letterId === lid ||
              ids.has(f.letterId) ||
              outIds.has(f.letterId),
          )
          .map((f) => (
            <button key={f.id} onClick={() => download(f.blob, f.name)}>
              Unduh {f.title || f.name}
            </button>
          ))}
      </section>
      <section className="panel">
        <h2>Surat lanjutan</h2>
        {links
          .filter((l) => l.fromId === lid || l.toId === lid)
          .map((l) => (
            <div className="mini-card" key={l.id}>
              <Link to={"/rangkaian/" + (l.fromId === lid ? l.toId : l.fromId)}>
                {
                  letters.find(
                    (x) => x.id === (l.fromId === lid ? l.toId : l.fromId),
                  )?.subject
                }
              </Link>
              <small>{l.reason}</small>
              <button
                disabled={!reason.trim()}
                onClick={() =>
                  run(
                    () => linkFollowup(l.fromId, l.toId, user.id, reason, true),
                    "Hubungan dilepas. Dokumen tetap tersimpan.",
                  )
                }
              >
                Lepas hubungan (isi alasan)
              </button>
            </div>
          ))}
        <Field label="Surat lanjutan yang dipilih">
          <select value={follow} onChange={(e) => setFollow(e.target.value)}>
            <option value="">Pilih surat berdasarkan ID</option>
            {letters
              .filter((l) => l.id !== lid)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.number} — {l.subject}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Alasan hubungan">
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <button
          disabled={!follow || !reason.trim()}
          onClick={() =>
            run(
              () => linkFollowup(lid, follow, user.id, reason),
              "Hubungan surat disimpan.",
            )
          }
        >
          Tautkan surat lanjutan
        </button>
      </section>
    </>
  );
}
