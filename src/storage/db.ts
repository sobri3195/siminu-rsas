import Dexie, { type EntityTable } from "dexie";
import type * as T from "../types";
export type AppDatabase = Dexie & {
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
  sequences: EntityTable<T.Sequence, "id">;
  recovery: EntityTable<T.RecoverySnapshot, "id">;
  catalogs: EntityTable<T.CatalogItem, "id">;
};
export const dataMode =
  typeof localStorage !== "undefined" &&
  localStorage.getItem("rsas-data-mode") === "demo"
    ? "demo"
    : "local";
export function createDatabase(name: string): AppDatabase {
  const db = new Dexie(name) as AppDatabase;
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

  db.version(2)
    .stores({
      letters: "id,agenda,status,received,[year+register+agenda]",
      sequences: "id",
      recovery: "id,createdAt",
      catalogs: "id,category",
    })
    .upgrade(async (tx) => {
      await tx
        .table("letters")
        .toCollection()
        .modify((l) => {
          l.revision = l.revision ?? 1;
          l.updatedAt = l.updatedAt ?? l.createdAt;
          l.year = l.received.slice(0, 4);
          l.register = l.register || "SM";
        });
      const cancelled = await tx
        .table("dispositions")
        .filter((d) => d.cancelled)
        .toArray();
      for (const d of cancelled)
        await tx
          .table("tasks")
          .where({ dispositionId: d.id })
          .modify((t) => {
            if (t.status !== "Dibatalkan") {
              t.previousStatus = t.status;
              t.status = "Dibatalkan";
            }
          });
    });
  db.on("blocked", () => {
    if (typeof window !== "undefined")
      window.dispatchEvent(new CustomEvent("rsas-db-upgrade"));
  });
  db.on("versionchange", () => {
    db.close();
    if (typeof window !== "undefined")
      window.dispatchEvent(new CustomEvent("rsas-db-upgrade"));
  });
  return db;
}
export const db = createDatabase(
  dataMode === "demo" ? "siminu-rsas-demo-v2" : "siminu-rsas-v1",
);
export function switchDataMode(mode: "demo" | "local") {
  localStorage.setItem("rsas-data-mode", mode);
  db.close();
  window.location.assign("/uji-coba");
}
export const changeChannel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel("rsas-data-updates")
    : null;
if (changeChannel) {
  Dexie.on("storagemutated", (parts) => {
    if (Object.keys(parts).some((key) => key.includes(db.name)))
      changeChannel.postMessage({ database: db.name, table: "data" });
  });
  changeChannel.onmessage = (e) => {
    if (e.data.database === db.name)
      window.dispatchEvent(
        new CustomEvent("rsas-other-tab", { detail: e.data.table }),
      );
  };
}
