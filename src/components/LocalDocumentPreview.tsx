import { useEffect, useRef, useState } from "react";
import type { Attachment } from "../types";
import { download } from "../utils";
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
/** Canvas avoids native PDF plug-ins intercepting clicks over nearby controls. */
export function LocalDocumentPreview({ file }: { file: Attachment }) {
  const [url, setUrl] = useState(""),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(0),
    [zoom, setZoom] = useState(100),
    [width, setWidth] = useState(600),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [text, setText] = useState("");
  const root = useRef<HTMLDivElement>(null),
    pdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
  useEffect(() => {
    const u = URL.createObjectURL(file.blob);
    setUrl(u);
    setPage(1);
    setZoom(100);
    return () => URL.revokeObjectURL(u);
  }, [file.id, file.blob]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setWidth(w);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf) return;
    let active = true,
      task: PDFDocumentLoadingTask | undefined,
      render: RenderTask | undefined;
    setError("");
    setLoading(true);
    setText("");
    void (async () => {
      const pdfjs = await import("pdfjs-dist"),
        worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      task = pdfjs.getDocument({
        data: new Uint8Array(await file.blob.arrayBuffer()),
        enableXfa: false,
        useWorkerFetch: false,
      });
      const document = await task.promise;
      if (!active) return;
      setPages(document.numPages);
      const p = await document.getPage(Math.min(page, document.numPages));
      const natural = p.getViewport({ scale: 1 }),
        viewport = p.getViewport({
          scale: (Math.max(0.1, (width - 16) / natural.width) * zoom) / 100,
        }),
        canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", file.name + " halaman " + page);
      const context = canvas.getContext("2d");
      if (!context) throw Error("Canvas tidak tersedia.");
      render = p.render({ canvas, canvasContext: context, viewport });
      await render.promise;
      const content = await p.getTextContent();
      if (active) {
        root.current?.replaceChildren(canvas);
        setText(content.items.map((i) => ("str" in i ? i.str : "")).join(" "));
        setLoading(false);
      }
    })()
      .catch((e) => {
        if (active) {
          setError(String(e));
          setLoading(false);
        }
      })
      .finally(() => {
        if (task) void task.destroy();
      });
    return () => {
      active = false;
      render?.cancel();
      if (task) void task.destroy();
    };
  }, [pdf, file.id, file.blob, page, zoom, width]);
  return (
    <>
      <div className="preview-tools">
        <span>{file.name}</span>
        <button onClick={() => setZoom((z) => (z >= 200 ? 50 : z + 25))}>
          Zoom {zoom}%
        </button>
        <a
          className="button"
          href={url || undefined}
          target="_blank"
          rel="noreferrer"
        >
          Buka dokumen
        </a>
        <button onClick={() => download(file.blob, file.name)}>
          Unduh dokumen
        </button>
      </div>
      {pdf ? (
        <>
          <div className="toolbar">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Halaman PDF sebelumnya
            </button>
            <span>
              Halaman {page} / {pages || "…"}
            </span>
            <button
              disabled={page >= pages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Halaman PDF berikutnya
            </button>
          </div>
          {loading && <p role="status">Menyiapkan halaman PDF lokal…</p>}
          {error && (
            <p role="alert">
              Pratinjau PDF belum berhasil: {error}. Gunakan Buka dokumen atau
              Unduh dokumen.
            </p>
          )}
          <div ref={root} className="digital-pdf-page" />
          {text && (
            <details>
              <summary>Teks halaman PDF</summary>
              <p className="digital-prewrap">{text}</p>
            </details>
          )}
        </>
      ) : file.type.startsWith("image/") ? (
        <div className="digital-image-page">
          <img
            src={url || undefined}
            alt={file.name}
            style={{ width: zoom + "%", maxWidth: "none" }}
          />
        </div>
      ) : (
        <p>
          Pratinjau format ini tidak tersedia. Gunakan Unduh dokumen untuk
          membuka berkas asli di aplikasi yang sesuai.
        </p>
      )}
    </>
  );
}
