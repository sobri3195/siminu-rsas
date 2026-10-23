import { richBlocks, inlineRuns } from "./notaDocument";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  WidthType,
} from "docx";
import type { DraftContent, MeetingMinutes, Attachment } from "../types";
import { dateLabel } from "../utils";
const paras = (text: string) =>
  text.split("\n").map(
    (line) =>
      new Paragraph({
        children: [new TextRun(line)],
        spacing: { after: 120 },
      }),
  );
export async function draftDocx(
  kind: string,
  content: DraftContent,
  official = false,
  files: Attachment[] = [],
) {
  const rich = (text: string) =>
    richBlocks(text).map((b) =>
      b.kind === "table"
        ? new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: b.rows.map(
              (row, j) =>
                new TableRow({
                  tableHeader: j === 0,
                  children: row.map(
                    (cell) =>
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: inlineRuns(cell).map(
                              (r) => new TextRun(r),
                            ),
                          }),
                        ],
                      }),
                  ),
                }),
            ),
          })
        : new Paragraph({
            children: inlineRuns(b.text).map((r) => new TextRun(r)),
            spacing: { after: 120 },
          }),
    );
  const attachmentNodes: (Paragraph | Table)[] = [];
  for (const [i, f] of files.entries()) {
    attachmentNodes.push(
      new Paragraph({
        text: `Lampiran ${i + 1} · ${content.number || content.conceptNumber || "DRAF"} · ${f.title || f.name}`,
        pageBreakBefore: true,
        keepNext: true,
      }),
    );
    if (f.type.startsWith("image/")) {
      const bmp = await createImageBitmap(f.blob);
      const scale = Math.min(530 / bmp.width, 600 / bmp.height, 1);
      const w = bmp.width * scale,
        h = bmp.height * scale;
      bmp.close();
      attachmentNodes.push(
        new Paragraph({
          keepNext: true,
          children: [
            new ImageRun({
              type: f.type === "image/jpeg" ? "jpg" : "png",
              data: new Uint8Array(await f.blob.arrayBuffer()),
              transformation: { width: w, height: h },
            }),
          ],
        }),
      );
    } else
      attachmentNodes.push(
        new Paragraph({
          text: f.name + " — berkas terpisah, unduh lampiran asli.",
          keepNext: true,
        }),
      );
    attachmentNodes.push(
      new Paragraph({ text: f.caption || "", keepLines: true }),
    );
  }
  const rows = [
    ["Nomor", content.number || "Belum diberi nomor"],
    ["Tanggal", dateLabel(content.date)],
    ["Kepada", content.to],
    ["Dari", content.from],
    ["Perihal", content.subject],
  ];
  return Packer.toBlob(
    new Document({
      styles: {
        default: {
          document: {
            run: {
              font: content.font || "Times New Roman",
              size: 24,
              color: "000000",
            },
          },
        },
        paragraphStyles: [
          {
            id: "Heading1",
            name: "Heading 1",
            basedOn: "Normal",
            run: { color: "000000", bold: true },
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: {
                top: Number(content.margin || 25) * 56.69,
                bottom: Number(content.margin || 25) * 56.69,
                left: Number(content.margin || 25) * 56.69,
                right: Number(content.margin || 25) * 56.69,
              },
            },
          },
          children: [
            ...paras(content.heading),
            new Paragraph({
              text: kind.toUpperCase(),
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              text: official
                ? "CONTOH/DEMO"
                : "CONTOH/DEMO — TEMPLATE GENERIK, BUKAN FORMAT RESMI",
              alignment: AlignmentType.CENTER,
            }),
            ...paras(content.number ? "" : "DRAF — BELUM DITERBITKAN"),
            ...rows.map(
              ([k, v]) =>
                new Paragraph({
                  children: [
                    new TextRun({ text: k + ": ", bold: true }),
                    new TextRun(v),
                  ],
                }),
            ),
            ...rich(
              [
                content.address,
                content.conceptNumber,
                content.referenceText,
                content.basis,
                content.opening,
                content.body,
                content.closing,
              ]
                .filter(Boolean)
                .join("\n"),
            ),
            new Paragraph({
              text: "Lampiran: " + (content.attachmentCount || files.length),
            }),
            new Paragraph({
              children: content.signer
                .split("\n")
                .map(
                  (line, i) => new TextRun({ text: line, break: i ? 1 : 0 }),
                ),
              spacing: { before: 900 },
              alignment: AlignmentType.RIGHT,
              keepLines: true,
            }),
            ...rich("Tembusan:\n" + content.copies),
            ...attachmentNodes,
          ],
        },
      ],
    }),
  );
}
export async function minutesDocx(m: MeetingMinutes) {
  return draftDocx("Notulen rapat", {
    heading: "RSAU Prof. dr. Abdulrachman Saleh",
    number: "",
    date: m.date,
    to: m.participants,
    from: m.chair,
    subject: m.title,
    basis: "Agenda terkait: " + (m.agendaId || "—"),
    body:
      m.discussion +
      "\n\nKeputusan:\n" +
      m.decisions
        .map((d, i) => `${i + 1}. ${d.text} — ${d.deadline}`)
        .join("\n"),
    closing: "",
    copies: "",
    signer: m.chair,
  });
}
