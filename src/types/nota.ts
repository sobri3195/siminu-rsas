export const noteStatuses = [
  "Draf",
  "Diajukan",
  "Dalam pemeriksaan",
  "Perlu perbaikan",
  "Disetujui",
  "Bernomor",
  "Tercatat dikirim",
  "Diarsipkan",
  "Dibatalkan",
] as const;
export type NoteStatus = (typeof noteStatuses)[number];
export interface NoteFormat {
  heading: string;
  font: "Times New Roman" | "Arial";
  fontSize: number;
  lineSpacing: number;
  paragraphAfter: number;
  signatureSpace: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  numberPattern: string;
  register: string;
  unitCode: string;
  verified: boolean;
  source: string;
}
export interface NoteSigner {
  title: string;
  name: string;
  rank: string;
  serviceNumber: string;
  city: string;
  date: string;
}
export interface NoteImage {
  id: string;
  title: string;
  caption: string;
  source: string;
  inline: boolean;
  width: number;
  rotation: 0 | 90 | 180 | 270;
  crop: { top: number; right: number; bottom: number; left: number };
}
export interface NoteContent {
  unitId: string;
  category: "Permohonan" | "Laporan" | "Pemberitahuan" | "Usulan";
  to: string;
  from: string;
  subject: string;
  conceptDate: string;
  conceptNumber: string;
  urgency: string;
  classification: string;
  basis: string[];
  opening: string;
  discussion: string;
  request: string;
  closing: string;
  copies: string;
  signer: NoteSigner;
  format: NoteFormat;
  attachments: NoteImage[];
  letterId: string;
  dispositionId: string;
  taskId: string;
}
export interface ServiceNote {
  id: string;
  content: NoteContent;
  authorId: string;
  status: NoteStatus;
  version: number;
  revision: number;
  reviewerIds: string[];
  reviewIndex: number;
  approvedVersion?: number;
  officialNumber: string;
  outgoingId?: string;
  sentAt?: string;
  sentVia?: string;
  cancelledReason?: string;
  archiveFrom?: NoteStatus;
  createdAt: string;
  updatedAt: string;
}
export interface NoteVersion {
  id: string;
  noteId: string;
  version: number;
  status: NoteStatus;
  officialNumber: string;
  content: NoteContent;
  userId: string;
  reason: string;
  createdAt: string;
}
export interface NoteReview {
  id: string;
  noteId: string;
  version: number;
  action: string;
  section: string;
  note: string;
  userId: string;
  createdAt: string;
}
export interface NoteTemplate {
  id: string;
  name: string;
  instructions: string;
  category: NoteContent["category"];
  body: Pick<
    NoteContent,
    "subject" | "basis" | "opening" | "discussion" | "request" | "closing"
  >;
}
export interface NoteProfile {
  id: string;
  name: string;
  unitId: string;
  from: string;
  signer: NoteSigner;
  format: NoteFormat;
}
export interface NoteNumber {
  id: string;
  noteId: string;
  version: number;
  createdAt: string;
}
