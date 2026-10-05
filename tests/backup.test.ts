import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { importBackup } from "../src/lib/backup";
const book = {
  id: "b",
  title: "Test",
  author: "",
  cover: "",
  pageCount: 2,
  size: 10,
  addedAt: 1,
  openedAt: 1,
  status: "reading",
  tags: [],
  shelf: "",
  position: { page: 2, fraction: 0.3 },
  indexed: 0,
  outline: [],
};
const valid = () => ({
  format: "list-backup",
  version: 1,
  books: [book],
  files: [{ id: "b", data: btoa("%PDF-1.7\n") }],
  pages: [],
  annotations: [],
  vocabulary: [],
  stats: [],
});
const file = (data: unknown) =>
  new File([JSON.stringify(data)], "backup.json", { type: "application/json" });
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});
describe("backup restores atomically", () => {
  it("restores PDF bytes and exact position without deleting other books", async () => {
    await db.books.put({ ...book, id: "other", status: "want" } as never);
    await importBackup(file(valid()));
    expect((await db.books.get("b"))?.position).toEqual({
      page: 2,
      fraction: 0.3,
    });
    expect(await db.books.count()).toBe(2);
    expect(await (await db.files.get("b"))?.blob.text()).toBe("%PDF-1.7\n");
  });
  it("rejects malformed data before changing storage", async () => {
    const data = valid();
    data.books[0] = { ...book, position: { page: 9, fraction: 0 } };
    await expect(importBackup(file(data))).rejects.toThrow();
    expect(await db.books.count()).toBe(0);
  });
  it("rejects missing PDF and orphan pages", async () => {
    await expect(
      importBackup(file({ ...valid(), files: [] })),
    ).rejects.toThrow();
    await expect(
      importBackup(
        file({
          ...valid(),
          pages: [
            { bookId: "missing", page: 1, text: "hello", words: 1, blocks: [] },
          ],
        }),
      ),
    ).rejects.toThrow();
    expect(await db.books.count()).toBe(0);
  });
});
