import { useState } from "react";
import { useApp } from "../app/context";
import { useUnsavedChanges } from "../app/unsaved";
import { correctLetter, cancelLetter } from "../repositories/letters";
import { Field, Modal } from "../components/common";
import type { IncomingLetter } from "../types";
import { download } from "../utils";
export function LetterEditor({
  letter,
  onClose,
  cancel = false,
}: {
  letter: IncomingLetter;
  onClose: () => void;
  cancel?: boolean;
}) {
  const { user, run } = useApp();
  const [original] = useState({ ...letter });
  const [draft, setDraft] = useState({ ...letter });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useUnsavedChanges(
    JSON.stringify(draft) !== JSON.stringify(original) || !!reason,
  );
  return (
    <Modal
      title={
        cancel ? "Penutupan administratif beralasan" : "Koreksi metadata surat"
      }
      onClose={onClose}
    >
      {!cancel && (
        <div className="grid2">
          {(
            [
              "sender",
              "number",
              "date",
              "received",
              "agenda",
              "subject",
              "kind",
              "urgency",
              "classification",
              "summary",
            ] as const
          ).map((key, i) => (
            <Field
              key={key}
              label={
                [
                  "Pengirim",
                  "Nomor surat",
                  "Tanggal surat",
                  "Tanggal diterima",
                  "Nomor agenda",
                  "Perihal",
                  "Jenis naskah",
                  "Derajat",
                  "Klasifikasi",
                  "Ringkasan",
                ][i]
              }
            >
              <input
                type={["date", "received"].includes(key) ? "date" : "text"}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </Field>
          ))}
        </div>
      )}
      <Field label="Alasan perubahan *">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <p>
        Riwayat sebelum dan sesudah disimpan. Koreksi metadata menggunakan
        revisi untuk mendeteksi edit dari tab lain. Penutupan membatalkan
        kewajiban dan memindahkan surat ke arsip tanpa menghapus data.
      </p>
      <div className="row">
        <button
          onClick={() =>
            download(
              new Blob([JSON.stringify({ draft, reason }, null, 2)], {
                type: "application/json",
              }),
              "draf-koreksi.json",
            )
          }
        >
          Ekspor input koreksi
        </button>
        <button
          className={cancel ? "danger" : "primary"}
          disabled={busy || !reason.trim()}
          onClick={() =>
            run(
              async () => {
                setBusy(true);
                try {
                  if (cancel) await cancelLetter(letter.id, reason, user.name);
                  else
                    await correctLetter(
                      letter.id,
                      original.revision || 1,
                      draft,
                      reason,
                      user.name,
                    );
                  onClose();
                } finally {
                  setBusy(false);
                }
              },
              cancel
                ? "Surat ditutup dengan alasan."
                : "Koreksi tersimpan beserta riwayat.",
            )
          }
        >
          {busy ? "Menyimpan…" : "Simpan perubahan"}
        </button>
      </div>
    </Modal>
  );
}
