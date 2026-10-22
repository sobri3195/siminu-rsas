export type Role =
  | "Admin Sistem"
  | "Petugas Urtu/Administrasi"
  | "Kepala RSAU"
  | "Kepala Unit"
  | "Pelaksana";
export interface User {
  id: string;
  name: string;
  role: Role;
  unitId: string;
  active: boolean;
}
export interface Unit {
  id: string;
  name: string;
  active: boolean;
  order: number;
  parentId?: string;
  userId?: string;
}
export interface Position {
  id: string;
  name: string;
  unitId: string;
  userId?: string;
}
export interface IncomingLetter {
  id: string;
  agenda: string;
  sender: string;
  number: string;
  date: string;
  received: string;
  subject: string;
  kind: string;
  urgency: string;
  classification: string;
  summary: string;
  status:
    | "Draf"
    | "Terdaftar"
    | "Menunggu disposisi"
    | "Dalam tindak lanjut"
    | "Selesai"
    | "Diarsipkan";
  attachmentIds: string[];
  createdAt: string;
}
export interface OutgoingLetter {
  id: string;
  subject: string;
  recipient: string;
  number: string;
  status: string;
  incomingId?: string;
  createdAt: string;
}
export interface Attachment {
  id: string;
  letterId: string;
  name: string;
  type: string;
  blob: Blob;
}
export interface DispositionRecipient {
  unitId: string;
  unitName: string;
  userId: string;
  kind: "Utama" | "Pendukung" | "Tembusan";
  instruction: string;
  deadline: string;
}
export interface Disposition {
  id: string;
  letterId: string;
  giver: string;
  recipients: DispositionRecipient[];
  instructions: string[];
  notes: string;
  deadline: string;
  review: boolean;
  createdAt: string;
  revisionOf?: string;
  reason?: string;
  cancelled?: boolean;
}
export type TaskStatus =
  | "Belum dibaca"
  | "Dibaca"
  | "Diterima"
  | "Diproses"
  | "Hasil dikirim"
  | "Perlu perbaikan"
  | "Selesai";
export interface Task {
  id: string;
  letterId: string;
  dispositionId: string;
  unitId: string;
  unitName: string;
  userId: string;
  instruction: string;
  deadline: string;
  status: TaskStatus;
  review: boolean;
  parentId?: string;
  createdAt: string;
}
export interface ProgressUpdate {
  id: string;
  taskId: string;
  text: string;
  createdAt: string;
  author: string;
}
export interface CompletionReport {
  id: string;
  taskId: string;
  action: string;
  date: string;
  result: string;
  obstacles: string;
  next: string;
  attachmentIds: string[];
  createdAt: string;
}
export interface Comment {
  id: string;
  letterId: string;
  text: string;
  author: string;
  createdAt: string;
}
export interface AgendaEvent {
  id: string;
  title: string;
  date: string;
  location: string;
  letterId?: string;
}
export interface Notification {
  id: string;
  text: string;
  letterId: string;
  read: boolean;
  createdAt: string;
}
export interface ActivityLog {
  id: string;
  letterId: string;
  text: string;
  author: string;
  createdAt: string;
}
export interface AppSettings {
  id: string;
  official: string;
  rank: string;
  nrp: string;
  printDate: string;
  timezone: string;
  extraInstructions: string;
}
