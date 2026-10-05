import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Library as LibraryIcon,
  Highlighter,
  ChartNoAxesColumn,
  Settings2,
  Languages,
  Leaf,
  WifiOff,
  X,
  Download,
} from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Library } from "./features/Library";
import { Reader } from "./features/Reader";
import { Notes } from "./features/Notes";
import { Stats } from "./features/Stats";
import { Vocabulary } from "./features/Vocabulary";
import { Settings } from "./features/Settings";
import { defaults, type Preferences, type Book } from "./lib/types";
import { db } from "./lib/db";
import { indexBook } from "./lib/pdf";
import { t } from "./lib/i18n";
type Screen =
  "library" | "reading" | "notes" | "stats" | "vocabulary" | "settings";
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
function loadPrefs(): Preferences {
  try {
    const parsed = JSON.parse(localStorage.getItem("list-prefs") || "{}");
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}
export default function App() {
  const [screen, setScreen] = useState<Screen>("library"),
    [book, setBook] = useState<Book | null>(null),
    [prefs, setPrefs] = useState(loadPrefs),
    [toast, setToast] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [install, setInstall] = useState<InstallPrompt | null>(null),
    [now, setNow] = useState(new Date());
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  const notify = useCallback((s: string) => setToast(s), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const prompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("beforeinstallprompt", prompt);
    const timer = setInterval(() => setNow(new Date()), 60000);
    void db.books
      .toArray()
      .then((books) =>
        books
          .filter((b) => b.indexed < b.pageCount)
          .reduce(
            (promise, b) => promise.then(() => indexBook(b.id)),
            Promise.resolve(),
          ),
      );
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("beforeinstallprompt", prompt);
      clearInterval(timer);
    };
  }, []);
  function change(p: Partial<Preferences>) {
    setPrefs((current) => {
      const next = { ...current, ...p };
      try {
        localStorage.setItem("list-prefs", JSON.stringify(next));
      } catch {
        notify("Не удалось сохранить настройки: хранилище недоступно");
      }
      return next;
    });
  }
  function open(b: Book, page?: number) {
    setBook(page ? { ...b, position: { page, fraction: 0 } } : b);
  }
  const theme =
    prefs.theme === "auto"
      ? now.getHours() >= 7 && now.getHours() < 20
        ? "light"
        : "dark"
      : prefs.theme;
  const nav = [
    { id: "library", label: t.library, icon: LibraryIcon },
    { id: "reading", label: t.reading, icon: BookOpen },
    { id: "notes", label: t.notes, icon: Highlighter },
    { id: "stats", label: t.stats, icon: ChartNoAxesColumn },
    { id: "vocabulary", label: t.vocabulary, icon: Languages },
    { id: "settings", label: t.settings, icon: Settings2 },
  ] as const;
  return (
    <div data-theme={theme} className="app-shell">
      {book ? (
        <Reader
          key={book.id}
          initial={book}
          prefs={prefs}
          change={change}
          back={() => setBook(null)}
          notify={notify}
        />
      ) : (
        <>
          <aside className="sidebar">
            <a
              href="#"
              className="brand"
              onClick={(e) => {
                e.preventDefault();
                setScreen("library");
              }}
            >
              <div className="brand-symbol">
                <BookOpen size={26} />
              </div>
              <span>
                лист<small>ВАША ЛИЧНАЯ БИБЛИОТЕКА</small>
              </span>
            </a>
            <div className="sidebar-label">МОЁ ПРОСТРАНСТВО</div>
            <nav>
              {nav.map((n) => (
                <button
                  key={n.id}
                  className={screen === n.id ? "active" : ""}
                  aria-current={screen === n.id ? "page" : undefined}
                  onClick={() => setScreen(n.id)}
                >
                  <n.icon size={20} />
                  {n.label}
                </button>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <Leaf size={25} />
              <p>
                Побудьте
                <br />
                наедине с книгой.
              </p>
              <small>Без шума. В своём ритме.</small>
              <div className="device-badge">
                {online ? (
                  <span className="online-dot" />
                ) : (
                  <WifiOff size={13} />
                )}{" "}
                {online ? "Локальная библиотека" : "Офлайн — всё под рукой"}
              </div>
            </div>
          </aside>
          <div className="main-shell">
            <header className="topbar">
              <span>Больше страниц. Меньше суеты.</span>
              <div>
                <span className="desktop-date">
                  {now.toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                  })}
                </span>
                {install && (
                  <button
                    className="secondary"
                    onClick={() => {
                      void install.prompt();
                      setInstall(null);
                    }}
                  >
                    <Download size={15} /> Установить
                  </button>
                )}
                <button
                  className="avatar"
                  aria-label="Открыть настройки"
                  onClick={() => setScreen("settings")}
                >
                  Я
                </button>
              </div>
            </header>
            <main>
              {screen === "library" || screen === "reading" ? (
                <Library
                  key={screen}
                  open={open}
                  notify={notify}
                  readingOnly={screen === "reading"}
                />
              ) : screen === "notes" ? (
                <Notes open={open} notify={notify} />
              ) : screen === "stats" ? (
                <Stats prefs={prefs} change={change} />
              ) : screen === "vocabulary" ? (
                <Vocabulary />
              ) : (
                <Settings
                  prefs={prefs}
                  change={change}
                  notify={notify}
                  install={
                    install
                      ? () => {
                          void install.prompt();
                          setInstall(null);
                        }
                      : null
                  }
                />
              )}
            </main>
            <nav className="mobile-nav">
              {nav.slice(0, 4).map((n) => (
                <button
                  key={n.id}
                  className={screen === n.id ? "active" : ""}
                  aria-current={screen === n.id ? "page" : undefined}
                  onClick={() => setScreen(n.id)}
                >
                  <n.icon size={21} />
                  <span>{n.label}</span>
                </button>
              ))}
              <button
                className={
                  screen === "settings" || screen === "vocabulary"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setScreen(screen === "settings" ? "vocabulary" : "settings")
                }
                aria-label="Настройки; повторный тап открывает словарь"
              >
                <Settings2 size={21} />
                <span>Ещё</span>
              </button>
            </nav>
          </div>
        </>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            className="icon"
            aria-label="Закрыть уведомление"
            onClick={() => setToast("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {(needRefresh || offlineReady) && (
        <div className="pwa-notice" role="status">
          <p>
            {needRefresh
              ? "Доступна новая версия. Сохраните работу и обновите приложение."
              : "Приложение готово к чтению без интернета."}
          </p>
          {needRefresh && (
            <button
              className="primary"
              onClick={() => void updateServiceWorker(true)}
            >
              Обновить
            </button>
          )}
          <button
            className="icon"
            aria-label="Закрыть уведомление PWA"
            onClick={() => {
              setNeedRefresh(false);
              setOfflineReady(false);
            }}
          >
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
