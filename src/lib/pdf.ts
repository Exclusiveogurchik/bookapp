import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { db } from "./db";
import type { Book, Page } from "./types";
import type { TextItem } from "./reflow";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
let seq = 0;
const pending = new Map<
  number,
  {
    resolve: (value: Pick<Page, "text" | "blocks">) => void;
    reject: (e: Error) => void;
  }
>();
const worker = new Worker(
  new URL("../workers/reflow.worker.ts", import.meta.url),
  { type: "module" },
);
worker.onmessage = (e) => {
  pending.get(e.data.id)?.resolve(e.data);
  pending.delete(e.data.id);
};
worker.onerror = () => {
  for (const task of pending.values())
    task.reject(new Error("Не удалось обработать текст"));
  pending.clear();
};
function layout(items: TextItem[]) {
  return new Promise<Pick<Page, "text" | "blocks">>((resolve, reject) => {
    const id = seq++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, items });
  });
}
export function openPDF(blob: Blob) {
  return blob.arrayBuffer().then(
    (data) =>
      pdfjs.getDocument({
        data,
        cMapUrl: import.meta.env.BASE_URL + "pdf-assets/cmaps/",
        cMapPacked: true,
        standardFontDataUrl:
          import.meta.env.BASE_URL + "pdf-assets/standard_fonts/",
        wasmUrl: import.meta.env.BASE_URL + "pdf-assets/wasm/",
      }).promise,
  );
}
export async function getPageText(
  doc: pdfjs.PDFDocumentProxy,
  bookId: string,
  page: number,
): Promise<Page> {
  const cached = await db.pages.get([bookId, page]);
  if (cached) return cached;
  const p = await doc.getPage(page);
  const content = await p.getTextContent();
  const result = await layout(
    content.items.filter((i) => "str" in i) as TextItem[],
  );
  const value = {
    bookId,
    page,
    ...result,
    words: result.text.trim() ? result.text.trim().split(/\s+/u).length : 0,
  };
  await db.transaction("rw", [db.books, db.pages], async () => {
    if (await db.books.get(bookId)) await db.pages.put(value);
  });
  p.cleanup();
  return value;
}
const indexing = new Set<string>();
let indexQueue: Promise<void> = Promise.resolve();
export function indexBook(bookId: string): Promise<void> {
  const run = indexQueue.then(() => runIndex(bookId));
  indexQueue = run.catch(() => {});
  return run;
}
async function runIndex(bookId: string) {
  if (indexing.has(bookId)) return;
  indexing.add(bookId);
  let doc: pdfjs.PDFDocumentProxy | undefined;
  try {
    const file = await db.files.get(bookId);
    const book = await db.books.get(bookId);
    if (!file || !book) return;
    doc = await openPDF(file.blob);
    for (let page = book.indexed + 1; page <= doc.numPages; page++) {
      if (!(await db.books.get(bookId))) break;
      const text = await getPageText(doc, bookId, page);
      const headings = text.blocks
        .filter((b) => b.heading)
        .map((b) => ({ title: b.text.slice(0, 120), page }));
      await db.books.update(bookId, {
        indexed: page,
        indexError: undefined,
        ...(!book.outline.length && headings.length
          ? { outline: [...(await db.books.get(bookId))!.outline, ...headings] }
          : {}),
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  } catch (e) {
    await db.books.update(bookId, { indexError: errorMessage(e) });
  } finally {
    await doc?.loadingTask.destroy();
    indexing.delete(bookId);
  }
}
export async function importPDF(
  file: File,
  onProgress: (value: number) => void,
) {
  if (!file.name.toLowerCase().endsWith(".pdf"))
    throw new Error("Выберите файл PDF");
  const estimate = await navigator.storage?.estimate();
  if (
    estimate?.quota &&
    estimate.usage &&
    estimate.quota - estimate.usage < file.size * 1.5
  )
    throw new Error(
      "Недостаточно места. Удалите ненужные книги или освободите хранилище браузера.",
    );
  onProgress(10);
  const doc = await openPDF(file);
  try {
    onProgress(40);
    const metadata = await doc.getMetadata().catch(() => null);
    const info = metadata?.info as
      { Title?: string; Author?: string } | undefined;
    const p = await doc.getPage(1);
    const vp = p.getViewport({ scale: 0.45 });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    await p.render({ canvas, viewport: vp }).promise;
    const cover = canvas.toDataURL("image/webp", 0.75);
    p.cleanup();
    onProgress(70);
    const outline: { title: string; page: number }[] = [];
    const visit = async (items: Awaited<ReturnType<typeof doc.getOutline>>) => {
      for (const item of items ?? []) {
        try {
          const dest =
            typeof item.dest === "string"
              ? await doc.getDestination(item.dest)
              : item.dest;
          if (dest) {
            const page =
              typeof dest[0] === "number"
                ? dest[0] + 1
                : (await doc.getPageIndex(dest[0])) + 1;
            outline.push({ title: item.title, page });
          }
        } catch {
          /* Broken outline entries should not block importing a book. */
        }
        await visit(item.items);
      }
    };
    await visit(await doc.getOutline());
    const id = crypto.randomUUID();
    const book: Book = {
      id,
      title: info?.Title?.trim() || file.name.replace(/\.pdf$/i, ""),
      author: info?.Author?.trim() || "",
      cover,
      pageCount: doc.numPages,
      size: file.size,
      addedAt: Date.now(),
      openedAt: 0,
      status: "want",
      shelf: "",
      tags: [],
      position: { page: 1, fraction: 0 },
      indexed: 0,
      outline,
    };
    await db.transaction("rw", [db.books, db.files], async () => {
      await db.files.add({ id, blob: file });
      await db.books.add(book);
    });
    onProgress(100);
    void indexBook(id);
    return book;
  } finally {
    await doc.loadingTask.destroy();
  }
}
export function errorMessage(error: unknown) {
  const e = error as { name?: string; message?: string };
  if (e.name === "QuotaExceededError")
    return "Хранилище заполнено. Сделайте резервную копию и удалите ненужные книги.";
  if (e.name === "PasswordException")
    return "PDF защищён паролем. Сначала сохраните копию без пароля.";
  if (e.name === "InvalidPDFException")
    return "PDF повреждён или имеет неподдерживаемый формат.";
  return e.message || "Не удалось открыть PDF. Попробуйте другой файл.";
}
