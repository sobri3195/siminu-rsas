export interface ReplyAssignment {
  id: string;
  decision: "Perlu penilaian" | "Perlu balasan" | "Tidak perlu balasan";
  picId: string;
  picName: string;
  unitId: string;
  unitName: string;
  deadline: string;
  instructions: string;
  reviewerId: string;
  reason: string;
  revision: number;
  updatedAt: string;
  userId: string;
}
export interface MailNumber {
  id: string;
  draftId: string;
  version: number;
  outgoingId: string;
  createdAt: string;
  userId: string;
  state: "Digunakan" | "Dibatalkan";
  reason: string;
}
export interface DispatchTarget {
  id: string;
  outgoingId: string;
  name: string;
  address: string;
  createdAt: string;
}
export interface MailDispatch {
  attempt?: number;
  id: string;
  targetId: string;
  outgoingId: string;
  recipient: string;
  sentAt: string;
  medium: "Diserahkan langsung" | "Kurir" | "Pos" | "Email manual" | "Lainnya";
  userId: string;
  userName: string;
  tracking: string;
  proofIds: string[];
  receivedAt: string;
  receiptIds: string[];
  note: string;
  status: "Tercatat dikirim" | "Diterima" | "Gagal dikirim" | "Dikirim ulang";
  revision: number;
  createdAt: string;
}
export interface MailLink {
  id: string;
  fromId: string;
  toId: string;
  reason: string;
  userId: string;
  createdAt: string;
}
