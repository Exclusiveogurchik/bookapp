import { describe, it, expect } from "vitest";
import { extractBlocks, type TextItem } from "../src/lib/reflow";
const item = (str: string, x: number, y: number, size = 12): TextItem => ({
  str,
  transform: [size, 0, 0, size, x, y],
  width: str.length * 6,
  height: size,
});
describe("PDF text layout", () => {
  it("joins fragments and removes broken word hyphenation", () => {
    const p = extractBlocks([
      item("Reading is a jour-", 50, 700),
      item("ney through ideas.", 50, 685),
    ]);
    expect(p.text).toBe("Reading is a journey through ideas.");
  });
  it("preserves headings, paragraphs and stable offsets", () => {
    const p = extractBlocks([
      item("Chapter 1", 50, 740, 20),
      item("One paragraph.", 50, 700),
      item("Another paragraph.", 50, 660),
    ]);
    expect(p.blocks).toHaveLength(3);
    expect(p.blocks[0].heading).toBe(true);
    for (const b of p.blocks)
      expect(p.text.slice(b.start, b.start + b.text.length)).toBe(b.text);
  });
  it("does not manufacture text for scanned pages", () =>
    expect(extractBlocks([])).toEqual({ text: "", blocks: [] }));
});
