export type Status = "want" | "reading" | "done";
export type Theme = "light" | "sepia" | "dark" | "black" | "auto";
export interface Book {
  id: string;
  title: string;
  author: string;
  cover: string;
  pageCount: number;
  size: number;
  addedAt: number;
  openedAt: number;
  status: Status;
  tags: string[];
  shelf: string;
  position: { page: number; fraction: number };
  indexed: number;
  indexError?: string;
  outline: { title: string; page: number }[];
}
export interface Page {
  bookId: string;
  page: number;
  text: string;
  blocks: { text: string; heading: boolean; start: number }[];
  words: number;
}
export interface Annotation {
  id: string;
  bookId: string;
  page: number;
  start: number;
  end: number;
  text: string;
  note: string;
  color: "yellow" | "green" | "pink" | "blue";
  createdAt: number;
  kind: "highlight" | "bookmark";
}
export interface Vocabulary {
  id: string;
  word: string;
  definition: string;
  translation: string;
  bookId: string;
  createdAt: number;
  reviews: number;
  due: number;
}
export interface DailyStat {
  date: string;
  seconds: number;
  pages: number;
  words: number;
}
export interface Preferences {
  theme: Theme;
  mode: "reflow" | "original";
  font: string;
  fontSize: number;
  lineHeight: number;
  padding: number;
  align: "left" | "justify";
  flow: "scroll" | "pages";
  ruler: boolean;
  goal: number;
  aiKey: string;
  voice: string;
  rate: number;
  sleep: number;
}
export const defaults: Preferences = {
  theme: "light",
  mode: "reflow",
  font: "serif",
  fontSize: 21,
  lineHeight: 1.8,
  padding: 36,
  align: "left",
  flow: "pages",
  ruler: false,
  goal: 20,
  aiKey: "",
  voice: "",
  rate: 1,
  sleep: 0,
};
export const statuses: Record<Status, string> = {
  want: "Хочу прочитать",
  reading: "Читаю",
  done: "Прочитано",
};
export const percent = (book: Book) =>
  book.status === "done"
    ? 100
    : Math.round(
        ((book.position.page - 1 + book.position.fraction) /
          Math.max(1, book.pageCount)) *
          100,
      );
export const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
