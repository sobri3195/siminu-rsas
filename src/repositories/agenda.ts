import { db } from "../storage/db";
import type { AgendaEvent } from "../types";
import { z } from "zod";
export async function agendaConflicts(event: AgendaEvent) {
  if (!event.start || !event.end) return [];
  return db.events
    .filter(
      (e) =>
        e.id !== event.id &&
        e.date === event.date &&
        !!e.start &&
        !!e.end &&
        e.start < event.end! &&
        e.end > event.start! &&
        ([
          e.userId,
          e.invitedUserId,
          e.representativeId,
          ...(e.participants || []),
        ].some(
          (uid) =>
            uid &&
            [
              event.userId,
              event.invitedUserId,
              event.representativeId,
              ...(event.participants || []),
            ].includes(uid),
        ) ||
          (!!e.unitId && e.unitId === event.unitId) ||
          (!!e.location && e.location === event.location)),
    )
    .toArray();
}
export async function saveAgenda(event: AgendaEvent, acknowledged = false) {
  if (
    !event.title.trim() ||
    !z.iso.date().safeParse(event.date).success ||
    !event.start ||
    !event.end ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.start) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.end) ||
    event.end <= event.start
  )
    throw Error("Nama, tanggal dan rentang waktu kegiatan harus valid.");
  if ((await agendaConflicts(event)).length && !acknowledged)
    throw Error("Benturan jadwal perlu ditinjau sebelum menyimpan.");
  await db.events.put(event);
}
export function zonedInstant(date: string, time: string, zone: string) {
  const target = Date.parse(`${date}T${time}:00Z`);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
    );
    const local = Date.UTC(
      +parts.year,
      +parts.month - 1,
      +parts.day,
      +parts.hour,
      +parts.minute,
      +parts.second,
    );
    guess += target - local;
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
  );
  if (
    `${parts.year}-${parts.month}-${parts.day}` !== date ||
    `${parts.hour}:${parts.minute}` !== time
  )
    throw Error("Waktu tidak tersedia pada zona waktu ini.");
  return new Date(guess);
}
const escape = (s: string) =>
  s
    .replaceAll("\\", "\\\\")
    .replaceAll("\r", "")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
const utc = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
function fold(line: string) {
  const rows: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const n = new TextEncoder().encode(char).length;
    if (bytes + n > 74) {
      rows.push(current);
      current = " ";
      bytes = 1;
    }
    current += char;
    bytes += n;
  }
  rows.push(current);
  return rows.join("\r\n");
}
export function agendaICS(events: AgendaEvent[], zone: string) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SIMINU RSAS//Agenda Lokal//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const e of events) {
    if (!e.start || !e.end)
      throw Error("Lengkapi waktu kegiatan sebelum ekspor ICS.");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escape(e.id)}@siminu.local`,
      `DTSTAMP:${utc(new Date())}`,
      `DTSTART:${utc(zonedInstant(e.date, e.start, zone))}`,
      `DTEND:${utc(zonedInstant(e.date, e.end, zone))}`,
      `SUMMARY:${escape(e.title)}`,
      `LOCATION:${escape(e.location)}`,
      `DESCRIPTION:${escape(`Zona waktu asal: ${zone}\nPenyelenggara: ${e.organizer || "—"}\nSurat sumber: ${e.letterId || "—"}\nKehadiran: ${e.attendance || "Belum ditentukan"}`)}`,
      "END:VEVENT",
    );
  }
  return [...lines, "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}
