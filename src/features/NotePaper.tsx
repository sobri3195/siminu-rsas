import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { ServiceNote, Attachment, NoteImage } from "../types";
import {
  noteDocument,
  inlineRuns,
  attachmentHeading,
  prepareNoteImage,
  imageSize,
} from "../repositories/notaDocument";
export function RichText({ text }: { text: string }) {
  return (
    <>
      {inlineRuns(text).map((r, i) =>
        r.bold ? (
          <strong key={i}>{r.text}</strong>
        ) : r.italics ? (
          <em key={i}>{r.text}</em>
        ) : (
          <span key={i}>{r.text}</span>
        ),
      )}
    </>
  );
}
function NoteFigure({
  note,
  config,
  index,
  files,
  onReady,
}: {
  note: ServiceNote;
  config: NoteImage;
  index: number;
  files: Attachment[];
  onReady?: (id: string, error?: string) => void;
}) {
  const [image, setImage] = useState<{
    url: string;
    width: number;
    height: number;
  }>();
  const [error, setError] = useState("");
  const file = files.find((f) => f.id === config.id);
  useEffect(() => {
    let active = true;
    setImage(undefined);
    setError("");
    if (!file) {
      setError("Lampiran gambar tidak ditemukan.");
      onReady?.(config.id, "Lampiran hilang");
      return;
    }
    void prepareNoteImage(file, config)
      .then((img) => {
        if (active) {
          setImage({ ...imageSize(img, config, note), url: img.url });
          onReady?.(config.id);
        }
      })
      .catch((e) => {
        if (active) {
          setError(String(e));
          onReady?.(config.id, String(e));
        }
      });
    return () => {
      active = false;
    };
    // Configuration is serialized to avoid rerendering a canvas on unrelated typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    file?.blob,
    JSON.stringify(config),
    note.content.format.left,
    note.content.format.right,
  ]);
  return (
    <section className="nota-attachment-page">
      <p className="nota-attachment-heading">{attachmentHeading(note)}</p>
      <figure>
        <strong>{config.title}</strong>
        {image ? (
          <img
            src={image.url}
            width={image.width}
            height={image.height}
            alt={config.caption || config.title}
          />
        ) : (
          <p role={error ? "alert" : undefined}>
            {error || "Menyiapkan gambar…"}
          </p>
        )}
        <figcaption>
          Gambar {index}. {config.caption}
          {config.source && (
            <>
              <br />
              Sumber: {config.source}
            </>
          )}
        </figcaption>
      </figure>
    </section>
  );
}
export function NotePaper({
  note,
  files,
  demo,
  onImageReady,
}: {
  note: ServiceNote;
  files: Attachment[];
  demo: boolean;
  onImageReady?: (id: string, error?: string) => void;
}) {
  const f = note.content.format;
  return (
    <article
      className="nota-paper"
      style={
        {
          "--nota-line": f.lineSpacing,
          "--nota-after": f.paragraphAfter + "pt",
          "--nota-sign-space": f.signatureSpace + "mm",
          "--nota-top": f.top + "mm",
          "--nota-bottom": f.bottom + "mm",
          "--nota-left": f.left + "mm",
          "--nota-right": f.right + "mm",
          fontFamily: f.font,
          fontSize: f.fontSize + "pt",
        } as CSSProperties
      }
      aria-label="Pratinjau nota dinas A4"
    >
      {noteDocument(note, demo).map((node, i) =>
        node.kind === "text" ? (
          <p
            key={i}
            className={node.keep ? "nota-keep" : ""}
            style={{
              textAlign: node.align || "left",
              fontWeight: node.bold ? 700 : 400,
            }}
          >
            {node.label && (
              <span className="nota-meta-label">{node.label} :</span>
            )}
            {node.text}
          </p>
        ) : node.kind === "signature" ? (
          <div className="nota-signature" key={i}>
            {node.lines.map((t, j) => (
              <p key={j} className={j === 2 ? "nota-signature-space" : ""}>
                {t || "\u00a0"}
              </p>
            ))}
          </div>
        ) : node.kind === "rich" ? (
          <div key={i}>
            {node.blocks.map((b, j) =>
              b.kind === "paragraph" ? (
                <p className={b.list ? "nota-list-line" : ""} key={j}>
                  <RichText text={b.text} />
                </p>
              ) : (
                <table key={j}>
                  <thead>
                    <tr>
                      {b.rows[0].map((t, k) => (
                        <th key={k}>
                          <RichText text={t} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.slice(1).map((r, k) => (
                      <tr key={k}>
                        {r.map((t, l) => (
                          <td key={l}>
                            <RichText text={t} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ),
            )}
          </div>
        ) : (
          <NoteFigure
            key={node.config.id}
            note={note}
            config={node.config}
            index={node.index}
            files={files}
            onReady={onImageReady}
          />
        ),
      )}
    </article>
  );
}
