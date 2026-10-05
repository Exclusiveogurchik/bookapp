import { useEffect, useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { download } from "../lib/backup";
import type { Book } from "../lib/types";
const styles = [
  { name: "Бумага", bg: "#f2eee5", fg: "#2b382f", accent: "#78906b" },
  { name: "Лес", bg: "#203e32", fg: "#f2eedf", accent: "#acc5a1" },
  { name: "Ночь", bg: "#151c29", fg: "#edf0fa", accent: "#9aaed8" },
  { name: "Терракота", bg: "#b85d43", fg: "#fff5e9", accent: "#edc7a3" },
  { name: "Сирень", bg: "#eae3f1", fg: "#47395c", accent: "#aa90bd" },
];
export function QuoteCard({
  text,
  book,
  notify,
}: {
  text: string;
  book: Book;
  notify: (s: string) => void;
}) {
  const [style, setStyle] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [quote, setQuote] = useState(text.slice(0, 900));
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const s = styles[style];
    ctx.fillStyle = s.bg;
    ctx.fillRect(0, 0, 1080, 1080);
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(50, 50, 980, 980);
    ctx.fillStyle = s.accent;
    ctx.font = "150px Georgia";
    ctx.fillText("“", 90, 205);
    ctx.fillStyle = s.fg;
    const size = quote.length > 500 ? 30 : quote.length > 250 ? 38 : 48;
    ctx.font = `${size}px Georgia`;
    const words = quote.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (ctx.measureText(line + " " + word).width > 840 && line) {
        lines.push(line);
        line = word;
      } else line += (line ? " " : "") + word;
    }
    if (line) lines.push(line);
    lines
      .slice(0, 16)
      .forEach((l, i) => ctx.fillText(l, 110, 260 + i * size * 1.4));
    ctx.fillStyle = s.accent;
    ctx.fillRect(110, 890, 55, 3);
    ctx.fillStyle = s.fg;
    ctx.font = "bold 28px system-ui";
    ctx.fillText(book.title.slice(0, 55), 110, 950, 850);
    ctx.font = "22px system-ui";
    ctx.fillText(book.author || "Личная библиотека", 110, 986);
  }, [quote, book, style]);
  async function blob() {
    return new Promise<Blob>((resolve, reject) =>
      canvas.current?.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Не удалось создать PNG"))),
        "image/png",
      ),
    );
  }
  return (
    <div>
      <div className="quote-preview">
        <canvas ref={canvas} width="1080" height="1080" />
      </div>
      <label className="field">
        <span>Текст цитаты (до 900 символов)</span>
        <textarea
          maxLength={900}
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
        />
      </label>
      <div className="style-options">
        {styles.map((s, i) => (
          <button
            key={s.name}
            aria-pressed={i === style}
            style={{ background: s.bg, color: s.fg }}
            onClick={() => setStyle(i)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="row">
        <button
          className="primary"
          onClick={async () => download(await blob(), "list-quote.png")}
        >
          <Download size={17} /> Скачать PNG
        </button>
        <button
          className="secondary"
          onClick={async () => {
            try {
              const file = new File([await blob()], "list-quote.png", {
                type: "image/png",
              });
              if (navigator.canShare?.({ files: [file] }))
                await navigator.share({ files: [file], title: book.title });
              else {
                download(file, "list-quote.png");
                notify("Карточка скачана — её можно отправить вручную");
              }
            } catch (e) {
              if ((e as Error).name !== "AbortError")
                notify("Не удалось поделиться карточкой");
            }
          }}
        >
          <Share2 size={17} /> Поделиться
        </button>
      </div>
    </div>
  );
}
