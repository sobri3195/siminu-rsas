import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { useApp } from "../app/context";
import { bulkLetters } from "../repositories/bulk";
import { Field, Modal, Badge } from "../components/common";
import { csvCell } from "../utils/csv";
import { download } from "../utils";
export function BulkLetters({
  selected,
  onClear,
}: {
  selected: string[];
  onClear: () => void;
}) {
  const { user, run } = useApp();
  const letters =
    useLiveQuery(() => db.letters.bulkGet(selected), [selected.join(",")]) ||
    [];
  const cases = useLiveQuery(() => db.caseFiles.toArray()) || [];
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"label" | "case" | "archive">("label");
  const [label, setLabel] = useState("");
  const [caseId, setCaseId] = useState("");
  const [results, setResults] =
    useState<Awaited<ReturnType<typeof bulkLetters>>>();
  const [printing, setPrinting] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      {selected.length > 0 && (
        <div className="callout row no-print">
          <strong>{selected.length} surat terpilih</strong>
          <button
            onClick={() => {
              setOpen(true);
              setResults(undefined);
            }}
          >
            Tinjau pemrosesan massal
          </button>
          <button onClick={onClear}>Batal memilih</button>
        </div>
      )}
      {open && (
        <Modal
          title={`Tinjau ${selected.length} dokumen terpilih`}
          onClose={() => !busy && setOpen(false)}
        >
          <div className={printing ? "batch-print-root" : ""}>
            <h2>Daftar surat terpilih — CONTOH/DEMO</h2>
            <table>
              <thead>
                <tr>
                  <th>Agenda</th>
                  <th>Perihal</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {letters.map((l, i) => (
                  <tr key={selected[i]}>
                    <td>{l?.agenda || selected[i]}</td>
                    <td>{l?.subject || "Sumber tidak ditemukan"}</td>
                    <td>{l?.status || "Tidak tersedia"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="no-print">
            <button
              onClick={() =>
                download(
                  new Blob(
                    [
                      "\ufeff" +
                        [
                          ["Agenda", "Nomor", "Pengirim", "Perihal", "Status"],
                          ...letters
                            .filter(Boolean)
                            .map((l) => [
                              l!.agenda,
                              l!.number,
                              l!.sender,
                              l!.subject,
                              l!.status,
                            ]),
                        ]
                          .map((r) => r.map(csvCell).join(","))
                          .join("\r\n"),
                    ],
                    { type: "text/csv;charset=utf-8" },
                  ),
                  "daftar-surat-terpilih.csv",
                )
              }
            >
              Ekspor daftar CSV
            </button>
            <button
              onClick={() => {
                setPrinting(true);
                setTimeout(() => window.print(), 100);
              }}
            >
              Cetak daftar terpilih
            </button>
            <Field label="Tindakan massal">
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as typeof action)}
              >
                <option value="label">Beri label</option>
                <option value="case">Tautkan ke berkas kegiatan</option>
                <option value="archive">Arsipkan yang memenuhi syarat</option>
              </select>
            </Field>
            {action === "label" && (
              <Field label="Label untuk surat terpilih">
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </Field>
            )}
            {action === "case" && (
              <Field label="Berkas kegiatan tujuan">
                <select
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                >
                  <option value="">Pilih berkas</option>
                  {cases.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <p>
              Dokumen yang tidak memenuhi syarat dilewati dengan alasan per
              item. Tidak ada persetujuan massal atau penyelesaian tugas tanpa
              pemeriksaan.
            </p>
            <button
              className="primary"
              disabled={
                busy ||
                (action === "label" && !label.trim()) ||
                (action === "case" && !caseId)
              }
              onClick={() =>
                run(async () => {
                  setBusy(true);
                  try {
                    setResults(
                      await bulkLetters(selected, action, user.name, {
                        label,
                        caseId,
                      }),
                    );
                  } finally {
                    setBusy(false);
                  }
                }, "Hasil pemrosesan tersedia per dokumen.")
              }
            >
              Konfirmasi proses dokumen valid
            </button>
            {results && (
              <div role="status">
                <h3>
                  {results.filter((r) => r.status === "Berhasil").length}{" "}
                  berhasil ·{" "}
                  {results.filter((r) => r.status === "Gagal").length}{" "}
                  gagal/dilewati
                </h3>
                {results.map((r) => (
                  <p key={r.id}>
                    <strong>
                      {letters.find((l) => l?.id === r.id)?.subject || r.id}
                    </strong>{" "}
                    <Badge>{r.status}</Badge>
                    <small>{r.reason}</small>
                  </p>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
