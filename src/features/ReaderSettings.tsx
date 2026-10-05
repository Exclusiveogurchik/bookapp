import { Field } from "../components/ui";
import type { Preferences, Theme } from "../lib/types";
export function ReaderSettings({
  prefs,
  change,
}: {
  prefs: Preferences;
  change: (p: Partial<Preferences>) => void;
}) {
  return (
    <div className="reader-settings">
      <div className="theme-choices">
        {(
          [
            ["light", "Светлая"],
            ["sepia", "Сепия"],
            ["dark", "Тёмная"],
            ["black", "AMOLED"],
            ["auto", "Авто"],
          ] as [Theme, string][]
        ).map(([value, name]) => (
          <button
            aria-pressed={prefs.theme === value}
            key={value}
            className={`theme-chip ${value}`}
            onClick={() => change({ theme: value })}
          >
            {name}
          </button>
        ))}
      </div>
      <Field label={`Размер шрифта · ${prefs.fontSize}px`}>
        <input
          type="range"
          min="14"
          max="36"
          value={prefs.fontSize}
          onChange={(e) => change({ fontSize: +e.target.value })}
        />
      </Field>
      <Field label={`Межстрочный интервал · ${prefs.lineHeight}`}>
        <input
          type="range"
          min="1.2"
          max="2.5"
          step=".1"
          value={prefs.lineHeight}
          onChange={(e) => change({ lineHeight: +e.target.value })}
        />
      </Field>
      <Field label={`Поля · ${prefs.padding}px`}>
        <input
          type="range"
          min="12"
          max="100"
          value={prefs.padding}
          onChange={(e) => change({ padding: +e.target.value })}
        />
      </Field>
      <Field label="Шрифт">
        <select
          value={prefs.font}
          onChange={(e) => change({ font: e.target.value })}
        >
          <option value="serif">С засечками</option>
          <option value="sans">Без засечек</option>
          <option value="mono">Моноширинный</option>
          <option value="dyslexic">OpenDyslexic</option>
        </select>
      </Field>
      <Field label="Выравнивание">
        <select
          value={prefs.align}
          onChange={(e) =>
            change({ align: e.target.value as Preferences["align"] })
          }
        >
          <option value="left">По левому краю</option>
          <option value="justify">По ширине</option>
        </select>
      </Field>
      <Field label="Перелистывание">
        <select
          value={prefs.flow}
          onChange={(e) =>
            change({ flow: e.target.value as Preferences["flow"] })
          }
        >
          <option value="pages">По страницам PDF</option>
          <option value="scroll">Непрерывная прокрутка</option>
        </select>
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={prefs.ruler}
          onChange={(e) => change({ ruler: e.target.checked })}
        />{" "}
        Линейка чтения
      </label>
      <p className="muted">Автотема: светлая с 7:00 до 20:00, тёмная ночью.</p>
    </div>
  );
}
