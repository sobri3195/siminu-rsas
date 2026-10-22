import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Search, ArrowRight, FileText } from "lucide-react";
import { db } from "../storage/db";
import { useApp } from "../app/context";
import { canRegister, register } from "../repositories/workflow";
import { Badge, Empty, Field } from "../components/common";
import { dateLabel, id, now, today } from "../utils";
const schema = z.object({
  sender: z.string().min(2, "Isi nama pengirim."),
  number: z.string().min(1, "Nomor surat wajib diisi."),
  date: z.string().min(1, "Pilih tanggal surat."),
  received: z.string().min(1),
  agenda: z.string().min(1, "Nomor agenda wajib diisi."),
  subject: z.string().min(5, "Perihal minimal 5 karakter."),
  kind: z.string(),
  urgency: z.string(),
  classification: z.string(),
  summary: z.string(),
});
type Values = z.infer<typeof schema>;
export function Letters({
  archive = false,
  dispositions = false,
}: {
  archive?: boolean;
  dispositions?: boolean;
}) {
  const letters = useLiveQuery(() => db.letters.toArray()) || [];
  const tasks = useLiveQuery(() => db.tasks.toArray()) || [];
  const units = useLiveQuery(() => db.units.toArray()) || [];
  const { user } = useApp();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || "");
  useEffect(() => setSearch(params.get("q") || ""), [params.get("q")]);
  const filtered = letters.filter(
    (l) =>
      (!archive || l.status === "Diarsipkan") &&
      (!dispositions ||
        ["Menunggu disposisi", "Dalam tindak lanjut", "Selesai"].includes(
          l.status,
        )) &&
      (!params.get("status") || l.status === params.get("status")) &&
      (!params.get("urgency") || l.urgency === params.get("urgency")) &&
      (!params.get("kind") || l.kind === params.get("kind")) &&
      (!params.get("classification") ||
        l.classification === params.get("classification")) &&
      (!params.get("from") || l.received >= params.get("from")!) &&
      (!params.get("to") || l.received <= params.get("to")!) &&
      (!params.get("unit") ||
        tasks.some(
          (t) => t.letterId === l.id && t.unitId === params.get("unit"),
        )) &&
      `${l.subject} ${l.sender} ${l.number} ${l.agenda}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const change = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    value ? p.set(key, value) : p.delete(key);
    setParams(p);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">REGISTER & KORESPONDENSI</p>
          <h1>
            {archive ? "Arsip" : dispositions ? "Disposisi" : "Surat Masuk"}
          </h1>
          <p className="muted">
            Kelola naskah, pantau proses, dan temukan informasi surat.
          </p>
        </div>
        {canRegister(user.role) && !archive && (
          <Link className="primary button" to="/surat-masuk/baru">
            <Plus size={18} /> Registrasi surat
          </Link>
        )}
      </div>
      <section className="panel">
        <div className="toolbar">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Cari surat"
              placeholder="Cari perihal, nomor surat, atau pengirim…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                change("q", e.target.value);
              }}
            />
          </label>
          <select
            aria-label="Filter status"
            value={params.get("status") || ""}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="">Semua status</option>
            {[
              "Draf",
              "Terdaftar",
              "Menunggu disposisi",
              "Dalam tindak lanjut",
              "Selesai",
              "Diarsipkan",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Filter derajat"
            value={params.get("urgency") || ""}
            onChange={(e) => change("urgency", e.target.value)}
          >
            <option value="">Semua derajat</option>
            {["Biasa", "Segera", "Sangat segera"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <details className="filters">
          <summary>Filter lanjutan · {filtered.length} surat</summary>
          <div className="grid3">
            <Field label="Dari tanggal">
              <input
                type="date"
                value={params.get("from") || ""}
                onChange={(e) => change("from", e.target.value)}
              />
            </Field>
            <Field label="Sampai tanggal">
              <input
                type="date"
                value={params.get("to") || ""}
                onChange={(e) => change("to", e.target.value)}
              />
            </Field>
            {["kind", "classification", "unit"].map((k) => (
              <Field
                key={k}
                label={
                  k === "kind"
                    ? "Jenis naskah"
                    : k === "unit"
                      ? "Unit tujuan"
                      : "Klasifikasi"
                }
              >
                <select
                  value={params.get(k) || ""}
                  onChange={(e) => change(k, e.target.value)}
                >
                  <option value="">Semua</option>
                  {(k === "unit"
                    ? units.map((u) => ({ id: u.id, name: u.name }))
                    : (k === "kind"
                        ? ["Surat dinas", "Undangan", "Nota dinas"]
                        : ["Biasa", "Terbatas", "Rahasia"]
                      ).map((s) => ({ id: s, name: s }))
                  ).map((o) => (
                    <option value={o.id} key={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        </details>
        {params.size > 0 && (
          <div className="filter-tags">
            Filter aktif:{" "}
            {Array.from(params.entries()).map(([k, v]) => (
              <span key={k}>
                {k}: {v}
              </span>
            ))}
            <button
              onClick={() => {
                setParams({});
                setSearch("");
              }}
            >
              Hapus filter
            </button>
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agenda / Tanggal</th>
                <th>Perihal & pengirim</th>
                <th>Derajat / Klasifikasi</th>
                <th>Status</th>
                <th>Tenggat</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.agenda}</strong>
                    <small>{dateLabel(l.received)}</small>
                  </td>
                  <td>
                    <Link to={`/surat-masuk/${l.id}`} className="subject">
                      {l.subject}
                    </Link>
                    <small>
                      {l.sender} · {l.number}
                    </small>
                    <small>
                      {l.kind} · Tgl. surat {dateLabel(l.date)}
                    </small>
                  </td>
                  <td>
                    <Badge>{l.urgency}</Badge>
                    <small>{l.classification}</small>
                  </td>
                  <td>
                    <Badge>{l.status}</Badge>
                  </td>
                  <td>
                    {dateLabel(
                      tasks
                        .filter(
                          (t) => t.letterId === l.id && t.status !== "Selesai",
                        )
                        .sort((a, b) => a.deadline.localeCompare(b.deadline))[0]
                        ?.deadline || "",
                    )}
                  </td>
                  <td>
                    <Link className="text-link" to={`/surat-masuk/${l.id}`}>
                      Buka <ArrowRight size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && <Empty />}
        <footer className="panel-footer">
          Menampilkan {filtered.length} dari {letters.length} surat · Tersimpan
          di browser ini
        </footer>
      </section>
    </>
  );
}
export function NewLetter() {
  const { user, run } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadedLetters = useLiveQuery(() => db.letters.toArray());
  const letters = loadedLetters || [];
  const saved = localStorage.getItem("rsas-letter-draft");
  const initial = saved ? JSON.parse(saved) : {};
  const {
    register: field,
    handleSubmit,
    watch,
    trigger,
    setValue,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      sender: "",
      number: "",
      date: today(),
      received: today(),
      agenda: "",
      subject: "",
      kind: "Surat dinas",
      urgency: "Biasa",
      classification: "Biasa",
      summary: "",
      ...initial,
    },
  });
  const values = watch();
  useEffect(() => {
    if (loadedLetters && !values.agenda) {
      const next =
        Math.max(
          0,
          ...letters
            .filter((l) => l.received.slice(0, 4) === today().slice(0, 4))
            .map((l) => parseInt(l.agenda) || 0),
        ) + 1;
      setValue(
        "agenda",
        `${String(next).padStart(4, "0")}/SM/${today().slice(0, 4)}`,
      );
    }
  }, [loadedLetters, values.agenda, setValue]);
  useEffect(() => {
    const subscription = watch((v) =>
      localStorage.setItem("rsas-letter-draft", JSON.stringify(v)),
    );
    return () => subscription.unsubscribe();
  }, [watch]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [isDirty]);
  if (!canRegister(user.role))
    return <Empty text="Pilih peran petugas atau admin untuk registrasi." />;
  const save = async (v: Values) => {
    setBusy(true);
    try {
      await register(
        {
          ...v,
          id: id(),
          status: "Terdaftar",
          attachmentIds: [],
          createdAt: now(),
        },
        files,
        user.name,
      );
      localStorage.removeItem("rsas-letter-draft");
      await run(async () => {}, "Surat berhasil diregistrasi.");
      navigate("/surat-masuk");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SURAT MASUK</p>
          <h1>Registrasi surat baru</h1>
          <p className="muted">
            Draf metadata disimpan otomatis. Pilih ulang berkas setelah
            meninggalkan halaman.
          </p>
        </div>
        <Link
          to="/surat-masuk"
          onClick={(e) => {
            if (
              isDirty &&
              !confirm("Tinggalkan formulir? Draf metadata tetap tersimpan.")
            )
              e.preventDefault();
          }}
        >
          Kembali ke daftar
        </Link>
      </div>
      <div className="steps">
        {["Identitas surat", "Dokumen & lampiran", "Pemeriksaan"].map(
          (s, i) => (
            <span key={s} className={step === i + 1 ? "active" : ""}>
              {i + 1}. {s}
            </span>
          ),
        )}
      </div>
      <form
        className="panel form-panel"
        onSubmit={(e) => {
          if (step !== 3) {
            e.preventDefault();
            return;
          }
          void handleSubmit(save)(e);
        }}
      >
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {step === 1 && (
          <div className="grid2">
            {(
              [
                "sender",
                "number",
                "date",
                "received",
                "agenda",
                "subject",
              ] as const
            ).map((k, i) => (
              <Field
                key={k}
                label={
                  [
                    "Pengirim *",
                    "Nomor surat *",
                    "Tanggal surat *",
                    "Tanggal diterima *",
                    "Nomor agenda * (dapat dikoreksi)",
                    "Perihal *",
                  ][i]
                }
              >
                <input
                  type={["date", "received"].includes(k) ? "date" : "text"}
                  {...field(k)}
                />
                {errors[k] && (
                  <small className="error">{errors[k]?.message}</small>
                )}
              </Field>
            ))}
            {(["kind", "urgency", "classification"] as const).map((k, i) => (
              <Field
                key={k}
                label={
                  [
                    "Jenis naskah",
                    "Derajat urgensi",
                    "Klasifikasi kerahasiaan",
                  ][i]
                }
              >
                <select {...field(k)}>
                  {[
                    ["Surat dinas", "Undangan", "Nota dinas"],
                    ["Biasa", "Segera", "Sangat segera"],
                    ["Biasa", "Terbatas", "Rahasia"],
                  ][i].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
            ))}
            <Field label="Ringkasan">
              <textarea {...field("summary")} />
            </Field>
          </div>
        )}
        {step === 2 && (
          <>
            <FileText size={36} />
            <h2>Dokumen utama & lampiran</h2>
            <Field label="Pilih berkas (berkas pertama menjadi dokumen utama)">
              <input
                type="file"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
            </Field>
            <p className="muted">
              PDF, JPG, dan PNG dapat dipratinjau. Format lain tersedia sebagai
              unduhan. Tidak ada OCR.
            </p>
            {files.map((f, i) => (
              <p key={i}>
                {i === 0 ? "Utama" : "Lampiran"}: {f.name} ·{" "}
                {Math.ceil(f.size / 1024)} KB
              </p>
            ))}
          </>
        )}
        {step === 3 && (
          <>
            <h2>Periksa sebelum menyimpan</h2>
            <dl>
              {Object.entries(values).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <p>{files.length} berkas dipilih.</p>
            {letters.some(
              (l) =>
                l.sender === values.sender &&
                l.number === values.number &&
                l.date === values.date,
            ) && (
              <p className="warning">
                Kemungkinan duplikat: pengirim, nomor, dan tanggal surat sama.
              </p>
            )}
          </>
        )}
        <div className="form-actions">
          {step > 1 && (
            <button type="button" onClick={() => setStep(step - 1)}>
              Sebelumnya
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              className="primary"
              onClick={async (e) => {
                e.preventDefault();
                if (await trigger()) setStep(step + 1);
              }}
            >
              Lanjutkan <ArrowRight size={17} />
            </button>
          ) : (
            <button className="primary" disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan & registrasi"}
            </button>
          )}
        </div>
      </form>
    </>
  );
}
