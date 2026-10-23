import { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, dataMode } from "../storage/db";
import {
  replyStage,
  draftStatus,
  replyStages,
  cancelMailNumber,
  archiveMail,
  prepareMailExample,
} from "../repositories/mail";
import { Field, Badge, Empty } from "../components/common";
import { useApp } from "../app/context";
import { dateLabel, timestampLabel, today, download } from "../utils";
import { csvCell } from "../utils/csv";
export function useMailData() {
  return useLiveQuery(async () => ({
    letters: await db.letters.toArray(),
    assignments: await db.replyAssignments.toArray(),
    drafts: await db.drafts.toArray(),
    outgoing: await db.outgoing.toArray(),
    numbers: await db.mailNumbers.toArray(),
    noteNumbers: await db.noteNumbers.toArray(),
    notes: await db.notes.toArray(),
    users: await db.users.toArray(),
    targets: await db.dispatchTargets.toArray(),
    dispatches: await db.dispatches.toArray(),
    units: await db.units.toArray(),
  }));
}
export function MailDashboard() {
  const data = useMailData();
  if (!data) return null;
  const { letters, assignments, drafts } = data;
  const required = assignments.filter(
    (a) =>
      a.decision === "Perlu balasan" &&
      replyStage(a.id, drafts, data.targets, data.dispatches) !== "Selesai",
  );
  const cards = [
    [
      "Surat belum dinilai",
      letters.filter(
        (l) =>
          !assignments.some(
            (a) => a.id === l.id && a.decision !== "Perlu penilaian",
          ),
      ).length,
      "/perlu-dibalas?status=Perlu+penilaian",
    ],
    ["Kewajiban perlu balasan", required.length, "/perlu-dibalas"],
    [
      "Konsep perlu perbaikan",
      drafts.filter((d) => d.stage === "Perbaikan").length,
      "/konsep-surat?status=Perlu+perbaikan",
    ],
    [
      "Menunggu pemeriksaan / persetujuan",
      drafts.filter((d) => ["Pemeriksaan", "Persetujuan"].includes(d.stage))
        .length,
      "/pemeriksaan-surat",
    ],
    [
      "Disetujui belum bernomor",
      drafts.filter((d) => d.stage === "Penomoran").length,
      "/konsep-surat?status=Disetujui",
    ],
    [
      "Bernomor belum lengkap dikirim",
      drafts.filter((d) => d.stage === "Pengiriman").length,
      "/konsep-surat?status=Bernomor",
    ],
    [
      "Balasan melewati tenggat",
      required.filter((a) => a.deadline && a.deadline < today()).length,
      "/perlu-dibalas?status=Terlambat",
    ],
  ];
  return (
    <section className="panel">
      <h2>Pekerjaan surat terpadu</h2>
      <p>
        Konsep dihitung per dokumen unik; balasan per kewajiban surat masuk.
        Buku ekspedisi menghitung tujuan terpisah.
      </p>
      <div className="mail-metrics">
        {cards.map(([label, n, to]) => (
          <Link className="mini-card" key={String(label)} to={String(to)}>
            <strong>{n}</strong>
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
export function MailCenter({
  view = "reply",
  print = false,
}: {
  view?: "reply" | "drafts" | "review" | "outgoing" | "numbers" | "archive";
  print?: boolean;
}) {
  const navigate = useNavigate();
  const data = useMailData(),
    { user, run } = useApp(),
    [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || ""),
    [reason, setReason] = useState(""),
    [location, setLocation] = useState("");
  const preference = `mail-filter-${dataMode}-${view}`;
  useEffect(() => {
    if (!params.size && localStorage.getItem(preference))
      setParams(new URLSearchParams(localStorage.getItem(preference)!), {
        replace: true,
      });
  }, [preference]);
  useEffect(() => {
    localStorage.setItem(preference, params.toString());
    setQuery(params.get("q") || "");
  }, [params, preference]);
  if (!data) return <Empty text="Memuat register surat…" />;
  const change = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    if (k !== "page") p.delete("page");
    setParams(p);
  };
  const status = params.get("status") || "",
    year = params.get("year") || "",
    unit = params.get("unit") || "";
  const rows =
    view === "reply"
      ? data.letters
          .map((l) => {
            const a = data.assignments.find((a) => a.id === l.id),
              stage = replyStage(
                l.id,
                data.drafts,
                data.targets,
                data.dispatches,
              ),
              decision = a?.decision || "Perlu penilaian";
            return {
              id: l.id,
              number: l.number,
              subject: l.subject,
              person: l.sender,
              stage: decision === "Perlu balasan" ? stage : decision,
              at: l.received,
              unitId: a?.unitId || l.targetUnitId,
              kind: l.kind,
              classification: l.classification,
              location: l.physicalLocation || "",
              deadline: a?.deadline || "",
              url: "/rangkaian/" + l.id,
            };
          })
          .filter((r) =>
            status === "Perlu penilaian"
              ? r.stage === "Perlu penilaian"
              : status === "Terlambat"
                ? r.deadline && r.deadline < today() && r.stage !== "Selesai"
                : r.stage !== "Tidak perlu balasan" &&
                  (status
                    ? r.stage === status
                    : r.stage !== "Perlu penilaian" && r.stage !== "Selesai"),
          )
      : ["drafts", "review"].includes(view)
        ? data.drafts
            .filter(
              (d) =>
                view !== "review" ||
                ["Pemeriksaan", "Persetujuan"].includes(d.stage),
            )
            .map((d) => ({
              id: d.id,
              number:
                d.content.number || d.content.conceptNumber || "Belum bernomor",
              subject: d.content.subject,
              person: d.content.to,
              stage: draftStatus(d),
              at: d.updatedAt.slice(0, 10),
              unitId: d.unitId,
              kind: d.kind,
              classification: "",
              location: "",
              deadline: "",
              url: "/naskah/" + d.id,
            }))
            .filter((r) => !status || r.stage === status)
        : view === "numbers"
          ? [
              ...data.numbers.map((n) => {
                const o = data.outgoing.find((o) => o.id === n.outgoingId);
                return {
                  id: n.id,
                  number: n.id,
                  subject: o?.subject || n.draftId,
                  person:
                    (data.users.find((u) => u.id === n.userId)?.name ||
                      n.userId) +
                    " · v" +
                    n.version +
                    " · " +
                    timestampLabel(n.createdAt),
                  stage: n.state,
                  at: n.createdAt.slice(0, 10),
                  unitId: o?.unitId,
                  kind: o?.kind || "",
                  classification: o?.classification || "",
                  location: n.reason,
                  deadline: "",
                  url: "/naskah/" + n.draftId,
                };
              }),
              ...data.outgoing
                .filter(
                  (o) =>
                    o.number &&
                    !data.numbers.some((n) => n.outgoingId === o.id),
                )
                .map((o) => ({
                  id: "old-out:" + o.id,
                  number: o.number,
                  subject: o.subject,
                  person:
                    "Register lama · petugas pemberian nomor belum dicatat",
                  stage: o.status,
                  at: o.documentDate || o.createdAt.slice(0, 10),
                  unitId: o.unitId,
                  kind: o.kind || "",
                  classification: o.classification || "",
                  location: o.physicalLocation || "",
                  deadline: "",
                  url: o.noteId
                    ? "/nota-dinas/" + o.noteId
                    : o.draftId
                      ? "/naskah/" + o.draftId
                      : "/surat-keluar",
                })),
              ...data.noteNumbers
                .filter((n) => !data.outgoing.some((o) => o.number === n.id))
                .map((n) => {
                  const note = data.notes.find((note) => note.id === n.noteId);
                  return {
                    id: "old-note:" + n.id,
                    number: n.id,
                    subject: note?.content.subject || n.noteId,
                    person:
                      "Nomor nota v" +
                      n.version +
                      " · petugas belum dicatat pada register lama",
                    stage:
                      note?.officialNumber === n.id &&
                      note.status === "Dibatalkan"
                        ? "Dibatalkan"
                        : "Digunakan",
                    at: n.createdAt.slice(0, 10),
                    unitId: note?.content.unitId,
                    kind: "Nota dinas",
                    classification: note?.content.classification || "",
                    location: "",
                    deadline: "",
                    url: "/nota-dinas/" + n.noteId,
                  };
                }),
            ]
          : data.outgoing
              .filter(
                (o) =>
                  o.integrated &&
                  (view === "archive" ? o.status === "Diarsipkan" : true),
              )
              .map((o) => ({
                id: o.id,
                number: o.number || "Belum bernomor",
                subject: o.subject,
                person: o.recipient,
                stage: o.status,
                at: o.documentDate || o.createdAt.slice(0, 10),
                unitId: o.unitId,
                kind: o.kind || "",
                classification: o.classification || "",
                location: o.physicalLocation || "",
                deadline: "",
                url: "/buku-ekspedisi?surat=" + encodeURIComponent(o.id),
              }));
  const filtered = rows
    .filter(
      (r) =>
        (!status ||
          ["reply", "drafts", "review"].includes(view) ||
          r.stage === status) &&
        (!year || r.at.startsWith(year)) &&
        (!unit || r.unitId === unit) &&
        (!params.get("kind") || r.kind === params.get("kind")) &&
        (!params.get("classification") ||
          r.classification === params.get("classification")) &&
        `${r.number} ${r.subject} ${r.person} ${r.location}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      params.get("sort") === "subject"
        ? a.subject.localeCompare(b.subject)
        : params.get("sort") === "oldest"
          ? a.at.localeCompare(b.at)
          : b.at.localeCompare(a.at),
    );
  const size = Number(params.get("size")) || 10,
    page = Math.max(
      1,
      Math.min(
        Number(params.get("page")) || 1,
        Math.ceil(filtered.length / size) || 1,
      ),
    );
  const shown = print
    ? filtered
    : filtered.slice((page - 1) * size, page * size);
  const title = {
    reply: "Perlu Dibalas",
    drafts: "Konsep Surat",
    review: "Pemeriksaan Surat",
    outgoing: "Surat Keluar",
    numbers: "Register Nomor",
    archive: "Arsip Surat Keluar",
  }[view];
  const statuses =
    view === "reply"
      ? ["Perlu penilaian", ...replyStages, "Terlambat"]
      : Array.from(new Set(rows.map((r) => r.stage)));
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">PENGELOLAAN SURAT TERPADU</p>
          <h1>{title}</h1>
          <p>
            {filtered.length}{" "}
            {view === "reply"
              ? "kewajiban / surat yang dipilih"
              : "dokumen unik"}{" "}
            · Database {dataMode === "demo" ? "contoh" : "lokal"}
          </p>
        </div>
        <Link className="button" to="/naskah">
          Buat konsep / atur template
        </Link>
        {dataMode === "demo" && view === "reply" && (
          <button
            onClick={() =>
              run(async () => {
                const d = await prepareMailExample(user.id);
                navigate("/rangkaian/" + d.incomingIds?.[0]);
              }, "Contoh surat terpadu siap ditinjau. Belum diajukan atau dikirim.")
            }
          >
            Siapkan contoh surat terpadu
          </button>
        )}
      </div>
      {print && <h1>{title} — CONTOH/DEMO</h1>}
      <section className="panel">
        <div className="toolbar no-print">
          <Field label="Cari nomor, perihal, tujuan, lokasi fisik">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                change("q", e.target.value);
              }}
            />
          </Field>
          <Field label="Status surat terpadu">
            <select
              value={status}
              onChange={(e) => change("status", e.target.value)}
            >
              <option value="">Semua dalam antrean</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Tahun surat">
            <input
              value={year}
              onChange={(e) => change("year", e.target.value)}
            />
          </Field>
          <Field label="Unit surat">
            <select
              value={unit}
              onChange={(e) => change("unit", e.target.value)}
            >
              <option value="">Semua unit</option>
              {data.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jenis surat">
            <select
              value={params.get("kind") || ""}
              onChange={(e) => change("kind", e.target.value)}
            >
              <option value="">Semua jenis</option>
              {Array.from(new Set(rows.map((r) => r.kind)))
                .filter(Boolean)
                .map((k) => (
                  <option key={k}>{k}</option>
                ))}
            </select>
          </Field>
          <Field label="Klasifikasi surat">
            <select
              value={params.get("classification") || ""}
              onChange={(e) => change("classification", e.target.value)}
            >
              <option value="">Semua</option>
              {["Biasa", "Terbatas", "Rahasia"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="Urutan surat">
            <select
              value={params.get("sort") || "newest"}
              onChange={(e) => change("sort", e.target.value)}
            >
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
              <option value="subject">Perihal A–Z</option>
            </select>
          </Field>
          <Field label="Baris per halaman">
            <select
              value={size}
              onChange={(e) => change("size", e.target.value)}
            >
              {[10, 25, 50].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
          <button
            onClick={() =>
              download(
                new Blob(
                  [
                    "\ufeff" +
                      [
                        [
                          "Nomor",
                          "Perihal",
                          "Pengirim/tujuan",
                          "Status",
                          "Tanggal",
                          "Lokasi",
                        ],
                        ...filtered.map((r) => [
                          r.number,
                          r.subject,
                          r.person,
                          r.stage,
                          r.at,
                          r.location,
                        ]),
                      ]
                        .map((r) => r.map(csvCell).join(","))
                        .join("\r\n"),
                  ],
                  { type: "text/csv;charset=utf-8" },
                ),
                "register-surat.csv",
              )
            }
          >
            Ekspor CSV
          </button>
          <Link
            className="button"
            to={"/cetak-register?view=" + view + "&" + params.toString()}
          >
            Cetak register
          </Link>
          {print && (
            <button onClick={() => window.print()}>Cetak / Simpan PDF</button>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nomor / tanggal</th>
                <th>Perihal / pengirim atau tujuan</th>
                <th>Status</th>
                <th>Unit / lokasi</th>
                <th className="no-print">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.number}
                    <small>{dateLabel(r.at)}</small>
                  </td>
                  <td>
                    <strong>{r.subject}</strong>
                    <small>{r.person}</small>
                    {r.deadline && (
                      <small>Tenggat: {dateLabel(r.deadline)}</small>
                    )}
                  </td>
                  <td>
                    <Badge>{r.stage}</Badge>
                  </td>
                  <td>
                    {data.units.find((u) => u.id === r.unitId)?.name || "—"}
                    <small>{r.location}</small>
                  </td>
                  <td className="no-print">
                    <Link className="button" to={r.url}>
                      Buka
                    </Link>
                    {view === "numbers" &&
                      data.numbers.some((n) => n.id === r.id) &&
                      r.stage === "Digunakan" && (
                        <button
                          disabled={!reason.trim()}
                          onClick={() =>
                            run(
                              () => cancelMailNumber(r.number, user.id, reason),
                              "Nomor dibatalkan dan tetap dicadangkan.",
                            )
                          }
                        >
                          Batalkan nomor
                        </button>
                      )}
                    {view === "outgoing" &&
                      data.outgoing.find((o) => o.id === r.id)?.integrated &&
                      r.stage !== "Diarsipkan" && (
                        <button
                          onClick={() =>
                            run(
                              () => archiveMail(r.id, user.id, location),
                              "Surat diarsipkan.",
                            )
                          }
                        >
                          Arsipkan
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <Empty text="Tidak ada pekerjaan sesuai filter." />
        )}
        <div className="pagination no-print">
          <button
            disabled={page <= 1}
            onClick={() => change("page", String(page - 1))}
          >
            Sebelumnya
          </button>
          <span>
            Halaman {page} / {Math.ceil(filtered.length / size) || 1}
          </span>
          <button
            disabled={page * size >= filtered.length}
            onClick={() => change("page", String(page + 1))}
          >
            Berikutnya
          </button>
        </div>
        {view === "numbers" && (
          <Field label="Alasan pembatalan nomor">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        )}
        {view === "outgoing" && (
          <Field label="Lokasi dokumen fisik arsip">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Field>
        )}
      </section>
      {view === "numbers" && <NumberSettings />}
    </>
  );
}
function NumberSettings() {
  const { user, run } = useApp(),
    s = useLiveQuery(() => db.settings.get("main"));
  const [pattern, setPattern] = useState("");
  return (
    <section className="panel no-print">
      <h2>Pola nomor lokal</h2>
      <p>
        Pola bawaan merupakan rancangan. Gunakan pola resmi yang diberikan
        pengguna. Variabel: {"{seq}, {kind}, {unit}, {month} (Romawi), {year}"}.
      </p>
      <p>
        Pola tersimpan:{" "}
        {s?.mailNumberPattern || "{seq}/{kind}/{unit}/{month}/{year}"}
      </p>
      <Field label="Pola nomor surat keluar">
        <input value={pattern} onChange={(e) => setPattern(e.target.value)} />
      </Field>
      <button
        disabled={
          !["Admin Sistem", "Petugas Urtu/Administrasi"].includes(user.role) ||
          !pattern.includes("{seq}")
        }
        onClick={() =>
          run(
            () => db.settings.update("main", { mailNumberPattern: pattern }),
            "Pola nomor disimpan.",
          )
        }
      >
        Simpan pola lokal
      </button>
      <p>
        Nomor nota dinas lama dan surat keluar ikut diperiksa untuk mencegah
        penggunaan ganda.
      </p>
    </section>
  );
}
export function PrintMailRegister() {
  const [p] = useSearchParams();
  const view = p.get("view") || "numbers";
  return (
    <MailCenter
      print
      view={
        [
          "reply",
          "drafts",
          "review",
          "outgoing",
          "numbers",
          "archive",
        ].includes(view)
          ? (view as "numbers")
          : "numbers"
      }
    />
  );
}
