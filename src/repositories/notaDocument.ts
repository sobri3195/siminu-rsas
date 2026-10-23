import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  AlignmentType,
  WidthType,
  LineRuleType,
} from "docx";
import type { ServiceNote, NoteImage, Attachment } from "../types";
import { dateLabel } from "../utils";
export type Inline = { text: string; bold?: boolean; italics?: boolean };
export function inlineRuns(s: string): Inline[] {
  return s
    .split(/(\*\*[^*]+\*\*|_[^_]+_)/g)
    .filter(Boolean)
    .map((t) =>
      t.startsWith("**")
        ? { text: t.slice(2, -2), bold: true }
        : t.startsWith("_")
          ? { text: t.slice(1, -1), italics: true }
          : { text: t },
    );
}
export type RichBlock =
  | { kind: "paragraph"; text: string; list?: "number" | "letter" }
  | { kind: "table"; rows: string[][] };
export function richBlocks(s: string): RichBlock[] {
  const lines = s.replaceAll("\r", "").split("\n"),
    result: RichBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("|") && line.endsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = lines[i]
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((v) => v.trim());
        if (!row.every((v) => /^[-: ]+$/.test(v))) rows.push(row);
        i++;
      }
      i--;
      if (rows.length)
        result.push({
          kind: "table",
          rows: rows.map((r) =>
            Array.from(
              { length: Math.max(...rows.map((x) => x.length)) },
              (_, j) => r[j] || "",
            ),
          ),
        });
    } else
      result.push({
        kind: "paragraph",
        text: line,
        list: /^\d+\.\s/.test(line)
          ? "number"
          : /^[a-z]\.\s/.test(line)
            ? "letter"
            : undefined,
      });
  }
  return result;
}
export interface PreparedImage {
  data: Uint8Array;
  url: string;
  width: number;
  height: number;
}
export async function prepareNoteImage(
  file: Attachment,
  config: NoteImage,
): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file.blob);
  const crop = config.crop,
    sx = (bitmap.width * crop.left) / 100,
    sy = (bitmap.height * crop.top) / 100;
  const sw = bitmap.width * (1 - (crop.left + crop.right) / 100),
    sh = bitmap.height * (1 - (crop.top + crop.bottom) / 100);
  const swap = config.rotation === 90 || config.rotation === 270;
  const scale = Math.min(1, 1800 / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((swap ? sh : sw) * scale);
  canvas.height = Math.round((swap ? sw : sh) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw Error("Gambar tidak dapat diproses browser.");
  }
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((config.rotation * Math.PI) / 180);
  ctx.drawImage(
    bitmap,
    sx,
    sy,
    sw,
    sh,
    (-sw * scale) / 2,
    (-sh * scale) / 2,
    sw * scale,
    sh * scale,
  );
  bitmap.close();
  const url = canvas.toDataURL("image/png"),
    data = new Uint8Array(await (await fetch(url)).arrayBuffer());
  return { data, url, width: canvas.width, height: canvas.height };
}
export type NoteNode =
  | {
      kind: "text";
      text: string;
      align?: "center" | "right";
      bold?: boolean;
      keep?: boolean;
      label?: string;
    }
  | { kind: "rich"; blocks: RichBlock[] }
  | { kind: "signature"; lines: string[] }
  | { kind: "image"; config: NoteImage; index: number };
