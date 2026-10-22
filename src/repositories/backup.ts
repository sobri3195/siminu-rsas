import { z } from "zod";
import { db } from "../storage/db";
import { download } from "../utils";
const base = z.object({ id: z.string().min(1) }).passthrough();
const letter = base.extend({
  agenda: z.string(),
  sender: z.string(),
  number: z.string(),
  date: z.iso.date(),
  received: z.iso.date(),
  subject: z.string(),
  kind: z.string(),
  urgency: z.string(),
  classification: z.string(),
  summary: z.string(),
  status: z.enum([
    "Draf",
    "Terdaftar",
    "Menunggu disposisi",
    "Dalam tindak lanjut",
    "Selesai",
    "Diarsipkan",
  ]),
  attachmentIds: z.array(z.string()),
  createdAt: z.iso.datetime(),
});
const recipient = z.object({
  unitId: z.string(),
  unitName: z.string(),
  userId: z.string(),
  kind: z.enum(["Utama", "Pendukung", "Tembusan"]),
  instruction: z.string(),
  deadline: z.iso.date(),
});
const disposition = base.extend({
  letterId: z.string(),
  giver: z.string(),
  recipients: z.array(recipient),
  instructions: z.array(z.string()),
  notes: z.string(),
  deadline: z.iso.date(),
  review: z.boolean(),
  createdAt: z.iso.datetime(),
  cancelled: z.boolean().optional(),
});
const task = base.extend({
  letterId: z.string(),
  dispositionId: z.string(),
  unitId: z.string(),
  unitName: z.string(),
  userId: z.string(),
  instruction: z.string(),
  deadline: z.iso.date(),
  status: z.enum([
    "Belum dibaca",
    "Dibaca",
    "Diterima",
    "Diproses",
    "Hasil dikirim",
    "Perlu perbaikan",
    "Selesai",
  ]),
  review: z.boolean(),
  createdAt: z.iso.datetime(),
});
const schemas = {
  letters: letter,
  outgoing: base.extend({
    subject: z.string(),
    recipient: z.string(),
    number: z.string(),
    status: z.string(),
    createdAt: z.iso.datetime(),
  }),
  dispositions: disposition,
  tasks: task,
  units: base.extend({
    name: z.string(),
    active: z.boolean(),
    order: z.number(),
    parentId: z.string().optional(),
    userId: z.string().optional(),
  }),
  users: base.extend({
    name: z.string(),
    role: z.enum([
      "Admin Sistem",
      "Petugas Urtu/Administrasi",
      "Kepala RSAU",
      "Kepala Unit",
      "Pelaksana",
    ]),
    unitId: z.string(),
    active: z.boolean(),
  }),
  positions: base.extend({ name: z.string(), unitId: z.string() }),
  progress: base.extend({
    taskId: z.string(),
    text: z.string(),
    author: z.string(),
    createdAt: z.iso.datetime(),
  }),
  reports: base.extend({
    taskId: z.string(),
    action: z.string(),
    date: z.iso.date(),
    result: z.string(),
    obstacles: z.string(),
    next: z.string(),
    attachmentIds: z.array(z.string()),
    createdAt: z.iso.datetime(),
  }),
  comments: base.extend({
    letterId: z.string(),
    text: z.string(),
    author: z.string(),
    createdAt: z.iso.datetime(),
  }),
  events: base.extend({
    title: z.string(),
    date: z.iso.date(),
    location: z.string(),
  }),
  notifications: base.extend({
    text: z.string(),
    letterId: z.string(),
    read: z.boolean(),
    createdAt: z.iso.datetime(),
  }),
  activities: base.extend({
    letterId: z.string(),
    text: z.string(),
    author: z.string(),
    createdAt: z.iso.datetime(),
  }),
  settings: base.extend({
    official: z.string(),
    rank: z.string(),
    nrp: z.string(),
    printDate: z.iso.date(),
    timezone: z.string(),
    extraInstructions: z.string(),
  }),
};
export const backupSchema = z.object({
  version: z.literal(1),
  tables: z.object(
    Object.fromEntries(
      Object.entries(schemas).map(([k, v]) => [k, z.array(v)]),
    ) as { [K in keyof typeof schemas]: z.ZodArray<(typeof schemas)[K]> },
  ),
});
export async function exportBackup() {
  const tables: Record<string, unknown> = {};
  for (const name of Object.keys(schemas))
    tables[name] = await db.table(name).toArray();
  download(
    new Blob([JSON.stringify({ version: 1, tables }, null, 2)], {
      type: "application/json",
    }),
    "siminu-rsas-metadata.json",
  );
}
export async function importBackup(file: File, replace: boolean) {
  const data = backupSchema.parse(JSON.parse(await file.text()));
  for (const [name, rows] of Object.entries(data.tables)) {
    if (new Set(rows.map((r) => r.id)).size !== rows.length)
      throw Error(`ID ganda dalam ${name}`);
  }
  await db.transaction("rw", db.tables, async () => {
    if (replace)
      for (const t of db.tables) if (t.name !== "attachments") await t.clear();
    for (const [name, rows] of Object.entries(data.tables))
      await db.table(name).bulkPut(rows);
  });
}
