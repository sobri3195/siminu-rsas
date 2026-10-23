import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { useApp } from "../app/context";
import { Field, Badge, Modal, Empty } from "../components/common";
import { LocalDocumentPreview } from "../components/LocalDocumentPreview";
import {
  addDispatchTarget,
  recordDispatch,
  receiveDispatch,
  targetStatus,
} from "../repositories/mail";
import { id, now, timestampLabel, download } from "../utils";
import type { MailDispatch, Attachment } from "../types";
export function MailDispatchBook() {
  const { user, run } = useApp(),
    [params, setParams] = useSearchParams();
  const outs = useLiveQuery(() => db.outgoing.toArray()) || [],
    targets = useLiveQuery(() => db.dispatchTargets.toArray()) || [],
    attempts = useLiveQuery(() => db.dispatches.toArray()) || [],
    files = useLiveQuery(() => db.attachments.toArray()) || [];
  const oid = params.get("surat") || "",
    out = outs.find((o) => o.id === oid),
    [name, setName] = useState(""),
    [address, setAddress] = useState(""),
    [form, setForm] = useState<MailDispatch>(),
    [proof, setProof] = useState<File[]>([]),
    [receive, setReceive] = useState<MailDispatch>(),
    [date, setDate] = useState(""),
    [preview, setPreview] = useState<Attachment>(),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    targetRequest = useRef(id());
  const localTime = () => {
    const t = new Date();
    return new Date(t.getTime() - t.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  const work = async (fn: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PENGIRIMAN MANUAL</p>
          <h1>Buku Ekspedisi</h1>
          <p>
            Pencatatan lokal oleh petugas. Penerimaan dicatat terpisah untuk
            setiap tujuan.
          </p>
        </div>
      </div>
      <section className="panel">
        <Field label="Surat keluar untuk ekspedisi">
          <select
            value={oid}
            onChange={(e) => setParams({ surat: e.target.value })}
          >
            <option value="">Pilih surat bernomor</option>
            {outs
              .filter((o) => o.number)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.number} — {o.subject}
                </option>
              ))}
          </select>
        </Field>
        {out && (
          <>
            <h2>{out.subject}</h2>
            <Badge>{out.status}</Badge>
            {out.draftId && (
              <Link className="button" to={"/naskah/" + out.draftId}>
                Buka naskah
              </Link>
            )}
            {out.incomingId && (
              <Link className="button" to={"/rangkaian/" + out.incomingId}>
                Rangkaian surat
              </Link>
            )}
            <p>
              {targets.filter((t) => t.outgoingId === oid).length} tujuan ·{" "}
              {attempts.filter((d) => d.outgoingId === oid).length} percobaan
              pengiriman ·{" "}
              {
                targets.filter(
                  (t) =>
                    t.outgoingId === oid &&
                    targetStatus(t, attempts) === "Diterima",
                ).length
              }{" "}
              tujuan diterima
            </p>
            <Field label="Tujuan tambahan">
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Alamat tujuan">
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Field>
            <button
              disabled={busy || !name.trim() || out.status === "Diarsipkan"}
              onClick={() =>
                run(
                  () =>
                    work(async () => {
                      await addDispatchTarget(
                        oid,
                        name,
                        address,
                        user.id,
                        targetRequest.current,
                      );
                      targetRequest.current = id();
                      setName("");
                      setAddress("");
                    }),
                  "Tujuan disimpan.",
                )
              }
            >
              Tambah tujuan
            </button>
          </>
        )}
      </section>
      {targets
        .filter((t) => t.outgoingId === oid)
        .map((t) => (
          <section className="panel" key={t.id}>
            <div className="toolbar">
              <h2>{t.name}</h2>
              <Badge>{targetStatus(t, attempts)}</Badge>
              <button
                disabled={
                  busy || out?.status === "Diarsipkan" || !!out?.cancelledReason
                }
                onClick={() => {
                  setProof([]);
                  setForm({
                    id: id(),
                    targetId: t.id,
                    outgoingId: oid,
                    recipient: "",
                    sentAt: localTime(),
                    medium: "Diserahkan langsung",
                    userId: user.id,
                    userName: user.name,
                    tracking: "",
                    proofIds: [],
                    receivedAt: "",
                    receiptIds: [],
                    note: "",
                    status: attempts.some((a) => a.targetId === t.id)
                      ? "Dikirim ulang"
                      : "Tercatat dikirim",
                    revision: 1,
                    createdAt: now(),
                  });
                }}
              >
                Catat percobaan pengiriman
              </button>
            </div>
            <p>{t.address}</p>
            {attempts
              .filter((a) => a.targetId === t.id)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((a) => (
                <article className="mini-card" key={a.id}>
                  <strong>
                    {a.status} — {a.recipient}
                  </strong>
                  <small>
                    {timestampLabel(a.sentAt)} · {a.medium} · {a.userName} ·
                    Resi {a.tracking || "—"}
                  </small>
                  <p>{a.note}</p>
                  {a.receivedAt && (
                    <p>Diterima: {timestampLabel(a.receivedAt)}</p>
                  )}
                  {[...a.proofIds, ...a.receiptIds].map((aid) => {
                    const f = files.find((f) => f.id === aid);
                    return f ? (
                      <span key={aid}>
                        <button onClick={() => setPreview(f)}>
                          Pratinjau {f.name}
                        </button>
                        <button onClick={() => download(f.blob, f.name)}>
                          Unduh asli
                        </button>
                      </span>
                    ) : (
                      <p className="error" key={aid}>
                        Bukti hilang
                      </p>
                    );
                  })}
                  {!["Diterima", "Gagal dikirim"].includes(a.status) && (
                    <button
                      onClick={() => {
                        setReceive(a);
                        setDate(localTime());
                        setProof([]);
                      }}
                    >
                      Catat penerimaan
                    </button>
                  )}
                </article>
              ))}
          </section>
        ))}
      {oid && !targets.some((t) => t.outgoingId === oid) && (
        <Empty text="Belum ada tujuan. Tambahkan tujuan pengiriman." />
      )}
      {form && (
        <Modal
          title="Catat pengiriman manual"
          onClose={() => setForm(undefined)}
        >
          <Field label="Nama penerima / pihak tujuan">
            <input
              value={form.recipient}
              onChange={(e) => setForm({ ...form, recipient: e.target.value })}
            />
          </Field>
          <Field label="Waktu pengiriman">
            <input
              type="datetime-local"
              value={form.sentAt}
              onChange={(e) => setForm({ ...form, sentAt: e.target.value })}
            />
          </Field>
          <Field label="Media pengiriman">
            <select
              value={form.medium}
              onChange={(e) =>
                setForm({
                  ...form,
                  medium: e.target.value as MailDispatch["medium"],
                })
              }
            >
              {[
                "Diserahkan langsung",
                "Kurir",
                "Pos",
                "Email manual",
                "Lainnya",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Status percobaan">
            <select
              value={form.status}
              onChange={(e) =>
                setForm({
                  ...form,
                  status: e.target.value as MailDispatch["status"],
                })
              }
            >
              {["Tercatat dikirim", "Gagal dikirim", "Dikirim ulang"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </Field>
          <Field label="Nomor resi">
            <input
              value={form.tracking}
              onChange={(e) => setForm({ ...form, tracking: e.target.value })}
            />
          </Field>
          <Field label="Catatan pengiriman">
            <textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>
          <Field label="Bukti pengiriman (maksimal 20 MB per berkas)">
            <input
              type="file"
              multiple
              onChange={(e) => setProof(Array.from(e.target.files || []))}
            />
          </Field>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  work(async () => {
                    await recordDispatch(
                      { ...form, sentAt: new Date(form.sentAt).toISOString() },
                      user.id,
                      proof,
                    );
                    setForm(undefined);
                    setProof([]);
                  }),
                "Catatan pengiriman disimpan.",
              )
            }
          >
            Simpan catatan pengiriman
          </button>
          <p>
            Aplikasi tidak mengirim email/WhatsApp atau memverifikasi penerimaan
            otomatis.
          </p>
        </Modal>
      )}
      {receive && (
        <Modal
          title="Catat penerimaan manual"
          onClose={() => setReceive(undefined)}
        >
          <Field label="Waktu penerimaan">
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Bukti penerimaan">
            <input
              type="file"
              multiple
              onChange={(e) => setProof(Array.from(e.target.files || []))}
            />
          </Field>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  work(async () => {
                    await receiveDispatch(
                      receive.id,
                      receive.revision,
                      new Date(date).toISOString(),
                      user.id,
                      proof,
                    );
                    setReceive(undefined);
                    setProof([]);
                  }),
                "Penerimaan tujuan ini dicatat.",
              )
            }
          >
            Simpan penerimaan
          </button>
        </Modal>
      )}
      {preview && (
        <Modal
          title="Bukti tersimpan lokal"
          onClose={() => setPreview(undefined)}
        >
          <LocalDocumentPreview file={preview} />
        </Modal>
      )}
    </>
  );
}