export function noteDocument(n: ServiceNote, demo: boolean): NoteNode[] {
  const c = n.content,
    signDate = c.signer.date
      ? dateLabel(c.signer.date)
      : "[tanggal penandatanganan belum ditetapkan]";
  const mark =
    n.status === "Dibatalkan" || n.archiveFrom === "Dibatalkan"
      ? "DIBATALKAN"
      : !n.officialNumber
        ? "DRAF"
        : "";
  const nodes: NoteNode[] = [
    ...c.format.heading
      .split("\n")
      .map((text) => ({ kind: "text" as const, text, bold: true })),
    { kind: "text", text: "NOTA DINAS", align: "center", bold: true },
    {
      kind: "text",
      text: mark + (demo ? (mark ? " · " : "") + "CONTOH/DEMO" : ""),
      align: "center",
    },
    {
      kind: "text",
      text: "Nomor " + (n.officialNumber || "[BELUM BERNOMOR — KONSEP]"),
      align: "center",
    },
    { kind: "text", text: c.to, label: "Kepada" },
    { kind: "text", text: c.from, label: "Dari" },
    { kind: "text", text: c.subject, label: "Perihal" },
    {
      kind: "text",
      text: c.urgency + " / " + c.classification,
      label: "Derajat / Klasifikasi",
    },
    { kind: "text", text: "1. Dasar.", bold: true, keep: true },
    {
      kind: "rich",
      blocks: richBlocks(
        c.basis
          .filter((x) => x.trim())
          .map((x, i) => String.fromCharCode(97 + i) + ". " + x)
          .join("\n"),
      ),
    },
    {
      kind: "text",
      text:
        "2. " +
        (c.category === "Laporan"
          ? "Laporan."
          : c.category === "Usulan"
            ? "Usulan."
            : "Isi."),
      bold: true,
      keep: true,
    },
    {
      kind: "rich",
      blocks: richBlocks(
        [c.opening, c.discussion, c.request].filter(Boolean).join("\n\n"),
      ),
    },
    { kind: "text", text: "3. Penutup.", bold: true, keep: true },
    { kind: "rich", blocks: richBlocks(c.closing) },
    {
      kind: "signature",
      lines: [
        c.signer.city + ", " + signDate,
        c.signer.title + ",",
        "",
        c.signer.name,
        [c.signer.rank, c.signer.serviceNumber].filter(Boolean).join(" "),
      ],
    },
  ];
  if (c.copies.trim())
    nodes.push(
      { kind: "text", text: "Tembusan:", bold: true, keep: true },
      { kind: "rich", blocks: richBlocks(c.copies) },
    );
  const separate = c.attachments.filter((a) => !a.inline);
  if (separate.length) {
    nodes.push({
      kind: "text",
      text: attachmentHeading(n),
      bold: true,
      keep: true,
    });
    separate.forEach((a, i) =>
      nodes.push({
        kind: "text",
        text:
          "Berkas terpisah " +
          (i + 1) +
          ". " +
          a.title +
          (a.caption ? " — " + a.caption : "") +
          (a.source ? " (Sumber: " + a.source + ")" : ""),
      }),
    );
  }
  c.attachments
    .filter((a) => a.inline)
    .forEach((a, i) => nodes.push({ kind: "image", config: a, index: i + 1 }));
  return nodes;
}
export function attachmentHeading(n: ServiceNote) {
  return (
    "LAMPIRAN NOTA DINAS\nNomor: " +
    (n.officialNumber || "[BELUM BERNOMOR — DRAF]") +
    "\nTanggal: " +
    (n.content.signer.date
      ? dateLabel(n.content.signer.date)
      : "[BELUM DITETAPKAN]")
  );
}
export function imageSize(image: PreparedImage, a: NoteImage, n: ServiceNote) {
  let width =
    (Math.min(a.width, 210 - n.content.format.left - n.content.format.right) *
      96) /
    25.4;
  let height = (width * image.height) / image.width;
  const maxHeight = (180 * 96) / 25.4;
  if (height > maxHeight) {
    width *= maxHeight / height;
    height = maxHeight;
  }
  return { width, height };
}
export async function noteDocx(
  n: ServiceNote,
  files: Attachment[],
  demo: boolean,
) {
  const c = n.content,
    children: (Paragraph | Table)[] = [];
  const para = (text: string, options: Record<string, unknown> = {}) =>
    new Paragraph({
      children: inlineRuns(text).flatMap((x) =>
        x.text.split("\n").map(
          (t, i) =>
            new TextRun({
              ...x,
              text: t,
              break: i ? 1 : undefined,
              color: "000000",
            }),
        ),
      ),
      alignment: AlignmentType.JUSTIFIED,
      spacing: {
        after: c.format.paragraphAfter * 20,
        line: Math.round(240 * c.format.lineSpacing),
      },
      ...options,
    });
  for (const node of noteDocument(n, demo)) {
    if (node.kind === "text")
      children.push(
        para((node.label ? node.label + " : " : "") + node.text, {
          alignment:
            node.align === "center"
              ? AlignmentType.CENTER
              : node.align === "right"
                ? AlignmentType.RIGHT
                : AlignmentType.LEFT,
          keepNext: node.keep,
          children: [
            ...((node.label ? node.label + " : " : "") + node.text)
              .split("\n")
              .map(
                (t, i) =>
                  new TextRun({
                    text: t,
                    bold: node.bold,
                    break: i ? 1 : undefined,
                    color: "000000",
                  }),
              ),
          ],
        }),
      );
    if (node.kind === "rich")
      for (const b of node.blocks) {
        if (b.kind === "paragraph")
          children.push(
            para(b.text, {
              indent: b.list ? { left: 360, hanging: 240 } : undefined,
            }),
          );
        else
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: b.rows.map(
                (r, i) =>
                  new TableRow({
                    tableHeader: i === 0,
                    children: r.map(
                      (t) =>
                        new TableCell({
                          children: [
                            para(t, {
                              children: inlineRuns(t).map(
                                (x) =>
                                  new TextRun({
                                    ...x,
                                    bold: i === 0 || x.bold,
                                  }),
                              ),
                            }),
                          ],
                        }),
                    ),
                  }),
              ),
            }),
          );
      }
    if (node.kind === "signature")
      node.lines.forEach((t, i) =>
        children.push(
          para(t, {
            alignment: AlignmentType.CENTER,
            indent: {
              left: Math.round(
                (210 - c.format.left - c.format.right) * 56.693 * 0.45,
              ),
            },
            keepNext: i < node.lines.length - 1,
            spacing:
              i === 2
                ? {
                    line: Math.round(c.format.signatureSpace * 56.693),
                    lineRule: LineRuleType.EXACT,
                    after: 0,
                  }
                : { after: 60 },
          }),
        ),
      );
    if (node.kind === "image") {
      const a = node.config,
        file = files.find((f) => f.id === a.id);
      if (!file) throw Error("Lampiran gambar hilang: " + a.title);
      const img = await prepareNoteImage(file, a),
        size = imageSize(img, a, n);
      children.push(
        para(attachmentHeading(n), {
          pageBreakBefore: true,
          keepNext: true,
          alignment: AlignmentType.LEFT,
        }),
      );
      children.push(
        para(a.title, { keepNext: true, alignment: AlignmentType.CENTER }),
      );
      children.push(
        new Paragraph({
          children: [
            new ImageRun({ type: "png", data: img.data, transformation: size }),
          ],
          alignment: AlignmentType.CENTER,
          keepNext: true,
        }),
      );
      children.push(
        para(
          "Gambar " +
            node.index +
            ". " +
            a.caption +
            (a.source ? "\nSumber: " + a.source : ""),
          { alignment: AlignmentType.CENTER },
        ),
      );
    }
  }
  return Packer.toBlob(
    new Document({
      styles: {
        default: {
          document: {
            run: {
              font: c.format.font,
              size: c.format.fontSize * 2,
              color: "000000",
            },
            paragraph: {},
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: Object.fromEntries(
                ["top", "bottom", "left", "right"].map((k) => [
                  k,
                  Math.round(c.format[k as "top"] * 56.693),
                ]),
              ),
            },
          },
          children,
        },
      ],
    }),
  );
}
