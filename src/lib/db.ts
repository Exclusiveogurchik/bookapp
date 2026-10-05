import Dexie, { type Table } from "dexie";
import type { Book, Page, Annotation, Vocabulary, DailyStat } from "./types";
class LibraryDB extends Dexie {
  books!: Table<Book, string>;
  files!: Table<{ id: string; blob: Blob }, string>;
  pages!: Table<Page, [string, number]>;
  annotations!: Table<Annotation, string>;
  vocabulary!: Table<Vocabulary, string>;
  stats!: Table<DailyStat, string>;
  constructor() {
    super("list-library");
    this.version(1).stores({
      books: "id,title,openedAt,status,shelf,*tags",
      files: "id",
      pages: "[bookId+page],bookId",
      annotations: "id,bookId,kind",
      vocabulary: "id,word,due",
      stats: "date",
    });
  }
}
export const db = new LibraryDB();
export async function removeBook(id: string) {
  await db.transaction(
    "rw",
    [db.books, db.files, db.pages, db.annotations],
    async () => {
      await db.books.delete(id);
      await db.files.delete(id);
      await db.pages.where("bookId").equals(id).delete();
      await db.annotations.where("bookId").equals(id).delete();
    },
  );
}
export async function addStat(
  date: string,
  seconds: number,
  pages = 0,
  words = 0,
) {
  await db.transaction("rw", db.stats, async () => {
    const s = (await db.stats.get(date)) ?? {
      date,
      seconds: 0,
      pages: 0,
      words: 0,
    };
    await db.stats.put({
      ...s,
      seconds: s.seconds + seconds,
      pages: s.pages + pages,
      words: s.words + words,
    });
  });
}
