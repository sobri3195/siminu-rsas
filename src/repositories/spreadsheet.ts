import Papa from "papaparse";
import { readSheet as readXlsxFile } from "read-excel-file/browser";
import { db } from "../storage/db";
import { z } from "zod";
import { id, now } from "../utils";
import { csvCell } from "../utils/csv";
export type ImportKind = "incoming" | "outgoing";
export const columns = [
  "agenda",
  "pengirim",
  "nomor",
  "tanggal",
  "diterima",
  "perihal",
  "jenis",
  "derajat",
  "klasifikasi",
  "unit",
] as const;
export interface Spreadsheet {
  headers: string[];
  rows: string[][];
}
export interface ImportRow {
  row: number;
  data: Record<string, string>;
  errors: string[];
  warnings: string[];
}
function cell(value: unknown) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value ?? "").trim();
}
export async function readSpreadsheet(file: File): Promise<Spreadsheet> {
  if (file.size > 8 * 1024 * 1024) throw Error("Batas impor metadata 8 MB.");
  let values: string[][];
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    values = (await readXlsxFile(file)).map((row) => row.map(cell));
  } else if (file.name.toLowerCase().endsWith(".csv")) {
    const parsed = Papa.parse<string[]>(await file.text(), {
      skipEmptyLines: true,
    });
    if (parsed.errors.length)
      throw Error("CSV tidak dapat dibaca: " + parsed.errors[0].message);
    values = parsed.data.map((row) => row.map(cell));
  } else throw Error("Gunakan .xlsx atau .csv.");
  if (values.length < 2 || values.length > 5001)
    throw Error("Isi 1–5.000 baris data dan satu baris judul kolom.");
  const [headers, ...rows] = values;
  if (new Set(headers).size !== headers.length || headers.some((h) => !h))
    throw Error("Judul kolom harus terisi dan unik.");
  return { headers, rows };
}
function normalizeDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}
export async function previewImport(
  sheet: Spreadsheet,
  mapping: Record<string, string>,
  kind: ImportKind,
): Promise<ImportRow[]> {
  const [letters, outgoing, units, catalogs] = await Promise.all([
    db.letters.toArray(),
    db.outgoing.toArray(),
    db.units.toArray(),
    db.catalogs.toArray(),
  ]);
  const seen = new Set<string>();
  return sheet.rows.map((row, index) => {
    const data = Object.fromEntries(
      columns.map((k) => [
        k,
        row[sheet.headers.indexOf(mapping[k] || "")] || "",
      ]),
    );
    data.tanggal = normalizeDate(data.tanggal);
    data.diterima = normalizeDate(data.diterima || data.tanggal);
    const errors: string[] = [],
      warnings: string[] = [];
    for (const key of [
      "agenda",
      "pengirim",
      "nomor",
      "tanggal",
      "perihal",
      "jenis",
    ])
      if (!data[key].trim()) errors.push(`${key} wajib diisi`);
    if (
      !z.iso.date().safeParse(data.tanggal).success ||
      !z.iso.date().safeParse(data.diterima).success
    )
      errors.push("Tanggal harus valid (YYYY-MM-DD atau DD/MM/YYYY)");
    for (const [key, category] of [
      ["jenis", "kind"],
      ["derajat", "urgency"],
      ["klasifikasi", "classification"],
    ]) {
      const value = data[key];
      if (
        value &&
        !catalogs.some(
          (c) => c.category === category && c.name === value && c.active,
        )
      )
        errors.push(`Master ${key} tidak dikenal/nonaktif`);
    }
    if (data.unit) {
      const unit = units.find(
        (u) => u.active && (u.id === data.unit || u.name === data.unit),
      );
      if (unit) data.unit = unit.id;
      else errors.push("Unit tidak dikenal/nonaktif");
    }
    const year = (kind === "incoming" ? data.diterima : data.tanggal).slice(
        0,
        4,
      ),
      key = year + ":" + data.agenda;
    if (seen.has(key)) errors.push("Nomor agenda ganda dalam berkas");
    seen.add(key);
    if (kind === "incoming") {
      if (
        letters.some(
          (l) => l.agenda === data.agenda && l.received.slice(0, 4) === year,
        )
      )
        errors.push("Nomor agenda konflik dengan data tersimpan");
      if (
        letters.some(
          (l) =>
            l.sender === data.pengirim &&
            l.number === data.nomor &&
            l.date === data.tanggal,
        )
      )
        warnings.push(
          "Kemungkinan surat duplikat: pengirim, nomor dan tanggal sama",
        );
    } else {
      if (
        outgoing.some(
          (l) =>
            l.agenda === data.agenda &&
            (l.documentDate || l.createdAt).slice(0, 4) === year,
        )
      )
        errors.push("Nomor agenda konflik dengan data tersimpan");
      if (
        outgoing.some(
          (l) => l.recipient === data.pengirim && l.number === data.nomor,
        )
      )
        warnings.push("Kemungkinan duplikat nomor/penerima surat keluar");
    }
    return { row: index + 2, data, errors, warnings };
  });
}
export async function commitImport(
  sheet: Spreadsheet,
  mapping: Record<string, string>,
  kind: ImportKind,
  confirmed: boolean,
  allowPossibleDuplicates = false,
) {
  if (!confirmed) throw Error("Konfirmasi pratinjau sebelum impor.");
  return db.transaction("rw", db.tables, async () => {
    const rows = await previewImport(sheet, mapping, kind);
    const results: {
      row: number;
      status: string;
      reason: string;
      id?: string;
    }[] = [];
    for (const row of rows) {
      if (
        row.errors.length ||
        (row.warnings.length && !allowPossibleDuplicates)
      ) {
        results.push({
          row: row.row,
          status: "Dilewati",
          reason: [...row.errors, ...row.warnings].join("; "),
        });
        continue;
      }
      const d = row.data,
        lid = id();
      if (kind === "incoming")
        await db.letters.add({
          id: lid,
          targetUnitId: d.unit || undefined,
          agenda: d.agenda,
          sender: d.pengirim,
          number: d.nomor,
          date: d.tanggal,
          received: d.diterima,
          subject: d.perihal,
          kind: d.jenis,
          urgency: d.derajat || "Biasa",
          classification: d.klasifikasi || "Biasa",
          summary:
            "Metadata dari impor spreadsheet; lampiran belum ditambahkan.",
          status: "Terdaftar",
          attachmentIds: [],
          revision: 1,
          register: "SM",
          year: d.diterima.slice(0, 4),
          createdAt: now(),
          updatedAt: now(),
        });
      else
        await db.outgoing.add({
          id: lid,
          agenda: d.agenda,
          subject: d.perihal,
          recipient: d.pengirim,
          number: d.nomor,
          kind: d.jenis,
          unitId: d.unit || undefined,
          classification: d.klasifikasi || "Biasa",
          status: "Draf",
          attachmentIds: [],
          createdAt: now(),
          documentDate: d.tanggal,
        });
      if (kind === "incoming")
        await db.activities.add({
          id: id(),
          letterId: lid,
          text: "Metadata diimpor dari spreadsheet (tanpa lampiran)",
          author: "Pengguna simulasi",
          createdAt: now(),
        });
      results.push({
        row: row.row,
        status: "Berhasil",
        reason: "Metadata baru dibuat tanpa menimpa data lama",
        id: lid,
      });
    }
    return results;
  });
}
export function importCSVTemplate(kind: ImportKind) {
  const example = [
    "0999/" + (kind === "incoming" ? "SM" : "SK") + "/2026",
    kind === "incoming" ? "Instansi Contoh" : "Penerima Contoh",
    "B/Contoh/2026",
    "2026-10-23",
    "2026-10-23",
    "Perihal contoh",
    "Surat dinas",
    "Biasa",
    "Biasa",
    "",
  ];
  return (
    "\ufeff" +
    [columns, example].map((row) => row.map(csvCell).join(",")).join("\r\n")
  );
}
