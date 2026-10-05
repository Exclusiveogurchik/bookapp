import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Trash2, RotateCcw } from "lucide-react";
import { db } from "../lib/db";
import { Empty } from "../components/ui";
export function Vocabulary() {
  const words =
    useLiveQuery(() =>
      db.vocabulary.orderBy("createdAt").reverse().toArray(),
    ) ?? [];
  const [practice, setPractice] = useState(false),
    [shown, setShown] = useState(false),
    [index, setIndex] = useState(0);
  const due = words.filter((w) => w.due <= Date.now()),
    word = due[index % due.length];
  async function review(known: boolean) {
    if (!word) return;
    await db.vocabulary.update(word.id, {
      reviews: known ? word.reviews + 1 : 0,
      due:
        Date.now() +
        (known ? Math.min(30, 2 ** word.reviews) * 86400000 : 60000),
    });
    setShown(false);
    setIndex(0);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">СЛОВА, КОТОРЫЕ СТАЛИ ВАШИМИ</div>
          <h1>Мой словарь</h1>
          <p>Выделяйте слова в книгах и повторяйте их здесь.</p>
        </div>
        <button
          className="primary"
          disabled={!due.length}
          onClick={() => {
            setPractice(!practice);
            setShown(false);
          }}
        >
          <RotateCcw size={17} />
          {practice ? "К списку" : `Повторить · ${due.length}`}
        </button>
      </div>
      {practice && word ? (
        <section className="flashcard">
          <span className="eyebrow">НА ПОВТОРЕНИЕ · {due.length}</span>
          <h2>{word.word}</h2>
          {shown ? (
            <>
              <p>{word.translation}</p>
              <p className="muted">{word.definition}</p>
              <div className="row">
                <button
                  className="secondary"
                  onClick={() => void review(false)}
                >
                  Ещё повторить
                </button>
                <button className="primary" onClick={() => void review(true)}>
                  Знаю
                </button>
              </div>
            </>
          ) : (
            <button className="secondary" onClick={() => setShown(true)}>
              Показать ответ
            </button>
          )}
        </section>
      ) : !words.length ? (
        <Empty
          title="Любопытство — хорошая привычка"
          description="Выделите слово в книге, нажмите «Словарь» и сохраните перевод."
        />
      ) : (
        <div className="word-list">
          {words.map((w) => (
            <article key={w.id}>
              <div>
                <h3>{w.word}</h3>
                <p>{w.translation}</p>
                <small>{w.definition}</small>
              </div>
              <button
                className="icon"
                aria-label={`Удалить слово ${w.word}`}
                onClick={() => void db.vocabulary.delete(w.id)}
              >
                <Trash2 size={17} />
              </button>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
