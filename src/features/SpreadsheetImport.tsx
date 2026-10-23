import { useState } from "react";
import { useApp } from "../app/context";
import {
  columns,
  readSpreadsheet,
  previewImport,
  commitImport,
  importCSVTemplate,
  type ImportKind,
  type Spreadsheet,
  type ImportRow,
} from "../repositories/spreadsheet";
import { Field, Badge } from "../components/common";
import { download } from "../utils";
export function SpreadsheetImport() {
  const { run } = useApp();
  const [kind, setKind] = useState<ImportKind>("incoming");
  const [sheet, setSheet] = useState<Spreadsheet>();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ImportRow[]>();
  const [allow, setAllow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] =
    useState<Awaited<ReturnType<typeof commitImport>>>();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">IMPOR METADATA TANPA LAMPIRAN</p>
          <h1>Impor Register Surat</h1>
          <p className="muted">
            XLSX/CSV dibaca lokal. Data lama tidak ditimpa; kesalahan dan
            konflik dilewati dengan alasan.
          </p>
        </div>
        <button
          onClick={() =>
            download(
              new Blob([importCSVTemplate(kind)], {
                type: "text/csv;charset=utf-8",
              }),
              "template-" + kind + ".csv",
            )
          }
        >
          Unduh template CSV
        </button>
      </div>
      <section className="panel">
        <Field label="Register tujuan">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as ImportKind);
              setPreview(undefined);
              setResults(undefined);
            }}
          >
            <option value="incoming">Surat masuk</option>
            <option value="outgoing">
              Surat keluar (pengirim = penerima tujuan)
            </option>
          </select>
        </Field>
        <Field label="Pilih Excel XLSX atau CSV (maksimal 8 MB)">
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void run(async () => {
                  const s = await readSpreadsheet(file);
                  setSheet(s);
                  setMapping(
                    Object.fromEntries(
                      columns.map((k) => [
                        k,
                        s.headers.find((h) => h.toLowerCase() === k) || "",
                      ]),
                    ),
                  );
                  setPreview(undefined);
                  setResults(undefined);
                }, "Berkas terbaca. Periksa pemetaan kolom.");
            }}
          />
        </Field>
        {sheet && (
          <>
            <h2>Petakan kolom</h2>
            <div className="grid3">
              {columns.map((c) => (
                <Field key={c} label={c}>
                  <select
                    value={mapping[c] || ""}
                    onChange={(e) => {
                      setMapping({ ...mapping, [c]: e.target.value });
                      setPreview(undefined);
                    }}
                  >
                    <option value="">Tidak dipetakan</option>
                    {sheet.headers.map((h) => (
                      <option key={h}>{h}</option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <button
              className="primary"
              onClick={() =>
                run(
                  async () =>
                    setPreview(await previewImport(sheet, mapping, kind)),
                  "Pratinjau divalidasi tanpa mengubah database.",
                )
              }
            >
              Validasi & pratinjau
            </button>
          </>
        )}
        {preview && (
          <>
            <h2>Pratinjau {preview.length} baris</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Baris</th>
                    <th>Agenda / perihal</th>
                    <th>Kesalahan / kemungkinan duplikat</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>
                        {r.data.agenda}
                        <small>{r.data.perihal}</small>
                      </td>
                      <td>
                        {r.errors.length
                          ? r.errors.join("; ")
                          : r.warnings.length
                            ? r.warnings.join("; ")
                            : "Valid"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={allow}
                onChange={(e) => setAllow(e.target.checked)}
              />{" "}
              Saya meninjau dan mengizinkan kemungkinan duplikat (konflik agenda
              tetap ditolak)
            </label>
            <button
              className="primary"
              disabled={
                busy ||
                !preview.some(
                  (r) => !r.errors.length && (!r.warnings.length || allow),
                )
              }
              onClick={() => {
                if (
                  !confirm(
                    "Konfirmasi impor baris yang valid? Baris gagal dilewati dan tidak ada data lama ditimpa.",
                  )
                )
                  return;
                void run(async () => {
                  setBusy(true);
                  try {
                    setResults(
                      await commitImport(sheet!, mapping, kind, true, allow),
                    );
                  } finally {
                    setBusy(false);
                  }
                }, "Impor selesai. Periksa hasil per baris.");
              }}
            >
              {busy ? "Mengimpor…" : "Konfirmasi impor metadata"}
            </button>
          </>
        )}
        {results && (
          <div role="status">
            <h2>
              {results.filter((r) => r.status === "Berhasil").length} berhasil ·{" "}
              {results.filter((r) => r.status === "Dilewati").length} dilewati
            </h2>
            {results.map((r) => (
              <p key={r.row}>
                Baris {r.row}: <Badge>{r.status}</Badge> {r.reason}
              </p>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
