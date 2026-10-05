import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
async function fixture(pages = 3, scan = false) {
  const doc = await PDFDocument.create();
  doc.setTitle(scan ? "Scanned book" : "A quiet library");
  doc.setAuthor("Reader Test");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([600, 800]);
    if (scan)
      p.drawRectangle({
        x: 40,
        y: 40,
        width: 520,
        height: 700,
        color: rgb(0.8, 0.9, 0.8),
      });
    else {
      p.drawText(`Chapter ${i}`, { x: 50, y: 740, size: 24, font });
      for (let line = 0; line < 27; line++)
        p.drawText(
          `Reading gives us a quiet space for ideas. Page ${i}, line ${line + 1}.`,
          { x: 50, y: 700 - line * 20, size: 12, font },
        );
    }
  }
  return Buffer.from(await doc.save());
}
test("import, reflow, progress, annotation, original, backup and offline", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Моя библиотека" }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "test.pdf",
      mimeType: "application/pdf",
      buffer: await fixture(),
    });
  await expect(
    page.getByRole("heading", { name: "A quiet library" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Читать A quiet library", exact: true })
    .click();
  await expect(page.locator(".reflow-page h2")).toHaveText("Chapter 1");
  await page
    .getByRole("button", { name: "Следующая страница", exact: true })
    .click();
  await expect(page.locator(".reflow-page h2")).toHaveText("Chapter 2");
  await page.locator(".reader-scroll").evaluate((el) => (el.scrollTop = 200));
  await page.waitForTimeout(500);
  await page
    .getByRole("button", { name: "Добавить закладку", exact: true })
    .click();
  await page
    .locator(".reflow-page p")
    .first()
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  await expect(page.locator(".selection-toolbar")).toBeVisible();
  await page.getByLabel("Заметка к выделению").fill("My important thought");
  await page.getByRole("button", { name: "Выделить", exact: true }).click();
  await expect(page.locator(".reflow-page mark").first()).toBeVisible();
  await page.getByRole("button", { name: "Вернуться в библиотеку" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Читать A quiet library", exact: true })
    .click();
  await expect(page.locator(".reflow-page h2")).toHaveText("Chapter 2");
  await expect(page.locator(".reflow-page mark").first()).toBeVisible();
  await page.getByRole("button", { name: "Оригинал", exact: true }).click();
  await expect(page.locator(".pdf-paper canvas")).toBeVisible();
  await expect(
    page.locator(".pdf-paper .textLayer span").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Вернуться в библиотеку" }).click();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/list-backup/);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Моя библиотека" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Читать A quiet library", exact: true })
    .click();
  await expect(page.locator(".pdf-paper canvas")).toBeVisible();
  expect(errors).toEqual([]);
  await context.setOffline(false);
});
test("scan fallback, corrupt PDF, mobile layout and focus keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      {
        name: "scan.pdf",
        mimeType: "application/pdf",
        buffer: await fixture(1, true),
      },
      {
        name: "broken.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("broken pdf"),
      },
    ]);
  await expect(
    page.getByRole("heading", { name: "Scanned book" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "повреждён" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Читать Scanned book", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "На этой странице нет текста" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Открыть оригинал", exact: true })
    .click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.keyboard.press("f");
  await expect(page.locator(".reader")).toHaveClass(/focus/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".reader-header")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("500 page book is usable before full indexing and scroll is lazy", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "large.pdf",
      mimeType: "application/pdf",
      buffer: await fixture(501),
    });
  await expect(
    page.getByRole("heading", { name: "A quiet library" }),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Читать A quiet library", exact: true })
    .click();
  await expect(page.locator(".reflow-page h2")).toHaveText("Chapter 1");
  await page.getByRole("button", { name: "Настройки чтения" }).click();
  await page.getByLabel("Перелистывание").selectOption("scroll");
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.locator(".reflow-page")).toHaveCount(2);
  await page
    .locator(".reader-scroll")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(page.locator(".reflow-page")).toHaveCount(3);
  expect(await page.locator(".reflow-page").count()).toBeLessThanOrEqual(5);
});
