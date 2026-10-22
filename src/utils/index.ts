export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const dateLabel = (v: string) =>
  v
    ? new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(v.slice(0, 10) + "T00:00:00Z"))
    : "—";
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const instructions = [
  "ACC/Dukung",
  "Tindak lanjuti",
  "Siapkan",
  "Untuk diketahui",
  "Agendakan",
  "Sesuai ketentuan yang berlaku",
  "Hadir",
  "Untuk mewakili",
  "Tunjuk yang mewakili",
  "Saran/Tanggapan",
  "Arsipkan",
  "Koordinasikan",
  "Laporkan",
  "Monitor",
];
