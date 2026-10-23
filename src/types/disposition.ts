import type { Disposition, DispositionRecipient } from "./index";
export interface DigitalRecipient extends DispositionRecipient {
  id: string;
  userName: string;
  positionId: string;
  positionName: string;
  assignmentStart: string;
  assignmentEnd: string;
}
export interface DispositionContent {
  letterId: string;
  giverId: string;
  giver: string;
  giverPosition: string;
  mode: "Penugasan" | "Untuk diketahui";
  recipients: DigitalRecipient[];
  instructions: string[];
  notes: string;
  deadline: string;
  reportRequired: boolean;
  review: boolean;
  reviewerId: string;
}
export interface DispositionDraft {
  id: string;
  authorId: string;
  content: DispositionContent;
  revision: number;
  createdAt: string;
  updatedAt: string;
  sourceId?: string;
  sourceRevision?: number;
  reason: string;
  publishedId?: string;
}
export interface DispositionVersion {
  id: string;
  dispositionId: string;
  version: number;
  snapshot: Disposition;
  userId: string;
  reason: string;
  createdAt: string;
}
export interface RecipientReceipt {
  id: string;
  dispositionId: string;
  recipientId: string;
  userId: string;
  unitId: string;
  userName: string;
  positionName: string;
  readAt?: string;
  retired?: boolean;
}
export interface DispositionOutput {
  id: string;
  dispositionId: string;
  taskId?: string;
  kind: "notes" | "events";
  targetId: string;
  userId: string;
  createdAt: string;
}
