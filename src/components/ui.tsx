import { X, LoaderCircle } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon" aria-label="Закрыть" onClick={close}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Busy({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="busy">
      <LoaderCircle className="animate-spin" size={22} />
      {label}
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <svg viewBox="0 0 180 140" aria-hidden="true">
        <circle cx="90" cy="70" r="58" fill="var(--soft)" />
        <path
          d="M40 43q27-8 50 8q23-16 50-8v66q-27-8-50 8q-23-16-50-8Z"
          fill="var(--surface)"
          stroke="var(--accent)"
          strokeWidth="2"
        />
        <path
          d="M90 51v65M52 60l25 7M52 74l25 7M105 66l22-6M105 80l22-6"
          stroke="var(--accent)"
          strokeWidth="2"
        />
        <path
          d="m126 25 6-9m-83 9-6-9m47 3V7"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
