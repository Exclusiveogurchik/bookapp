import { StrictMode, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/opendyslexic/400.css";
import App from "./App";
import "./styles.css";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="fatal">
        <h1>Не удалось запустить «Лист»</h1>
        <p>
          Обновите страницу и проверьте, что браузер разрешает локальное
          хранение данных.
        </p>
        <button onClick={() => location.reload()}>Обновить</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
