import { useEffect, useRef, useState } from "react";
import { TextLayer, type PDFDocumentProxy } from "pdfjs-dist";
import { Busy } from "../components/ui";
export function PdfPage({
  doc,
  page,
  zoom,
  onReady,
}: {
  doc: PDFDocumentProxy;
  page: number;
  zoom: number;
  onReady: () => void;
}) {
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const ref = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    layer = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [width, setWidth] = useState(700);
  useEffect(() => {
    const observer = new ResizeObserver((e) =>
      setWidth(e[0].contentRect.width),
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    let render:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    let text: TextLayer | undefined;
    setLoading(true);
    setError("");
    void (async () => {
      const p = await doc.getPage(page);
      if (cancelled || !canvas.current || !layer.current) return;
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({
        scale: Math.min(2.5, (width - 24) / base.width) * zoom,
      });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.current.width = viewport.width * dpr;
      canvas.current.height = viewport.height * dpr;
      canvas.current.style.width = `${viewport.width}px`;
      canvas.current.style.height = `${viewport.height}px`;
      render = p.render({
        canvas: canvas.current,
        viewport,
        transform: [dpr, 0, 0, dpr, 0, 0],
      });
      await render.promise;
      if (cancelled) return;
      layer.current.replaceChildren();
      layer.current.style.width = `${viewport.width}px`;
      layer.current.style.height = `${viewport.height}px`;
      layer.current.style.setProperty("--scale-factor", String(viewport.scale));
      text = new TextLayer({
        textContentSource: await p.getTextContent(),
        container: layer.current,
        viewport,
      });
      await text.render();
      if (!cancelled) {
        setLoading(false);
        requestAnimationFrame(() => readyRef.current());
      }
    })().catch((e) => {
      if (!cancelled) {
        setError(e.message);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      render?.cancel();
      text?.cancel();
    };
  }, [doc, page, zoom, width]);
  return (
    <div ref={ref} className="pdf-stage">
      {loading && <Busy label="Рисуем страницу…" />}
      {error && <p role="alert">{error}</p>}
      <div className="pdf-paper">
        <canvas ref={canvas} />
        <div ref={layer} className="textLayer" />
      </div>
    </div>
  );
}
