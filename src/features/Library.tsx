import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Search,
  Plus,
  ArrowUpRight,
  MoreHorizontal,
  Upload,
  BookOpen,
  Folder,
  Check,
} from "lucide-react";
import { db, removeBook } from "../lib/db";
import { importPDF, errorMessage } from "../lib/pdf";
import { percent, statuses, type Book, type Status } from "../lib/types";
import { Empty, Modal, Field } from "../components/ui";
export function Library({
  open,
  readingOnly = false,
  notify,
}: {
  open: (b: Book, page?: number) => void;
  readingOnly?: boolean;
  notify: (s: string) => void;
}) {
  const books = useLiveQuery(() => db.books.toArray()) ?? [];
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState<Status | "all">(
      readingOnly ? "reading" : "all",
    ),
    [shelf, setShelf] = useState(""),
    [sort, setSort] = useState("recent"),
    [drag, setDrag] = useState(false),
    [edit, setEdit] = useState<Book | null>(null),
    [progress, setProgress] = useState<{
      name: string;
      value: number;
      total: number;
      current: number;
    } | null>(null),
    [hits, setHits] = useState<
      { bookId: string; page: number; excerpt: string }[]
    >([]);
  const input = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  useEffect(() => {
    let stopped = false;
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setHits([]);
        return;
      }
      const q = query.toLocaleLowerCase();
      const matches = await db.pages
        .filter((p) => p.text.toLocaleLowerCase().includes(q))
        .limit(60)
        .toArray();
      if (!stopped)
        setHits(
          matches.map((p) => {
            const i = p.text.toLocaleLowerCase().indexOf(q);
            return {
              bookId: p.bookId,
              page: p.page,
              excerpt: p.text.slice(Math.max(0, i - 40), i + 100),
            };
          }),
        );
    }, 300);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [query, books.map((b) => b.indexed).join(",")]);
  async function upload(files: FileList | File[] | null) {
    if (!files || uploading.current) return;
    uploading.current = true;
    const list = Array.from(files);
    for (let i = 0; i < list.length; i++) {
      try {
        await importPDF(list[i], (value) =>
          setProgress({
            name: list[i].name,
            value,
            total: list.length,
            current: i + 1,
          }),
        );
        notify(`«${list[i].name}» добавлена`);
      } catch (e) {
        notify(errorMessage(e));
      }
    }
    setProgress(null);
    uploading.current = false;
    if (input.current) input.current.value = "";
  }
  const filtered = books
    .filter(
      (b) =>
        (status === "all" || b.status === status) &&
        (!shelf || b.shelf === shelf) &&
        (!query ||
          `${b.title} ${b.author} ${b.tags.join(" ")}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()) ||
          hits.some((h) => h.bookId === b.id)),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "ru")
        : sort === "progress"
          ? percent(b) - percent(a)
          : sort === "added"
            ? b.addedAt - a.addedAt
            : b.openedAt - a.openedAt || b.addedAt - a.addedAt,
    );
  const current = [...books]
    .filter((b) => b.status === "reading")
    .sort((a, b) => b.openedAt - a.openedAt)[0];
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <div className="page-heading">
        <div>
          <div className="eyebrow">ВАШЕ МЕСТО ДЛЯ ЧТЕНИЯ</div>
          <h1>
            {readingOnly ? "Сейчас читаю" : "Моя библиотека"}
            <span className="count">{books.length}</span>
          </h1>
          <p>Хорошая книга. Немного тишины. Время для себя.</p>
        </div>
        <button
          className="primary"
          onClick={() => input.current?.click()}
          disabled={!!progress}
        >
          <Plus size={19} /> Добавить PDF
        </button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => void upload(e.target.files)}
        />
      </div>
      {!readingOnly && current && (
        <section className="continue-card">
          <div className="continue-cover">
            {current.cover && <img src={current.cover} alt="" />}
          </div>
          <div>
            <div className="eyebrow">ПРОДОЛЖИТЬ ЧТЕНИЕ</div>
            <h2>{current.title}</h2>
            <p>
              {current.author || "Автор не указан"} · страница{" "}
              {current.position.page} из {current.pageCount}
            </p>
            <div className="progress-track">
              <i style={{ width: `${percent(current)}%` }} />
            </div>
          </div>
          <button className="primary" onClick={() => open(current)}>
            Продолжить <ArrowUpRight size={18} />
          </button>
        </section>
      )}
      <div className="library-tools">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Поиск по библиотеке"
            placeholder="Название, автор или фраза из книги"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Сортировка"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">Недавно открытые</option>
          <option value="title">По названию</option>
          <option value="progress">По прогрессу</option>
          <option value="added">По дате добавления</option>
        </select>
        <select
          aria-label="Полка"
          value={shelf}
          onChange={(e) => setShelf(e.target.value)}
        >
          <option value="">Все полки</option>
          {Array.from(new Set(books.map((b) => b.shelf).filter(Boolean))).map(
            (s) => (
              <option key={s}>{s}</option>
            ),
          )}
        </select>
      </div>
      <div className="tabs">
        {(["all", "want", "reading", "done"] as const).map((s) => (
          <button
            key={s}
            aria-pressed={status === s}
            className={status === s ? "active" : ""}
            onClick={() => setStatus(s)}
          >
            {s === "all" ? "Все книги" : statuses[s]}{" "}
            <small>
              {books.filter((b) => s === "all" || b.status === s).length}
            </small>
          </button>
        ))}
      </div>
      {progress && (
        <div className="upload-progress" role="status">
          <Upload size={20} />
          <div>
            Добавляем {progress.current} из {progress.total}: {progress.name}
            <progress max="100" value={progress.value} />
          </div>
        </div>
      )}
      {drag && (
        <div className="drop-overlay">
          <Upload size={50} />
          <h2>Отпустите PDF здесь</h2>
          <p>Можно добавить несколько книг сразу</p>
        </div>
      )}
      {!filtered.length ? (
        <Empty
          title={
            books.length
              ? "Здесь пока нет книг"
              : "Ваша следующая история начинается здесь"
          }
          description={
            books.length
              ? "Измените поиск или выберите другой статус."
              : "Перетащите PDF в окно или добавьте первую книгу. Мы запомним, где вы остановились."
          }
          action={
            !books.length ? (
              <button
                className="primary"
                onClick={() => input.current?.click()}
              >
                <Plus size={18} /> Добавить первую книгу
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="book-grid">
          {filtered.map((b, index) => (
            <article className="book-card" key={b.id}>
              <button
                className={`cover cover-${index % 4}`}
                onClick={() => open(b)}
                aria-label={`Читать ${b.title}`}
              >
                {b.cover ? (
                  <img
                    src={b.cover}
                    alt={`Обложка ${b.title}`}
                    loading="lazy"
                  />
                ) : (
                  <BookOpen size={50} />
                )}
                <span className="cover-open">
                  Открыть книгу <ArrowUpRight size={16} />
                </span>
              </button>
              <div className="book-info">
                <div className="book-title-row">
                  <h3>
                    <button onClick={() => open(b)}>{b.title}</button>
                  </h3>
                  <button
                    className="icon"
                    aria-label={`Изменить ${b.title}`}
                    onClick={() => setEdit({ ...b })}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                </div>
                <p>{b.author || "Автор не указан"}</p>
                <div className="book-meta">
                  <span className={`status ${b.status}`}>
                    {b.status === "done" && <Check size={12} />}{" "}
                    {statuses[b.status]}
                  </span>
                  <span>{percent(b)}%</span>
                </div>
                <div className="progress-track">
                  <i style={{ width: `${percent(b)}%` }} />
                </div>
                {b.shelf && (
                  <div className="shelf-label">
                    <Folder size={13} />
                    {b.shelf}
                  </div>
                )}
                {b.tags.length > 0 && (
                  <div className="tag-row">
                    {b.tags.map((t) => (
                      <button key={t} onClick={() => setQuery(t)}>
                        #{t}
                      </button>
                    ))}
                  </div>
                )}
                {b.indexed < b.pageCount && (
                  <small className="muted">
                    {b.indexError ? (
                      <button onClick={() => notify(b.indexError!)}>
                        Ошибка индексации
                      </button>
                    ) : (
                      `Индексация ${b.indexed}/${b.pageCount}`
                    )}
                  </small>
                )}
                {query &&
                  hits
                    .filter((h) => h.bookId === b.id)
                    .slice(0, 3)
                    .map((h) => (
                      <button
                        className="search-hit"
                        key={h.page}
                        onClick={() => open(b, h.page)}
                      >
                        <span>Стр. {h.page}</span> …{h.excerpt}…
                      </button>
                    ))}
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="local-hint">
        <span className="online-dot" /> Книги хранятся только на этом
        устройстве. Читайте без интернета.
      </p>
      {edit && (
        <Modal title="О книге" close={() => setEdit(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await db.books.update(edit.id, {
                title: edit.title.trim() || "Без названия",
                author: edit.author,
                shelf: edit.shelf,
                tags: [
                  ...new Set(edit.tags.map((t) => t.trim()).filter(Boolean)),
                ],
                status: edit.status,
              });
              setEdit(null);
            }}
          >
            <Field label="Название">
              <input
                required
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </Field>
            <Field label="Автор">
              <input
                value={edit.author}
                onChange={(e) => setEdit({ ...edit, author: e.target.value })}
              />
            </Field>
            <Field label="Статус">
              <select
                value={edit.status}
                onChange={(e) =>
                  setEdit({ ...edit, status: e.target.value as Status })
                }
              >
                {Object.entries(statuses).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Полка">
              <input
                value={edit.shelf}
                onChange={(e) => setEdit({ ...edit, shelf: e.target.value })}
                placeholder="Например, любимые книги"
              />
            </Field>
            <Field label="Теги через запятую">
              <input
                value={edit.tags.join(", ")}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    tags: e.target.value.split(",").map((s) => s.trimStart()),
                  })
                }
              />
            </Field>
            <div className="modal-actions">
              <button
                type="button"
                className="danger"
                onClick={async () => {
                  if (confirm(`Удалить «${edit.title}» и её заметки?`)) {
                    await removeBook(edit.id);
                    setEdit(null);
                  }
                }}
              >
                Удалить книгу
              </button>
              <button className="primary">Сохранить</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
