import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
} from "docx";
import type { DraftContent, MeetingMinutes } from "../types";
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
) {
  const rows = [
    ["Nomor", content.number || "Belum diberi nomor"],
    ["Tanggal", dateLabel(content.date)],
    ["Kepada", content.to],
    ["Dari", content.from],
    ["Perihal", content.subject],
  ];
  return Packer.toBlob(
    new Document({
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 1134, bottom: 1134, left: 1417, right: 1134 },
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
            ...rows.map(
              ([k, v]) =>
                new Paragraph({
                  children: [
                    new TextRun({ text: k + ": ", bold: true }),
                    new TextRun(v),
                  ],
                }),
            ),
            ...paras(
              "\nDasar:\n" +
                content.basis +
                "\n\n" +
                content.body +
                "\n\n" +
                content.closing,
            ),
            new Paragraph({
              text: "\n\n\n" + content.signer,
              alignment: AlignmentType.RIGHT,
            }),
            ...paras("Tembusan:\n" + content.copies),
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
