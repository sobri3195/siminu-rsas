import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, CheckCircle2, Clock, AlertTriangle, Info } from "lucide-react";
export function Badge({ children }: { children: ReactNode }) {
  const text = String(children);
  const Icon = /Selesai|Diarsipkan|Terverifikasi/.test(text)
    ? CheckCircle2
    : /Terlambat|perbaikan|Gagal/.test(text)
      ? AlertTriangle
      : /Menunggu|Hasil/.test(text)
        ? Clock
        : Info;
  return (
    <span
      className={`badge ${/Selesai|Diarsipkan/.test(text) ? "green" : /Terlambat|perbaikan/.test(text) ? "red" : /Menunggu|Segera|Hasil/.test(text) ? "amber" : "blue"}`}
    >
      <Icon size={12} aria-hidden="true" />
      {children}
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="modal">
          <header>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close aria-label="Tutup">
              <X size={20} />
            </Dialog.Close>
          </header>
          <Dialog.Description className="muted">
            SIMINU RSAS · Pengelolaan administrasi demo
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Empty({
  text = "Tidak ada data yang sesuai.",
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <strong>Belum ada data yang dapat ditampilkan.</strong>
      <p>{text}</p>
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
