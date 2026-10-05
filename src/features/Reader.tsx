import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Search,
  Settings2,
  List,
  Maximize,
  Minimize,
  Headphones,
  BookOpen,
  FileText,
  MessageSquare,
  Palette,
  X,
} from "lucide-react";
import { db, addStat } from "../lib/db";
import { openPDF, getPageText, errorMessage } from "../lib/pdf";
import {
  type Book,
  type Page,
  type Preferences,
  type Annotation,
  localDay,
} from "../lib/types";
import { Busy, Modal } from "../components/ui";
import { ReaderSettings } from "./ReaderSettings";
import { PdfPage } from "./PdfPage";
import { Speech } from "./Speech";
import { AIHelp, DictionaryLookup } from "./Study";
import { QuoteCard } from "./QuoteCard";
type Panel =
  | "settings"
  | "outline"
  | "search"
  | "notes"
  | "speech"
  | "dictionary"
  | "ai"
  | "quote"
  | null;
const fonts: Record<string, string> = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: "system-ui, sans-serif",
  mono: "ui-monospace, monospace",
  dyslexic: "OpenDyslexic, sans-serif",
};
function Marked({
  text,
  start,
  notes,
  query,
  spoken,
}: {
  text: string;
  start: number;
  notes: Annotation[];
  query: string;
  spoken: number;
}) {
  const ranges = notes
    .filter(
      (a) =>
        a.kind === "highlight" &&
        a.end > start &&
        a.start < start + text.length,
    )
    .map((a) => ({
      start: Math.max(0, a.start - start),
      end: Math.min(text.length, a.end - start),
      className: `mark-${a.color}`,
      title: a.note,
    }));
  if (query) {
    let i = 0;
    const q = query.toLocaleLowerCase(),
      lower = text.toLocaleLowerCase();
    while ((i = lower.indexOf(q, i)) !== -1) {
      ranges.push({
        start: i,
        end: i + q.length,
        className: "search-mark",
        title: "Результат поиска",
      });
      i += q.length;
    }
  }
  if (spoken >= start && spoken < start + text.length) {
    const i = spoken - start;
    const end = text.slice(i).search(/\s/u);
    ranges.push({
      start: i,
      end: end < 0 ? text.length : i + end,
      className: "spoken",
      title: "Озвучка",
    });
  }
  const boundaries = [
    ...new Set([0, text.length, ...ranges.flatMap((r) => [r.start, r.end])]),
  ].sort((a, b) => a - b);
  return (
    <>
      {boundaries.slice(0, -1).map((s, i) => {
        const end = boundaries[i + 1],
          r = ranges.filter((r) => r.start <= s && r.end >= end).at(-1);
        return r ? (
          <mark key={s} className={r.className} title={r.title}>
            {text.slice(s, end)}
          </mark>
        ) : (
          <span key={s}>{text.slice(s, end)}</span>
        );
      })}
    </>
  );
}
export function Reader({
  initial,
  prefs,
  change,
  back,
  notify,
}: {
  initial: Book;
  prefs: Preferences;
  change: (p: Partial<Preferences>) => void;
  back: () => void;
  notify: (s: string) => void;
}) {
  const book =
    useLiveQuery(() => db.books.get(initial.id), [initial.id]) ?? initial;
  const notes =
    useLiveQuery(
      () => db.annotations.where("bookId").equals(initial.id).toArray(),
      [initial.id],
    ) ?? [];
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null),
    [pages, setPages] = useState<Record<number, Page>>({}),
    [page, setPage] = useState(initial.position.page),
    [error, setError] = useState(""),
    [panel, setPanel] = useState<Panel>(null),
    [focus, setFocus] = useState(false),
    [zoom, setZoom] = useState(1),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<
      { page: number; index: number; excerpt: string }[]
    >([]),
    [resultIndex, setResultIndex] = useState(0),
    [selection, setSelection] = useState<{
      text: string;
      start: number;
      end: number;
      page: number;
    } | null>(null),
    [noteText, setNoteText] = useState(""),
    [color, setColor] = useState<Annotation["color"]>("yellow"),
    [spoken, setSpoken] = useState(-1),
    [rulerY, setRulerY] = useState(170),
    [showSaved, setShowSaved] = useState(false);
  const trimmedHeight = useRef(0);
  const scroller = useRef<HTMLDivElement>(null),
    position = useRef({ ...initial.position }),
    idle = useRef(Date.now()),
    saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    restoring = useRef(true),
    pinch = useRef<{ distance: number; zoom: number } | null>(null),
    counted = useRef(new Set<number>()),
    searchRef = useRef<HTMLInputElement>(null),
    pageRef = useRef(page);
  pageRef.current = page;
  const current = pages[page];
  const [scrollWindow, setScrollWindow] = useState({
    start: initial.position.page,
    end: Math.min(book.pageCount, initial.position.page + 1),
  });
  const save = useCallback(() => {
    void db.books
      .update(initial.id, {
        position: { ...position.current },
        openedAt: Date.now(),
      })
      .catch((e) => notify(errorMessage(e)));
  }, [initial.id]);
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | undefined;
    void (async () => {
      const file = await db.files.get(initial.id);
      if (!file)
        throw new Error("Файл книги не найден. Восстановите резервную копию.");
      loaded = await openPDF(file.blob);
      if (cancelled) {
        await loaded.loadingTask.destroy();
        return;
      }
      setDoc(loaded);
      await db.books.update(initial.id, {
        openedAt: Date.now(),
        ...(initial.status === "want" ? { status: "reading" as const } : {}),
      });
    })().catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
      clearTimeout(saveTimer.current);
      save();
      void loaded?.loadingTask.destroy();
    };
  }, [initial.id]);
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const needed =
      prefs.mode === "reflow" && prefs.flow === "scroll"
        ? Array.from(
            { length: scrollWindow.end - scrollWindow.start + 1 },
            (_, i) => scrollWindow.start + i,
          )
        : [page];
    void (async () => {
      for (const p of needed) {
        if (pages[p]) continue;
        const text = await getPageText(doc, initial.id, p);
        if (cancelled) return;
        setPages((prev) => ({
          ...Object.fromEntries(
            Object.entries(prev).filter(([key]) => Math.abs(+key - page) < 6),
          ),
          [p]: text,
        }));
      }
    })().catch((e) => {
      if (!cancelled) setError(errorMessage(e));
    });
    return () => {
      cancelled = true;
    };
  }, [doc, page, scrollWindow.start, scrollWindow.end, prefs.mode, prefs.flow]);
  useLayoutEffect(() => {
    if (trimmedHeight.current && scroller.current) {
      scroller.current.scrollTop -= trimmedHeight.current;
      trimmedHeight.current = 0;
    }
  }, [scrollWindow.start]);
  useEffect(() => {
    if (!restoring.current) return;
    if (prefs.mode === "reflow" && !pages[page]) return;
    const el = scroller.current;
    if (!el) return;
    const timer = setTimeout(() => {
      const target = el.querySelector<HTMLElement>(
        `[data-page="${position.current.page}"]`,
      );
      if (prefs.mode === "reflow" && prefs.flow === "scroll" && target)
        el.scrollTop =
          target.offsetTop + target.offsetHeight * position.current.fraction;
      else
        el.scrollTop =
          (el.scrollHeight - el.clientHeight) * position.current.fraction;
      restoring.current = false;
    }, 80);
    return () => clearTimeout(timer);
  }, [current?.page, prefs.mode, prefs.flow]);
  useEffect(() => {
    const activity = () => {
      idle.current = Date.now();
    };
    const leave = () => save();
    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        document.hasFocus() &&
        Date.now() - idle.current < 60000 &&
        doc
      )
        void addStat(localDay(), 5);
    }, 5000);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    document.addEventListener("visibilitychange", leave);
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      document.removeEventListener("visibilitychange", leave);
      window.removeEventListener("pagehide", leave);
    };
  }, [doc, save]);
  const jump = useCallback(
    (target: number, fraction = 0) => {
      const p = Math.max(1, Math.min(book.pageCount, target));
      const old = pageRef.current;
      if (
        p !== old &&
        Math.abs(p - old) === 1 &&
        !counted.current.has(old) &&
        Date.now() - idle.current < 60000
      ) {
        counted.current.add(old);
        void addStat(localDay(), 0, 1, pages[old]?.words ?? 0);
      }
      restoring.current = true;
      position.current = { page: p, fraction };
      setPage(p);
      setScrollWindow({ start: p, end: Math.min(book.pageCount, p + 1) });
      setSelection(null);
      save();
      if (scroller.current) scroller.current.scrollTop = 0;
    },
    [book.pageCount, pages, save],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).matches(
          "input,textarea,select,[contenteditable]",
        ) ||
        panel
      )
        return;
      const k = e.key.toLowerCase();
      if (k === "arrowright") {
        e.preventDefault();
        jump(page + 1);
      }
      if (k === "arrowleft") {
        e.preventDefault();
        jump(page - 1);
      }
      if (k === "f") setFocus((f) => !f);
      if (k === "/") {
        e.preventDefault();
        setPanel("search");
      }
      if (k === "b") {
        e.preventDefault();
        void bookmark();
      }
      if (k === "t") {
        const themes = ["light", "sepia", "dark", "black"] as const;
        change({
          theme:
            themes[
              (themes.indexOf(prefs.theme as (typeof themes)[number]) + 1) %
                themes.length
            ],
        });
      }
      if (k === "escape") setFocus(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [page, jump, prefs.theme, panel]);
  useEffect(() => {
    if (panel === "search") setTimeout(() => searchRef.current?.focus(), 50);
  }, [panel]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      const all = await db.pages.where("bookId").equals(book.id).toArray();
      const q = query.toLocaleLowerCase(),
        hits: { page: number; index: number; excerpt: string }[] = [];
      for (const p of all.sort((a, b) => a.page - b.page)) {
        let i = 0;
        while ((i = p.text.toLocaleLowerCase().indexOf(q, i)) !== -1) {
          hits.push({
            page: p.page,
            index: i,
            excerpt: p.text.slice(Math.max(0, i - 30), i + 100),
          });
          i += q.length;
          if (hits.length >= 500) break;
        }
        if (hits.length >= 500) break;
      }
      if (!cancelled) {
        setResults(hits);
        setResultIndex(0);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, book.indexed]);
  function scroll() {
    if (restoring.current) return;
    idle.current = Date.now();
    const el = scroller.current;
    if (!el) return;
    if (prefs.mode === "reflow" && prefs.flow === "scroll") {
      const elements = Array.from(
        el.querySelectorAll<HTMLElement>("[data-page]"),
      );
      const active =
        elements.find(
          (t) => t.offsetTop + t.offsetHeight > el.scrollTop + 80,
        ) ?? elements.at(-1);
      if (active) {
        const p = +active.dataset.page!;
        position.current = {
          page: p,
          fraction: Math.max(
            0,
            Math.min(
              1,
              (el.scrollTop - active.offsetTop) / active.offsetHeight,
            ),
          ),
        };
        if (p !== pageRef.current) {
          const old = pageRef.current;
          if (Math.abs(old - p) === 1 && !counted.current.has(old)) {
            counted.current.add(old);
            void addStat(localDay(), 0, 1, pages[old]?.words ?? 0);
          }
          pageRef.current = p;
          setPage(p);
        }
        if (
          el.scrollHeight - el.clientHeight - el.scrollTop < 300 &&
          scrollWindow.end < book.pageCount
        ) {
          const start = Math.max(scrollWindow.start, scrollWindow.end - 3);
          if (start > scrollWindow.start) {
            const removed = elements.filter((t) => +t.dataset.page! < start);
            trimmedHeight.current = removed.reduce(
              (n, t) => n + t.offsetHeight,
              0,
            );
          }
          setScrollWindow({
            start,
            end: Math.min(book.pageCount, scrollWindow.end + 1),
          });
        }
      }
    } else
      position.current = {
        page,
        fraction:
          el.scrollHeight > el.clientHeight
            ? el.scrollTop / (el.scrollHeight - el.clientHeight)
            : 0,
      };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 350);
  }
  function captureSelection() {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return;
    const text = s.toString().trim();
    if (!text || text.length > 10000) return;
    const range = s.getRangeAt(0);
    const block = (
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement
    )?.closest("[data-start]") as HTMLElement | null;
    const endBlock = (
      range.endContainer instanceof Element
        ? range.endContainer
        : range.endContainer.parentElement
    )?.closest("[data-start]") as HTMLElement | null;
    if (
      block &&
      endBlock &&
      block.closest("[data-page]") === endBlock.closest("[data-page]")
    ) {
      const startRange = range.cloneRange();
      startRange.selectNodeContents(block);
      startRange.setEnd(range.startContainer, range.startOffset);
      const endRange = range.cloneRange();
      endRange.selectNodeContents(endBlock);
      endRange.setEnd(range.endContainer, range.endOffset);
      const p = +(
        block.closest<HTMLElement>("[data-page]")?.dataset.page ?? page
      );
      setSelection({
        text,
        start: +block.dataset.start! + startRange.toString().length,
        end: +endBlock.dataset.start! + endRange.toString().length,
        page: p,
      });
    } else if (prefs.mode === "original") {
      const index = current?.text.indexOf(text) ?? -1;
      setSelection({
        text,
        start: Math.max(0, index),
        end: Math.max(0, index) + text.length,
        page,
      });
    }
    setNoteText("");
  }
  async function bookmark() {
    await db.annotations.add({
      id: crypto.randomUUID(),
      bookId: book.id,
      page: position.current.page,
      start: position.current.fraction,
      end: 0,
      text: `Страница ${position.current.page}`,
      note: "",
      color: "yellow",
      createdAt: Date.now(),
      kind: "bookmark",
    });
    notify("Закладка сохранена");
  }
  async function highlight() {
    if (!selection) return;
    await db.annotations.add({
      id: crypto.randomUUID(),
      bookId: book.id,
      ...selection,
      note: noteText,
      color,
      kind: "highlight",
      createdAt: Date.now(),
    });
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  }
  function gotoHit(i: number) {
    if (!results.length) return;
    const next = (i + results.length) % results.length;
    setResultIndex(next);
    jump(results[next].page);
    setPanel(null);
    setTimeout(
      () =>
        scroller.current
          ?.querySelector(".search-mark")
          ?.scrollIntoView({ block: "center" }),
      250,
    );
  }
  const renderText = (p: Page) => (
    <section key={p.page} data-page={p.page} className="reflow-page">
      <div className="page-kicker">
        {book.title} <span>{p.page}</span>
      </div>
      {p.text ? (
        p.blocks.map((block, i) => {
          const Tag = block.heading ? "h2" : "p";
          return (
            <Tag data-start={block.start} key={i}>
              <Marked
                text={block.text}
                start={block.start}
                notes={notes.filter((n) => n.page === p.page)}
                query={query}
                spoken={p.page === page ? spoken : -1}
              />
            </Tag>
          );
        })
      ) : (
        <div className="scan-warning">
          <FileText size={32} />
          <h2>На этой странице нет текста</h2>
          <p>
            Похоже, это скан или иллюстрация. Посмотрите страницу в оригинале.
          </p>
          <button
            className="primary"
            onClick={() => change({ mode: "original" })}
          >
            Открыть оригинал
          </button>
        </div>
      )}
    </section>
  );
  const remaining = Math.max(0, book.pageCount - page),
    nextChapter =
      book.outline.find((o) => o.page > page)?.page ?? book.pageCount;
  const estimatedWpm = 220,
    wordsPerPage = current?.words || 250;
  return (
    <div className={`reader ${focus ? "focus" : ""}`}>
      <header className="reader-header">
        <button
          className="icon"
          aria-label="Вернуться в библиотеку"
          onClick={back}
        >
          <ArrowLeft size={21} />
        </button>
        <div className="reader-title">
          <strong>{book.title}</strong>
          <small>{book.author || "Ваша библиотека"}</small>
        </div>
        <div className="mode-switch">
          <button
            className={prefs.mode === "reflow" ? "active" : ""}
            onClick={() => change({ mode: "reflow" })}
          >
            <BookOpen size={16} />
            <span>Удобное чтение</span>
          </button>
          <button
            className={prefs.mode === "original" ? "active" : ""}
            onClick={() => change({ mode: "original" })}
          >
            <FileText size={16} />
            <span>Оригинал</span>
          </button>
        </div>
        <div className="reader-actions">
          {(
            [
              { icon: List, label: "Оглавление", panel: "outline" },
              { icon: Search, label: "Поиск в книге", panel: "search" },
              {
                icon: MessageSquare,
                label: "Заметки и закладки",
                panel: "notes",
              },
              { icon: Headphones, label: "Озвучка", panel: "speech" },
              { icon: Settings2, label: "Настройки чтения", panel: "settings" },
            ] as const
          ).map((a) => (
            <button
              className="icon"
              aria-label={a.label}
              title={a.label}
              key={a.panel}
              onClick={() => setPanel(a.panel)}
            >
              <a.icon size={19} />
            </button>
          ))}
          <button
            className="icon"
            aria-label="Добавить закладку"
            title="Закладка · B"
            onClick={() => void bookmark()}
          >
            <Bookmark size={19} />
          </button>
          <button
            className="icon"
            aria-label="Режим фокуса"
            title="Фокус · F"
            onClick={() => setFocus(true)}
          >
            <Maximize size={19} />
          </button>
        </div>
      </header>
      {focus && (
        <button
          className="focus-exit icon"
          aria-label="Выйти из фокуса"
          onClick={() => setFocus(false)}
        >
          <Minimize size={20} />
        </button>
      )}
      {prefs.mode === "original" && (
        <div className="zoom-bar">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            aria-label="Уменьшить масштаб"
          >
            −
          </button>
          <button onClick={() => setZoom(1)}>
            По ширине · {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            aria-label="Увеличить масштаб"
          >
            +
          </button>
        </div>
      )}
      <div
        ref={scroller}
        className={`reader-scroll ${prefs.mode === "original" ? "original" : ""}`}
        onScroll={scroll}
        onMouseUp={captureSelection}
        onTouchEnd={() => {
          pinch.current = null;
          setTimeout(captureSelection, 100);
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 2)
            pinch.current = {
              distance: Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY,
              ),
              zoom,
            };
        }}
        onTouchMove={(e) => {
          if (
            prefs.mode === "original" &&
            pinch.current &&
            e.touches.length === 2
          ) {
            const d = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY,
            );
            setZoom(
              Math.max(
                0.5,
                Math.min(4, (pinch.current.zoom * d) / pinch.current.distance),
              ),
            );
          }
        }}
        onDoubleClick={() => {
          if (prefs.mode === "original" && !window.getSelection()?.toString())
            setZoom((z) => (z === 1 ? 2 : 1));
        }}
        onPointerMove={(e) => {
          if (prefs.ruler) setRulerY(e.clientY);
        }}
        onClick={(e) => {
          if (!focus || selection || window.getSelection()?.toString()) return;
          const ratio = e.clientX / window.innerWidth;
          if (ratio < 0.25) jump(page - 1);
          else if (ratio > 0.75) jump(page + 1);
          else setFocus(false);
        }}
      >
        {error ? (
          <div className="scan-warning" role="alert">
            <h2>Не удалось открыть книгу</h2>
            <p>{error}</p>
            <button className="primary" onClick={back}>
              К библиотеке
            </button>
          </div>
        ) : !doc ? (
          <Busy label="Открываем книгу…" />
        ) : prefs.mode === "original" ? (
          <PdfPage
            doc={doc}
            page={page}
            zoom={zoom}
            onReady={() => {
              const el = scroller.current;
              if (el) {
                restoring.current = true;
                el.scrollTop =
                  (el.scrollHeight - el.clientHeight) *
                  position.current.fraction;
                requestAnimationFrame(() => {
                  restoring.current = false;
                });
              }
            }}
          />
        ) : (
          <div
            className="reflow"
            style={
              {
                fontFamily: fonts[prefs.font],
                fontSize: prefs.fontSize,
                lineHeight: prefs.lineHeight,
                textAlign: prefs.align,
                padding: `24px ${prefs.padding}px`,
              } as CSSProperties
            }
          >
            {prefs.flow === "scroll" ? (
              Array.from(
                { length: scrollWindow.end - scrollWindow.start + 1 },
                (_, i) => scrollWindow.start + i,
              ).map((p) =>
                pages[p] ? (
                  renderText(pages[p])
                ) : (
                  <Busy key={p} label={`Страница ${p}…`} />
                ),
              )
            ) : current ? (
              <div className="page-turn" key={page}>
                {renderText(current)}
              </div>
            ) : (
              <Busy label="Подготавливаем текст…" />
            )}
            {prefs.flow === "scroll" && scrollWindow.start > 1 && (
              <button
                className="secondary"
                onClick={() => jump(scrollWindow.start - 1)}
              >
                Предыдущая страница
              </button>
            )}
          </div>
        )}
      </div>
      {prefs.ruler && (
        <div
          className="reading-ruler"
          style={{
            top: rulerY - 22,
            height: prefs.fontSize * prefs.lineHeight + 10,
          }}
        />
      )}
      <footer className="reader-footer">
        <button
          className="icon"
          disabled={page <= 1}
          aria-label="Предыдущая страница"
          onClick={() => jump(page - 1)}
        >
          <ChevronLeft />
        </button>
        <div className="reader-progress">
          <div>
            <span>
              Страница {page} из {book.pageCount}
            </span>
            <span>
              {Math.round(
                ((page - 1 + position.current.fraction) / book.pageCount) * 100,
              )}
              %
            </span>
          </div>
          <input
            aria-label="Перейти к странице"
            type="range"
            min="1"
            max={book.pageCount}
            value={page}
            onChange={(e) => jump(+e.target.value)}
          />
          <small>
            До главы ~
            {Math.ceil(((nextChapter - page) * wordsPerPage) / estimatedWpm)}{" "}
            мин · до конца ~
            {Math.ceil((remaining * wordsPerPage) / estimatedWpm)} мин (оценка)
          </small>
        </div>
        <button
          className="icon"
          disabled={page >= book.pageCount}
          aria-label="Следующая страница"
          onClick={() => jump(page + 1)}
        >
          <ChevronRight />
        </button>
        {page === book.pageCount && (
          <button
            className="secondary done-button"
            onClick={() => {
              void db.books.update(book.id, { status: "done" });
              notify("Книга отмечена прочитанной");
            }}
          >
            Прочитано
          </button>
        )}
      </footer>
      {showSaved && (
        <div className="saved-note" role="status">
          Выделение сохранено
        </div>
      )}
      {selection && !panel && (
        <div className="selection-toolbar">
          <button
            className="icon close-selection"
            aria-label="Закрыть выделение"
            onClick={() => setSelection(null)}
          >
            <X size={16} />
          </button>
          <p>
            «{selection.text.slice(0, 100)}
            {selection.text.length > 100 ? "…" : ""}»
          </p>
          <div className="row">
            {(["yellow", "green", "pink", "blue"] as const).map((c) => (
              <button
                key={c}
                className={`color-dot mark-${c} ${color === c ? "selected" : ""}`}
                aria-label={`Цвет выделения: ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
              />
            ))}
            <button className="primary" onClick={() => void highlight()}>
              Выделить
            </button>
          </div>
          <input
            aria-label="Заметка к выделению"
            placeholder="Добавить мысль…"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <div className="row">
            <button onClick={() => setPanel("dictionary")}>Словарь</button>
            <button onClick={() => setPanel("quote")}>
              <Palette size={14} /> Цитата
            </button>
            <button onClick={() => setPanel("ai")}>Объяснить с ИИ</button>
          </div>
        </div>
      )}
      {panel && panel !== "speech" && (
        <Modal
          title={
            {
              settings: "Настройки чтения",
              outline: "Оглавление",
              search: "Поиск по книге",
              notes: "Выделения и закладки",
              speech: "Слушать книгу",
              dictionary: "Мой словарь",
              ai: "Помощь с текстом",
              quote: "Карточка цитаты",
            }[panel]
          }
          close={() => setPanel(null)}
          wide={panel === "quote"}
        >
          {panel === "settings" && (
            <ReaderSettings prefs={prefs} change={change} />
          )}
          {panel === "outline" &&
            (book.outline.length ? (
              book.outline.map((o, i) => (
                <button
                  className="toc-row"
                  key={i}
                  onClick={() => {
                    jump(o.page);
                    setPanel(null);
                  }}
                >
                  <span>{o.title}</span>
                  <small>{o.page}</small>
                </button>
              ))
            ) : (
              <p>
                Оглавление не найдено. Заголовки появятся после индексации
                текста, если PDF содержит их.
              </p>
            ))}
          {panel === "search" && (
            <>
              <label className="search">
                <Search size={18} />
                <input
                  ref={searchRef}
                  placeholder="Слово или фраза"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <p className="muted">
                Найдено: {results.length}. Проиндексировано {book.indexed} из{" "}
                {book.pageCount} страниц.
              </p>
              <div className="row">
                <button
                  className="secondary"
                  disabled={!results.length}
                  onClick={() => gotoHit(resultIndex - 1)}
                >
                  Предыдущий
                </button>
                <button
                  className="secondary"
                  disabled={!results.length}
                  onClick={() => gotoHit(resultIndex + 1)}
                >
                  Следующий
                </button>
              </div>
              {results.map((r, i) => (
                <button
                  className="search-hit"
                  key={`${r.page}-${r.index}`}
                  onClick={() => gotoHit(i)}
                >
                  <span>Стр. {r.page}</span> …{r.excerpt}…
                </button>
              ))}
            </>
          )}
          {panel === "notes" && (
            <>
              {!notes.length && (
                <p>
                  Выделите текст или нажмите на закладку, чтобы сохранить
                  важное.
                </p>
              )}
              {notes
                .sort((a, b) => a.page - b.page)
                .map((a) => (
                  <div className="note-item" key={a.id}>
                    <button
                      onClick={() => {
                        jump(a.page, a.kind === "bookmark" ? a.start : 0);
                        setPanel(null);
                        setTimeout(
                          () =>
                            scroller.current
                              ?.querySelector(`[data-start="${a.start}"]`)
                              ?.scrollIntoView({ block: "center" }),
                          200,
                        );
                      }}
                    >
                      <small>
                        Страница {a.page} ·{" "}
                        {a.kind === "bookmark" ? "Закладка" : "Выделение"}
                      </small>
                      <p>{a.text}</p>
                      {a.note && <p className="muted">{a.note}</p>}
                    </button>
                    <button
                      className="icon"
                      aria-label="Удалить заметку"
                      onClick={() => void db.annotations.delete(a.id)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
            </>
          )}
          {panel === "dictionary" && (
            <DictionaryLookup
              text={selection?.text ?? ""}
              bookId={book.id}
              notify={notify}
            />
          )}
          {panel === "ai" && (
            <AIHelp
              text={selection?.text ?? current?.text ?? ""}
              prefs={prefs}
            />
          )}
          {panel === "quote" && (
            <QuoteCard
              text={selection?.text ?? ""}
              book={book}
              notify={notify}
            />
          )}
        </Modal>
      )}
      <div
        className="speech-floating"
        style={{ display: panel === "speech" ? "block" : "none" }}
      >
        <header>
          <h2>Слушать книгу</h2>
          <button
            className="icon"
            aria-label="Свернуть панель озвучки"
            onClick={() => setPanel(null)}
          >
            <X size={18} />
          </button>
        </header>
        <Speech
          text={current?.text ?? ""}
          prefs={prefs}
          change={change}
          onWord={setSpoken}
          onNext={() =>
            pageRef.current < book.pageCount
              ? jump(pageRef.current + 1)
              : notify("Книга закончилась")
          }
        />
      </div>
    </div>
  );
}
