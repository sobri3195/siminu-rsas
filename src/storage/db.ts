import Dexie, { type EntityTable } from "dexie";
import type * as T from "../types";
export const db = new Dexie("siminu-rsas-v1") as Dexie & {
  letters: EntityTable<T.IncomingLetter, "id">;
  outgoing: EntityTable<T.OutgoingLetter, "id">;
  attachments: EntityTable<T.Attachment, "id">;
  dispositions: EntityTable<T.Disposition, "id">;
  tasks: EntityTable<T.Task, "id">;
  units: EntityTable<T.Unit, "id">;
  users: EntityTable<T.User, "id">;
  positions: EntityTable<T.Position, "id">;
  progress: EntityTable<T.ProgressUpdate, "id">;
  reports: EntityTable<T.CompletionReport, "id">;
  comments: EntityTable<T.Comment, "id">;
  events: EntityTable<T.AgendaEvent, "id">;
  notifications: EntityTable<T.Notification, "id">;
  activities: EntityTable<T.ActivityLog, "id">;
  settings: EntityTable<T.AppSettings, "id">;
};
db.version(1).stores({
  letters: "id,agenda,status,received",
  outgoing: "id,status",
  attachments: "id,letterId",
  dispositions: "id,letterId",
  tasks: "id,letterId,dispositionId,unitId,userId,status",
  units: "id",
  users: "id",
  positions: "id",
  progress: "id,taskId",
  reports: "id,taskId",
  comments: "id,letterId",
  events: "id,date",
  notifications: "id,letterId",
  activities: "id,letterId",
  settings: "id",
});
