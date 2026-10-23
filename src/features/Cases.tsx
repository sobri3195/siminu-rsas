import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { useApp } from "../app/context";
import { linkToCase, unlinkFromCase, sourceRoute } from "../repositories/cases";
import type { LinkKind } from "../types";
import { Field, Modal, Empty, Badge } from "../components/common";
import { id, now, dateLabel } from "../utils";
export function Cases() {
  const { run } = useApp();
  const bundles = useLiveQuery(() => db.caseFiles.toArray()) || [];
  const [chosen, setChosen] = useState("");
  const [create, setCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<LinkKind>("letters");
  const [source, setSource] = useState("");
  const rows = useLiveQuery(() => db.table(kind).toArray(), [kind]) || [];
  const material =
    useLiveQuery(async () =>
      Object.fromEntries(
        await Promise.all(
          (
            [
              "letters",
              "dispositions",
              "tasks",
              "outgoing",
              "events",
              "minutes",
              "reports",
              "drafts",
            ] as LinkKind[]
          ).map(async (k) => [k, await db.table(k).toArray()]),
        ),
      ),
    ) || {};
  const bundle = bundles.find((b) => b.id === chosen);
  const chronology =
    bundle?.links
      .map((l) => ({
        link: l,
        row: material[l.kind]?.find((r: { id: string }) => r.id === l.id),
      }))
      .filter((l) => l.row)
      .sort((a, b) =>
        String(a.row.createdAt || a.row.date || "").localeCompare(
          String(b.row.createdAt || b.row.date || ""),
        ),
      ) || [];
  const letterIds = new Set(
    bundle?.links.filter((l) => l.kind === "letters").map((l) => l.id),
  );
  const minuteIds = new Set(
    bundle?.links.filter((l) => l.kind === "minutes").map((l) => l.id),
  );
  const openTasks = (material.tasks || []).filter(
    (t: { id: string; status: string; letterId: string; minutesId: string }) =>
      !["Selesai", "Dibatalkan"].includes(t.status) &&
      (letterIds.has(t.letterId) ||
        minuteIds.has(t.minutesId) ||
        bundle?.links.some((l) => l.kind === "tasks" && l.id === t.id)),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">BUNDEL DOKUMEN BERDASARKAN KEGIATAN</p>
          <h1>Berkas Kegiatan</h1>
          <p className="muted">
            Hubungan memakai ID sumber. Menghapus hubungan tidak menghapus surat
            atau bukti.
          </p>
        </div>
        <button className="primary" onClick={() => setCreate(true)}>
          Buat berkas kegiatan
        </button>
      </div>
      <section className="panel">
        <Field label="Pilih berkas kegiatan">
          <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
            <option value="">Pilih berkas</option>
            {bundles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </Field>
        {bundle ? (
          <>
            <h2>{bundle.title}</h2>
            <p>{bundle.description}</p>
            <div className="toolbar">
              <Field label="Jenis sumber">
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as LinkKind);
                    setSource("");
                  }}
                >
                  {[
                    ["letters", "Surat masuk"],
                    ["dispositions", "Disposisi"],
                    ["tasks", "Tugas"],
                    ["outgoing", "Surat keluar"],
                    ["events", "Agenda"],
                    ["minutes", "Notulen"],
                    ["reports", "Bukti / laporan hasil"],
                    ["drafts", "Naskah dinas"],
                  ].map(([k, n]) => (
                    <option value={k} key={k}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Dokumen sumber">
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="">Pilih dokumen</option>
                  {rows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.subject ||
                        r.title ||
                        r.content?.subject ||
                        r.instruction ||
                        r.result ||
                        r.notes ||
                        r.id}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                disabled={!source}
                onClick={() =>
                  run(
                    () => linkToCase(bundle.id, [{ kind, id: source }]),
                    "Dokumen ditautkan tanpa menyalin sumber.",
                  )
                }
              >
                Tautkan ke berkas
              </button>
            </div>
            <h2>Kronologi dokumen</h2>
            {chronology.map(({ link, row: r }) => (
              <div className="timeline" key={link.kind + link.id}>
                <strong>
                  {r.subject ||
                    r.title ||
                    r.content?.subject ||
                    r.instruction ||
                    r.result ||
                    r.notes ||
                    r.id}
                </strong>
                <small>
                  {link.kind} · {dateLabel(r.createdAt || r.date || "")}
                </small>
                <Link className="button" to={sourceRoute(link.kind, r)}>
                  Buka sumber
                </Link>
                <button
                  onClick={() =>
                    run(
                      () => unlinkFromCase(bundle.id, link.kind, link.id),
                      "Hubungan dihapus. Dokumen sumber tetap tersedia.",
                    )
                  }
                >
                  Hapus hubungan
                </button>
              </div>
            ))}
            <h2>Pekerjaan terbuka · {openTasks.length}</h2>
            {openTasks.map(
              (t: {
                id: string;
                instruction: string;
                unitName: string;
                status: string;
              }) => (
                <p key={t.id}>
                  {t.instruction} — {t.unitName} <Badge>{t.status}</Badge>
                </p>
              ),
            )}
          </>
        ) : (
          <Empty text="Pilih atau buat berkas untuk menghubungkan dokumen terkait." />
        )}
      </section>
      {create && (
        <Modal title="Berkas kegiatan baru" onClose={() => setCreate(false)}>
          <Field label="Nama kegiatan / perkara">
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Deskripsi">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <button
            className="primary"
            disabled={!title.trim()}
            onClick={() =>
              run(async () => {
                const cid = id();
                await db.caseFiles.add({
                  id: cid,
                  title,
                  description,
                  links: [],
                  createdAt: now(),
                  updatedAt: now(),
                });
                setChosen(cid);
                setCreate(false);
                setTitle("");
              }, "Berkas kegiatan dibuat.")
            }
          >
            Simpan berkas
          </button>
        </Modal>
      )}
    </>
  );
}
