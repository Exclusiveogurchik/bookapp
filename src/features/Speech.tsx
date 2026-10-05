import { useEffect, useState, useRef } from "react";
import { Play, Square } from "lucide-react";
import { Field } from "../components/ui";
import type { Preferences } from "../lib/types";
export function Speech({
  text,
  prefs,
  change,
  onWord,
  onNext,
}: {
  text: string;
  prefs: Preferences;
  change: (p: Partial<Preferences>) => void;
  onWord: (n: number) => void;
  onNext: () => void;
}) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]),
    [playing, setPlaying] = useState(false);
  const nextRef = useRef(onNext);
  nextRef.current = onNext;
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const update = () => setVoices(speechSynthesis.getVoices());
    update();
    speechSynthesis.addEventListener("voiceschanged", update);
    return () => {
      speechSynthesis.removeEventListener("voiceschanged", update);
      speechSynthesis.cancel();
      onWord(-1);
    };
  }, []);
  useEffect(() => {
    if (!playing || !text || !("speechSynthesis" in window)) return;
    let stopped = false;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ru-RU";
    utterance.voice =
      voices.find((v) => v.voiceURI === prefs.voice) ||
      voices.find((v) => v.lang.startsWith("ru")) ||
      null;
    utterance.rate = prefs.rate;
    utterance.onboundary = (e) => onWord(e.charIndex);
    utterance.onend = () => {
      if (!stopped) nextRef.current();
    };
    utterance.onerror = () => {
      if (!stopped) setPlaying(false);
    };
    speechSynthesis.speak(utterance);
    return () => {
      stopped = true;
      speechSynthesis.cancel();
      onWord(-1);
    };
  }, [playing, text, prefs.rate, prefs.voice]);
  useEffect(() => {
    if (!playing || !prefs.sleep) return;
    const timer = setTimeout(() => setPlaying(false), prefs.sleep * 60000);
    return () => clearTimeout(timer);
  }, [playing, prefs.sleep]);
  return (
    <div>
      {!("speechSynthesis" in window) ? (
        <p>Браузер не поддерживает озвучку.</p>
      ) : (
        <>
          <button
            className="primary"
            disabled={!text}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Square size={17} /> : <Play size={17} />}{" "}
            {playing ? "Остановить" : "Слушать страницу"}
          </button>
          <Field label="Голос">
            <select
              value={prefs.voice}
              onChange={(e) => change({ voice: e.target.value })}
            >
              <option value="">Русский голос по умолчанию</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Скорость · ${prefs.rate}×`}>
            <input
              type="range"
              min=".5"
              max="2"
              step=".1"
              value={prefs.rate}
              onChange={(e) => change({ rate: +e.target.value })}
            />
          </Field>
          <Field label="Таймер сна">
            <select
              value={prefs.sleep}
              onChange={(e) => change({ sleep: +e.target.value })}
            >
              <option value="0">Выключен</option>
              <option value="5">5 минут</option>
              <option value="15">15 минут</option>
              <option value="30">30 минут</option>
              <option value="60">60 минут</option>
            </select>
          </Field>
          <p className="muted">
            Доступные голоса и подсветка слов зависят от браузера. Некоторые
            системные голоса требуют интернет.
          </p>
        </>
      )}
    </div>
  );
}
