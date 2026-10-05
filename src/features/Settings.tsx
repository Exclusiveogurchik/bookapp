import { useState, useRef } from "react";
import {
  Download,
  Upload,
  ShieldCheck,
  HardDrive,
  Monitor,
} from "lucide-react";
import { exportBackup, importBackup } from "../lib/backup";
import type { Preferences } from "../lib/types";
import { Field } from "../components/ui";
import { ReaderSettings } from "./ReaderSettings";
export function Settings({
  prefs,
  change,
  notify,
  install,
}: {
  prefs: Preferences;
  change: (p: Partial<Preferences>) => void;
  notify: (s: string) => void;
  install: (() => void) | null;
}) {
  const [busy, setBusy] = useState(false),
    [usage, setUsage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      notify("Готово");
    } catch (e) {
      notify(
        (e as Error).name === "ZodError"
          ? "Некорректный формат резервной копии"
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">УСТРОЙТЕСЬ ПОУДОБНЕЕ</div>
          <h1>Настройки</h1>
          <p>Всё для вашего способа чтения.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="settings-card">
          <h2>Внешний вид и чтение</h2>
          <ReaderSettings prefs={prefs} change={change} />
        </section>
        <div>
          <section className="settings-card">
            <h2>
              <HardDrive size={20} /> Резервная копия
            </h2>
            <p>
              Экспорт включает PDF, позиции, заметки, словарь и статистику.
              API-ключ в копию не попадает. Импорт объединяет библиотеки и
              заменяет совпадающие записи.
            </p>
            <div className="row">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void action(exportBackup)}
              >
                <Download size={17} />
                {busy ? "Подождите…" : "Экспорт JSON"}
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                <Upload size={17} /> Импорт JSON
              </button>
            </div>
            <input
              type="file"
              ref={input}
              hidden
              accept=".json,application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (
                  f &&
                  confirm(
                    "Импорт заменит совпадающие книги и статистику. Продолжить?",
                  )
                )
                  void action(() => importBackup(f));
                e.target.value = "";
              }}
            />
            <button
              className="text-button"
              onClick={async () => {
                const e = await navigator.storage?.estimate();
                setUsage(
                  e
                    ? `Занято ${Math.round((e.usage ?? 0) / 1024 / 1024)} МБ из ~${Math.round((e.quota ?? 0) / 1024 / 1024)} МБ`
                    : "Браузер не сообщает объём хранилища",
                );
                const persisted = await navigator.storage?.persist();
                if (persisted)
                  notify("Браузер разрешил постоянное хранение данных");
              }}
            >
              Проверить место и запросить постоянное хранение
            </button>
            <p className="muted">{usage}</p>
          </section>
          <section className="settings-card">
            <h2>
              <Monitor size={20} /> Приложение на компьютере
            </h2>
            <p>
              Установите «Лист» через меню браузера: «Установить приложение».
              После первого открытия библиотека и читалка работают офлайн.
            </p>
            {install && (
              <button className="primary" onClick={install}>
                Установить «Лист»
              </button>
            )}
          </section>
          <section className="settings-card">
            <h2>
              <ShieldCheck size={20} /> ИИ — по желанию
            </h2>
            <p>
              Ключ хранится только в этом браузере. Выбранный текст отправляется
              Anthropic лишь по вашей команде. Не используйте общий компьютер
              для хранения ключа.
            </p>
            <Field label="Anthropic API-ключ">
              <input
                type="password"
                autoComplete="off"
                placeholder="sk-ant-…"
                value={prefs.aiKey}
                onChange={(e) => change({ aiKey: e.target.value })}
              />
            </Field>
            <button
              className="text-button"
              onClick={() => change({ aiKey: "" })}
            >
              Удалить ключ
            </button>
          </section>
          <section className="settings-card">
            <h2>Горячие клавиши</h2>
            <p>
              ← / → — страницы · F — фокус · / — поиск · B — закладка · T — тема
              · Esc — закрыть меню
            </p>
            <p className="muted">
              Очистка данных браузера удаляет книги. Делайте резервные копии
              важных файлов.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
