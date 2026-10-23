import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { useApp } from "../app/context";
import { Badge, Modal, Empty } from "../components/common";
import { download, dateLabel } from "../utils";
import type { OutgoingLetter } from "../types";
export function ArchivedOutgoing({ params }: { params: URLSearchParams }) {
  const { run } = useApp();
  const letters = useLiveQuery(() => db.outgoing.toArray()) || [];
  const files = useLiveQuery(() => db.attachments.toArray()) || [];
  const [selected, setSelected] = useState<OutgoingLetter>();
  const rows = letters.filter(
    (l) =>
      l.status === "Diarsipkan" &&
      (!params.get("year") || l.createdAt.startsWith(params.get("year")!)) &&
      (!params.get("from") ||
        l.createdAt.slice(0, 10) >= params.get("from")!) &&
      (!params.get("to") || l.createdAt.slice(0, 10) <= params.get("to")!) &&
      (!params.get("kind") || l.kind === params.get("kind")) &&
      (!params.get("classification") ||
        l.classification === params.get("classification")) &&
      (!params.get("unit") || l.unitId === params.get("unit")) &&
      (!params.get("favorite") || l.favorite) &&
      `${l.subject} ${l.number} ${l.recipient} ${l.sentTo || ""}`
        .toLowerCase()
        .includes((params.get("q") || "").toLowerCase()),
  );
  return (
    <section className="panel master-extra">
      <h2>Arsip surat keluar · {rows.length} dokumen unik</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Perihal / nomor</th>
              <th>Penerima / pengiriman</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td>
                  <strong>{l.subject}</strong>
                  <small>{l.number}</small>
                </td>
                <td>
                  {l.recipient}
                  <small>{dateLabel(l.sentAt || l.createdAt)}</small>
                </td>
                <td>
                  <Badge>{l.status}</Badge>
                </td>
                <td>
                  <button onClick={() => setSelected(l)}>
                    Buka arsip keluar
                  </button>
                  <button
                    onClick={() =>
                      run(
                        () =>
                          db.outgoing.update(l.id, { favorite: !l.favorite }),
                        "Favorit surat keluar diperbarui.",
                      )
                    }
                  >
                    {l.favorite ? "Hapus favorit" : "Pin / favorit"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <Empty text="Tidak ada arsip surat keluar sesuai filter. Selesaikan pencatatan pengiriman melalui Surat Keluar." />
      )}
      {selected && (
        <Modal
          title="Arsip surat keluar"
          onClose={() => setSelected(undefined)}
        >
          <h2>{selected.subject}</h2>
          <p>
            {selected.number} · {selected.recipient}
          </p>
          <p>
            Pengiriman: {dateLabel(selected.sentAt || "")} →{" "}
            {selected.sentTo || "Belum dicatat pada data lama"}
          </p>
          {selected.incomingId && (
            <Link className="button" to={`/surat-masuk/${selected.incomingId}`}>
              Buka surat masuk, disposisi dan hasil terkait
            </Link>
          )}
          <h3>Lampiran asli</h3>
          {(selected.attachmentIds || []).map((aid) => {
            const file = files.find((a) => a.id === aid);
            return file ? (
              <button key={aid} onClick={() => download(file.blob, file.name)}>
                Unduh {file.name}
              </button>
            ) : (
              <p key={aid} className="error">
                Berkas tidak tersedia. Pulihkan cadangan lengkap.
              </p>
            );
          })}
        </Modal>
      )}
    </section>
  );
}
