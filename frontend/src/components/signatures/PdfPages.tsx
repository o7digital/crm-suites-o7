"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

function PageCanvas({
  doc,
  page,
  children,
  onClick,
}: {
  doc: PDFDocumentProxy;
  page: number;
  children?: ReactNode;
  onClick?: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(1.414);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let task: { cancel: () => void } | undefined;
    void doc
      .getPage(page)
      .then((p) => {
        if (!active || !ref.current) return;
        const viewport = p.getViewport({ scale: 1.4 });
        setRatio(viewport.height / viewport.width);
        const canvas = ref.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        task = p.render({
          canvas,
          canvasContext: canvas.getContext("2d")!,
          viewport,
        });
        return (task as unknown as { promise: Promise<void> }).promise;
      })
      .catch((err) => {
        if (active) setError(String(err.message || err));
      });
    return () => {
      active = false;
      task?.cancel();
    };
  }, [doc, page]);
  return (
    <div className="mb-5">
      <p className="mb-1 text-xs text-slate-400">
        {page} / {doc.numPages}
      </p>
      <div
        className="relative overflow-hidden rounded border border-white/20 bg-white shadow"
        style={{ aspectRatio: `1 / ${ratio}` }}
        onClick={(event) => {
          if (!onClick) return;
          const rect = event.currentTarget.getBoundingClientRect();
          onClick(
            (event.clientX - rect.left) / rect.width,
            (event.clientY - rect.top) / rect.height,
          );
        }}
      >
        <canvas ref={ref} className="block h-full w-full" />
        {children}
      </div>
      {error && <p className="text-red-300">{error}</p>}
    </div>
  );
}
export function PdfPages({
  blob,
  overlay,
  onPlace,
}: {
  blob: Blob;
  overlay?: (page: number) => ReactNode;
  onPlace?: (page: number, x: number, y: number) => void;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let task: { destroy: () => Promise<void> } | undefined;
    setDoc(null);
    setError("");
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = `/signatures/pdf.worker.min.mjs?v=${pdfjs.version}`;
      const loading = pdfjs.getDocument({
        data: new Uint8Array(await blob.arrayBuffer()),
        enableXfa: false,
      });
      task = loading;
      const pdf = await loading.promise;
      if (active) setDoc(pdf);
      else await loading.destroy();
    })().catch((err) => {
      if (active) setError(String(err.message || err));
    });
    return () => {
      active = false;
      void task?.destroy();
    };
  }, [blob]);
  if (error)
    return (
      <p className="rounded bg-red-500/10 p-4 text-red-200">PDF: {error}</p>
    );
  if (!doc) return <p className="p-4 text-slate-400">PDF…</p>;
  return (
    <div>
      {Array.from({ length: doc.numPages }, (_, i) => (
        <PageCanvas
          key={i}
          doc={doc}
          page={i + 1}
          onClick={onPlace ? (x, y) => onPlace(i + 1, x, y) : undefined}
        >
          {overlay?.(i + 1)}
        </PageCanvas>
      ))}
    </div>
  );
}
