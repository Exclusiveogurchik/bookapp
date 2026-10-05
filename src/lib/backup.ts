import { z } from "zod";
import { db } from "./db";
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
const fileToData = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
export async function exportBackup() {
  const [books, files, pages, annotations, vocabulary, stats] =
    await db.transaction(
      "r",
      [db.books, db.files, db.pages, db.annotations, db.vocabulary, db.stats],
      () =>
        Promise.all([
          db.books.toArray(),
          db.files.toArray(),
          db.pages.toArray(),
          db.annotations.toArray(),
          db.vocabulary.toArray(),
          db.stats.toArray(),
        ]),
    );
  const encoded = [];
  for (const file of files)
    encoded.push({ id: file.id, data: await fileToData(file.blob) });
  download(
    new Blob(
      [
        JSON.stringify({
          format: "list-backup",
          version: 1,
          books,
          files: encoded,
          pages,
          annotations,
          vocabulary,
          stats,
        }),
      ],
      { type: "application/json" },
    ),
    `list-backup-${new Date().toISOString().slice(0, 10)}.json`,
  );
}
const n = z.number().finite().nonnegative(),
  str = z.string(),
  id = str.min(1);
const schema = z.object({
  format: z.literal("list-backup"),
  version: z.literal(1),
  books: z.array(
    z.object({
      id,
      title: str,
      author: str,
      cover: str,
      pageCount: n.min(1).int(),
      size: n,
      addedAt: n,
      openedAt: n,
      status: z.enum(["want", "reading", "done"]),
      tags: z.array(str),
      shelf: str,
      position: z.object({ page: n.min(1).int(), fraction: n.max(1) }),
      indexed: n.int(),
      indexError: str.optional(),
      outline: z.array(z.object({ title: str, page: n.min(1).int() })),
    }),
  ),
  files: z.array(z.object({ id, data: str.regex(/^[A-Za-z0-9+/]*={0,2}$/) })),
  pages: z.array(
    z.object({
      bookId: id,
      page: n.min(1).int(),
      text: str,
      words: n,
      blocks: z.array(z.object({ text: str, heading: z.boolean(), start: n })),
    }),
  ),
  annotations: z.array(
    z.object({
      id,
      bookId: id,
      page: n.min(1).int(),
      start: n,
      end: n,
      text: str,
      note: str,
      color: z.enum(["yellow", "green", "pink", "blue"]),
      createdAt: n,
      kind: z.enum(["highlight", "bookmark"]),
    }),
  ),
  vocabulary: z.array(
    z.object({
      id,
      word: str,
      definition: str,
      translation: str,
      bookId: str,
      createdAt: n,
      reviews: n,
      due: n,
    }),
  ),
  stats: z.array(
    z.object({
      date: str.regex(/^\d{4}-\d{2}-\d{2}$/),
      seconds: n,
      pages: n,
      words: n,
    }),
  ),
});
export async function importBackup(file: File) {
  const data = schema.parse(JSON.parse(await file.text()));
  const ids = new Set(data.books.map((b) => b.id));
  if (
    ids.size !== data.books.length ||
    data.files.length !== ids.size ||
    new Set(data.files.map((f) => f.id)).size !== ids.size ||
    data.files.some((f) => !ids.has(f.id)) ||
    data.pages.some((p) => !ids.has(p.bookId)) ||
    data.annotations.some((a) => !ids.has(a.bookId))
  )
    throw new Error(
      "В резервной копии нарушены связи между книгами и файлами.",
    );
  for (const b of data.books)
    if (b.position.page > b.pageCount || b.indexed > b.pageCount)
      throw new Error("Некорректная позиция книги");
  const files = data.files.map((f) => {
    const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
      throw new Error("В копии найден файл, который не является PDF");
    return { id: f.id, blob: new Blob([bytes], { type: "application/pdf" }) };
  });
  // Validation completes before a single atomic transaction. Existing unrelated books survive.
  await db.transaction(
    "rw",
    [db.books, db.files, db.pages, db.annotations, db.vocabulary, db.stats],
    async () => {
      for (const b of data.books) {
        await db.pages.where("bookId").equals(b.id).delete();
        await db.annotations.where("bookId").equals(b.id).delete();
      }
      await db.books.bulkPut(data.books);
      await db.files.bulkPut(files);
      await db.pages.bulkPut(data.pages);
      await db.annotations.bulkPut(data.annotations);
      await db.vocabulary.bulkPut(data.vocabulary);
      await db.stats.bulkPut(data.stats);
    },
  );
}
