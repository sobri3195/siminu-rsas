import { z } from "zod";
import { noteStatuses } from "../types";
const text = z.string().max(100000);
export const noteSignerSchema = z.object({
  title: text,
  name: text,
  rank: text,
  serviceNumber: text,
  city: text,
  date: z.union([z.iso.date(), z.literal("")]),
});
export const noteFormatSchema = z
  .object({
    heading: text,
    font: z.enum(["Times New Roman", "Arial"]),
    fontSize: z.number().min(9).max(16),
    lineSpacing: z.number().min(1).max(2),
    paragraphAfter: z.number().min(0).max(18),
    signatureSpace: z.number().min(15).max(50),
    top: z.number().min(10).max(40),
    bottom: z.number().min(10).max(40),
    left: z.number().min(10).max(40),
    right: z.number().min(10).max(40),
    numberPattern: z
      .string()
      .min(1)
      .max(200)
      .refine(
        (v) =>
          ["{seq}", "{month}", "{year}", "{unit}", "{register}"].every((k) =>
            v.includes(k),
          ),
        "Pola harus memuat {seq}, {month}, {year}, {unit}, {register}.",
      ),
    register: z.string().min(1).max(30),
    unitCode: z.string().min(1).max(30),
    verified: z.boolean(),
    source: text,
  })
  .refine(
    (v) => !v.verified || !!v.source.trim(),
    "Cantumkan sumber format yang telah diperiksa.",
  );
export const noteContentSchema = z.object({
  unitId: z.string(),
  category: z.enum(["Permohonan", "Laporan", "Pemberitahuan", "Usulan"]),
  to: text,
  from: text,
  subject: text,
  conceptDate: z.iso.date(),
  conceptNumber: text,
  urgency: text,
  classification: text,
  basis: z.array(text).max(100),
  opening: text,
  discussion: text,
  request: text,
  closing: text,
  copies: text,
  signer: noteSignerSchema,
  format: noteFormatSchema,
  attachments: z
    .array(
      z.object({
        id: z.string(),
        title: text,
        caption: text,
        source: text,
        inline: z.boolean(),
        width: z.number().min(10).max(180),
        rotation: z.union([
          z.literal(0),
          z.literal(90),
          z.literal(180),
          z.literal(270),
        ]),
        crop: z.object({
          top: z.number().min(0).max(40),
          right: z.number().min(0).max(40),
          bottom: z.number().min(0).max(40),
          left: z.number().min(0).max(40),
        }),
      }),
    )
    .max(100),
  letterId: z.string(),
  dispositionId: z.string(),
  taskId: z.string(),
});
const base = z.object({ id: z.string().min(1) });
const body = noteContentSchema.pick({
  subject: true,
  basis: true,
  opening: true,
  discussion: true,
  request: true,
  closing: true,
});
export const notaSchemas = {
  notes: base.extend({
    content: noteContentSchema,
    authorId: z.string(),
    status: z.enum(noteStatuses),
    version: z.number().int().positive(),
    revision: z.number().int().positive(),
    reviewerIds: z.array(z.string()),
    reviewIndex: z.number().int().nonnegative(),
    approvedVersion: z.number().int().positive().optional(),
    officialNumber: z.string(),
    outgoingId: z.string().optional(),
    sentAt: z.iso.datetime().optional(),
    sentVia: z.string().optional(),
    cancelledReason: z.string().optional(),
    archiveFrom: z.enum(noteStatuses).optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),
  noteVersions: base.extend({
    noteId: z.string(),
    version: z.number().int().positive(),
    status: z.enum(noteStatuses),
    officialNumber: z.string(),
    content: noteContentSchema,
    userId: z.string(),
    reason: z.string(),
    createdAt: z.iso.datetime(),
  }),
  noteReviews: base.extend({
    noteId: z.string(),
    version: z.number().int().positive(),
    action: z.string(),
    section: z.string(),
    note: z.string(),
    userId: z.string(),
    createdAt: z.iso.datetime(),
  }),
  noteTemplates: base.extend({
    name: z.string().min(1),
    instructions: z.string(),
    category: z.enum(["Permohonan", "Laporan", "Pemberitahuan", "Usulan"]),
    body,
  }),
  noteProfiles: base.extend({
    name: z.string().min(1),
    unitId: z.string(),
    from: z.string(),
    signer: noteSignerSchema,
    format: noteFormatSchema,
  }),
  noteNumbers: base.extend({
    noteId: z.string(),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime(),
  }),
};
