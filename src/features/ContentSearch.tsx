import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import {
  indexPDF,
  searchLocal,
  type SearchResult,
} from "../repositories/search";
import { useApp } from "../app/context";
import { Field, Empty, Badge } from "../components/common";
export function ContentSearch() {
  const { run } = useApp();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const [result, setResult] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const files =
    useLiveQuery(() =>
      db.attachments
        .filter(
          (a) =>
            a.type === "application/pdf" ||
            a.name.toLowerCase().endsWith(".pdf"),
        )
        .toArray(),
    ) || [];
  const pages = useLiveQuery(() => db.searchPages.toArray()) || [];
  useEffect(() => {
    let active = true;
    void searchLocal(query).then((r) => {
      if (active) setResult(r);
    });
    return () => {
      active = false;
    };
  }, [query, pages.length]);
  const snippet = (text: string) => {
    const pos = text
      .toLocaleLowerCase("id")
      .indexOf(query.toLocaleLowerCase("id"));
    const start = Math.max(0, pos - 65);
    const chunk = text.slice(start, start + 230);
    const at = chunk
      .toLocaleLowerCase("id")
      .indexOf(query.toLocaleLowerCase("id"));
    return at < 0 ? (
      chunk
    ) : (
      <>
        {start > 0 ? "…" : ""}
        {chunk.slice(0, at)}
        <mark>{chunk.slice(at, at + query.length)}</mark>
        {chunk.slice(at + query.length)}
        {start + 230 < text.length ? "…" : ""}
      </>
    );
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TIDAK ADA ISI DIKIRIM KE LAYANAN EKSTERNAL</p>
          <h1>Pencarian Isi Lokal</h1>
          <p className="muted">
            Metadata, naskah, disposisi, laporan hasil, notulen dan lapisan teks
            PDF.
          </p>
        </div>
      </div>
      <section className="panel">
        <Field label="Cari isi dokumen (minimal 2 karakter)">
          <input
            value={query}
            onChange={(e) => setParams({ q: e.target.value })}
            placeholder="Kata atau frasa yang dicari…"
          />
        </Field>
        <details>
          <summary>Indeks PDF lokal · {files.length} berkas</summary>
          <p>
            Ekstraksi memakai PDF.js dan Web Worker lokal. Tidak ada OCR. PDF
            pindai tanpa lapisan teks diberi keterangan tersendiri.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                setBusy(true);
                let ok = 0,
                  failed = 0;
                try {
                  for (const file of files) {
                    setStatus("Mengekstrak " + file.name);
                    try {
                      await indexPDF(file.id);
                      ok++;
                    } catch {
                      failed++;
                    }
                  }
                  setStatus(
                    `${ok} PDF diekstrak, ${failed} gagal. Periksa keterangan masing-masing berkas.`,
                  );
                  setResult(await searchLocal(query));
                } finally {
                  setBusy(false);
                }
              }, "")
            }
          >
            {busy ? "Mengekstrak…" : "Indeks ulang isi PDF"}
          </button>
          <p role="status">{status}</p>
          {files.map((f) => {
            const ps = pages.filter((p) => p.attachmentId === f.id);
            return (
              <p key={f.id}>
                <strong>{f.name}</strong>
                <small>
                  {!ps.length
                    ? "Belum diindeks"
                    : ps.some((p) => p.status === "error")
                      ? "Ekstraksi gagal: " +
                        ps.find((p) => p.status === "error")?.message
                      : ps.every((p) => p.status === "scan")
                        ? "Belum dapat dicari berdasarkan isi — tidak ada lapisan teks"
                        : `${ps.filter((p) => p.status === "text").length} halaman memiliki teks`}
                </small>
              </p>
            );
          })}
        </details>
      </section>
      <section className="panel master-extra">
        <h2>{result.length} hasil</h2>
        {result.map((r) => (
          <article className="mini-card" key={r.id}>
            <div className="row">
              <Link className="subject" to={r.href}>
                {r.title}
              </Link>
              <Badge>{r.kind}</Badge>
            </div>
            <p>{snippet(r.text)}</p>
            <small>{r.page ? `Halaman ${r.page}` : ""}</small>
            <Link className="button" to={r.href}>
              Buka sumber dokumen
            </Link>
          </article>
        ))}
        {!result.length && (
          <Empty
            text={
              query.length < 2
                ? "Masukkan minimal dua karakter."
                : "Tidak ada kecocokan. Periksa kata pencarian atau buat indeks PDF lokal."
            }
          />
        )}
      </section>
    </>
  );
}
