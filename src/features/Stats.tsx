import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Flame, Clock, BookOpen, Target } from "lucide-react";
import { db } from "../lib/db";
import { localDay, type Preferences } from "../lib/types";
export function Stats({
  prefs,
  change,
}: {
  prefs: Preferences;
  change: (p: Partial<Preferences>) => void;
}) {
  const stats = useLiveQuery(() => db.stats.toArray()) ?? [],
    books = useLiveQuery(() => db.books.toArray()) ?? [];
  const [days, setDays] = useState(7);
  const today = stats.find((s) => s.date === localDay());
  const total = stats.reduce((s, d) => s + d.seconds, 0);
  let streak = 0;
  const cursor = new Date();
  if (!today?.seconds) cursor.setDate(cursor.getDate() - 1);
  while (stats.find((s) => s.date === localDay(cursor))?.seconds) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const data = Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - days + 1 + i);
      return {
        date,
        minutes: Math.round(
          (stats.find((s) => s.date === localDay(date))?.seconds ?? 0) / 60,
        ),
      };
    }),
    max = Math.max(prefs.goal, ...data.map((d) => d.minutes), 1);
  const words = stats.reduce((s, d) => s + d.words, 0),
    pages = stats.reduce((s, d) => s + d.pages, 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">МАЛЕНЬКИЕ ШАГИ, БОЛЬШИЕ ИСТОРИИ</div>
          <h1>Ваш ритм чтения</h1>
          <p>Каждая минута с книгой имеет значение.</p>
        </div>
        <select
          aria-label="Период статистики"
          value={days}
          onChange={(e) => setDays(+e.target.value)}
        >
          <option value={7}>Последние 7 дней</option>
          <option value={30}>Последние 30 дней</option>
        </select>
      </div>
      <div className="stat-cards">
        {[
          { icon: Flame, value: streak, label: "Дней подряд" },
          {
            icon: Clock,
            value: Math.round(total / 60),
            label: "Минут с книгами",
          },
          {
            icon: BookOpen,
            value: books.filter((b) => b.status === "done").length,
            label: "Книг прочитано",
          },
          {
            icon: Target,
            value: `${Math.round((today?.seconds ?? 0) / 60)} / ${prefs.goal}`,
            label: "Минут сегодня",
          },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <s.icon size={22} />
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <section className="chart-card">
        <div className="section-title">
          <h2>Время для чтения</h2>
          <span className="muted">минуты в день</span>
        </div>
        <div
          className="chart"
          role="img"
          aria-label={`Чтение за ${days} дней: ${data.map((d) => `${d.date.toLocaleDateString("ru-RU")} — ${d.minutes} мин`).join("; ")}`}
        >
          <div
            className="goal-line"
            style={{ bottom: `${(prefs.goal / max) * 85}%` }}
          >
            <span>Цель {prefs.goal} мин</span>
          </div>
          {data.map((d) => (
            <div className="chart-column" key={localDay(d.date)}>
              <span className="bar-value">{d.minutes || ""}</span>
              <div
                className={`bar ${localDay(d.date) === localDay() ? "today" : ""}`}
                style={{ height: `${Math.max(2, (d.minutes / max) * 85)}%` }}
                title={`${d.date.toLocaleDateString("ru-RU")}: ${d.minutes} минут`}
              />
              <small>
                {days === 7
                  ? d.date.toLocaleDateString("ru-RU", { weekday: "short" })
                  : d.date.getDate()}
              </small>
            </div>
          ))}
        </div>
      </section>
      <div className="stat-details">
        <div>
          <strong>{pages}</strong>
          <span>Перелистано страниц</span>
        </div>
        <div>
          <strong>{words.toLocaleString("ru-RU")}</strong>
          <span>Слов на перелистанных страницах</span>
        </div>
        <div>
          <strong>
            {total && words ? Math.round(words / (total / 60)) : "—"}
          </strong>
          <span>Слов в минуту · оценка</span>
        </div>
      </div>
      <section className="goal-card">
        <div>
          <h2>Немного каждый день</h2>
          <p>Выберите цель, которую приятно поддерживать.</p>
        </div>
        <label>
          Цель:{" "}
          <input
            aria-label="Минут чтения в день"
            type="number"
            min="1"
            max="240"
            value={prefs.goal}
            onChange={(e) =>
              change({ goal: Math.max(1, Math.min(240, +e.target.value)) })
            }
          />{" "}
          мин / день
        </label>
      </section>
      <p className="muted">
        Время учитывается в активной вкладке; пауза наступает через минуту без
        действий. Страницы и слова считаются при соседнем перелистывании в этой
        сессии. Скорость приблизительная.
      </p>
    </>
  );
}
