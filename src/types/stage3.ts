export const draftKinds = [
  "Nota dinas",
  "Surat undangan",
  "Surat pengantar",
  "Surat tugas",
  "Laporan kegiatan",
  "Surat dinas",
  "Template kosong",
] as const;
export type DraftKind = (typeof draftKinds)[number];
export interface DraftContent {
  conceptNumber?: string;
  address?: string;
  opening?: string;
  referenceText?: string;
  attachmentCount?: string;
  font?: string;
  margin?: string;
  heading: string;
  number: string;
  date: string;
  to: string;
  from: string;
  subject: string;
  basis: string;
  body: string;
  closing: string;
  copies: string;
  signer: string;
}
export interface DraftTemplate {
  id: string;
  name: string;
  kind: DraftKind;
  official: boolean;
  content: DraftContent;
  updatedAt: string;
}
export type DraftStage =
  | "Draf"
  | "Pemeriksaan"
  | "Perbaikan"
  | "Persetujuan"
  | "Penomoran"
  | "Pengiriman"
  | "Tercatat dikirim"
  | "Diarsipkan";
export interface OfficialDraft {
  integrated?: boolean;
  incomingIds?: string[];
  supersedesId?: string;
  templateOfficial?: boolean;
  templateName?: string;
  templateUpdatedAt?: string;
  id: string;
  templateId: string;
  kind: DraftKind;
  content: DraftContent;
  unitId: string;
  authorId: string;
  reviewerIds: string[];
  reviewIndex: number;
  version: number;
  revision: number;
  stage: DraftStage;
  reviewingVersion?: number;
  approvedVersion?: number;
  outgoingId?: string;
  attachmentIds: string[];
  createdAt: string;
  updatedAt: string;
}
export interface DraftVersion {
  stage?: DraftStage;
  attachmentIds?: string[];
  incomingIds?: string[];
  id: string;
  draftId: string;
  version: number;
  content: DraftContent;
  authorId: string;
  reason: string;
  createdAt: string;
}
export interface DraftDecision {
  snapshot?: {
    content: DraftContent;
    attachmentIds: string[];
    incomingIds: string[];
    stage: DraftStage;
  };
  section?: string;
  id: string;
  draftId: string;
  version: number;
  action:
    | "Diajukan"
    | "Dikembalikan"
    | "Paraf simulasi"
    | "Disetujui simulasi"
    | "Diberi nomor"
    | "Persetujuan tidak berlaku"
    | "Dipulihkan"
    | "Catatan pemeriksaan"
    | "Revisi diterbitkan"
    | "Diarsipkan";
  userId: string;
  note: string;
  createdAt: string;
}
export interface MeetingDecision {
  id: string;
  text: string;
  userId: string;
  unitId: string;
  deadline: string;
  taskId?: string;
}
export interface MeetingMinutes {
  id: string;
  title: string;
  date: string;
  chair: string;
  participants: string;
  discussion: string;
  decisions: MeetingDecision[];
  agendaId?: string;
  letterId?: string;
  attachmentIds: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export type LinkKind =
  | "notes"
  | "letters"
  | "dispositions"
  | "tasks"
  | "outgoing"
  | "events"
  | "minutes"
  | "reports"
  | "drafts";
export interface CaseFile {
  id: string;
  title: string;
  description: string;
  links: { kind: LinkKind; id: string }[];
  createdAt: string;
  updatedAt: string;
}
export interface SearchPage {
  id: string;
  attachmentId: string;
  page: number;
  text: string;
  status: "text" | "scan" | "error";
  message?: string;
  indexedAt: string;
}
