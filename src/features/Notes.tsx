import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Bookmark, Trash2, Palette } from "lucide-react";
import { db } from "../lib/db";
import { download } from "../lib/backup";
import type { Book, Annotation } from "../lib/types";
import { Empty, Modal } from "../components/ui";
import { QuoteCard } from "./QuoteCard";
export function Notes({
  open,
  notify,
}: {
  open: (book: Book, page?: number) => void;
  notify: (s: string) => void;
}) {
  const books = useLiveQuery(() => db.books.toArray()) ?? [],
    notes = useLiveQuery(() => db.annotations.toArray()) ?? [];
  const [bookId, setBookId] = useState(""),
    [quote, setQuote] = useState<Annotation | null>(null),
    [editing, setEditing] = useState<Annotation | null>(null);
  const filtered = notes
    .filter((n) => !bookId || n.bookId === bookId)
    .sort((a, b) => b.createdAt - a.createdAt);
  function exportNotes() {
    const text = books
      .filter((b) => !bookId || b.id === bookId)
      .map(
        (b) =>
          `# ${b.title}\n${b.author}\n\n` +
          filtered
            .filter((n) => n.bookId === b.id)
            .map(
              (n) =>
                `## Страница ${n.page}\n\n${
                  n.kind === "bookmark"
                    ? "🔖 Закладка"
                    : n.text
                        .split("\n")
                        .map((l) => `> ${l}`)
                        .join("\n")
                }\n\n${n.note}\n`,
            )
            .join("\n"),
      )
      .join("\n---\n\n");
    download(
      new Blob([text], { type: "text/markdown;charset=utf-8" }),
      "list-notes.md",
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">МЫСЛИ, КОТОРЫЕ ОСТАЛИСЬ</div>
          <h1>Выделения и заметки</h1>
          <p>Соберите важное. Возвращайтесь к любимым строкам.</p>
        </div>
        <button
          className="secondary"
          disabled={!filtered.length}
          onClick={exportNotes}
        >
          <Download size={17} /> Экспорт Markdown
        </button>
      </div>
      <select
        aria-label="Заметки книги"
        value={bookId}
        onChange={(e) => setBookId(e.target.value)}
      >
        <option value="">Все книги</option>
        {books.map((b) => (
          <option key={b.id} value={b.id}>
            {b.title}
          </option>
        ))}
      </select>
      {!filtered.length ? (
        <Empty
          title="Сохраните первую мысль"
          description="Выделите фразу в читалке, добавьте заметку или поставьте закладку."
        />
      ) : (
        <div className="notes-grid">
          {filtered.map((n) => {
            const b = books.find((b) => b.id === n.bookId);
            return (
              <article className={`note-card mark-${n.color}`} key={n.id}>
                <div className="eyebrow">
                  {n.kind === "bookmark" && <Bookmark size={14} />} {b?.title} ·
                  стр. {n.page}
                </div>
                <blockquote>{n.text}</blockquote>
                {n.note && <p>{n.note}</p>}
                <div className="row">
                  <button
                    onClick={() =>
                      b &&
                      open(
                        {
                          ...b,
                          position: {
                            page: n.page,
                            fraction: n.kind === "bookmark" ? n.start : 0,
                          },
                        },
                        n.page,
                      )
                    }
                  >
                    К месту в книге
                  </button>
                  <button onClick={() => setEditing(n)}>Заметка</button>
                  {n.kind === "highlight" && (
                    <button
                      aria-label="Создать карточку цитаты"
                      onClick={() => setQuote(n)}
                    >
                      <Palette size={17} />
                    </button>
                  )}
                  <button
                    className="icon"
                    aria-label="Удалить выделение"
                    onClick={() => void db.annotations.delete(n.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {quote && books.find((b) => b.id === quote.bookId) && (
        <Modal title="Карточка цитаты" wide close={() => setQuote(null)}>
          <QuoteCard
            text={quote.text}
            book={books.find((b) => b.id === quote.bookId)!}
            notify={notify}
          />
        </Modal>
      )}
      {editing && (
        <Modal title="Заметка" close={() => setEditing(null)}>
          <textarea
            className="full"
            aria-label="Текст заметки"
            value={editing.note}
            onChange={(e) => setEditing({ ...editing, note: e.target.value })}
          />
          <button
            className="primary"
            onClick={async () => {
              await db.annotations.update(editing.id, { note: editing.note });
              setEditing(null);
            }}
          >
            Сохранить
          </button>
        </Modal>
      )}
    </>
  );
}
