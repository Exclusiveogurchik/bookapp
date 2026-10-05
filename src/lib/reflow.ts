export interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}
// Geometry is heuristic: complex columns and tables remain best read in Original mode.
export function extractBlocks(items: TextItem[]) {
  const lines: {
    text: string;
    y: number;
    x: number;
    size: number;
    end: number;
  }[] = [];
  for (const i of items) {
    if (!i.str.trim()) continue;
    const y = i.transform[5],
      x = i.transform[4],
      size = Math.abs(i.transform[3]) || i.height || 12;
    const last = lines.at(-1);
    if (last && Math.abs(last.y - y) < size * 0.35) {
      last.text += (x - last.end > size * 0.12 ? " " : "") + i.str;
      last.end = x + i.width;
      last.size = Math.max(last.size, size);
    } else lines.push({ text: i.str, y, x, size, end: x + i.width });
  }
  const sizes = lines.map((l) => l.size).sort((a, b) => a - b),
    body = sizes[Math.floor(sizes.length / 2)] || 12;
  const grouped: { text: string; heading: boolean }[] = [];
  lines.forEach((l, n) => {
    const prior = lines[n - 1],
      heading =
        l.size > body * 1.18 ||
        /^(глава|часть|chapter|предисловие|заключение)(?:\s|$)/iu.test(l.text);
    const last = grouped.at(-1);
    const gap = prior ? Math.abs(prior.y - l.y) : 0;
    const paragraph =
      !last ||
      heading ||
      last.heading ||
      gap > body * 1.85 ||
      l.x > (prior?.x ?? 0) + body * 1.1;
    if (paragraph) grouped.push({ text: l.text.trim(), heading });
    else if (last.text.endsWith("-") && /^[a-zа-яё]/u.test(l.text))
      last.text = last.text.slice(0, -1) + l.text.trim();
    else last.text += " " + l.text.trim();
  });
  let offset = 0;
  const blocks = grouped.map((b) => {
    const block = { ...b, start: offset };
    offset += b.text.length + 2;
    return block;
  });
  return { blocks, text: blocks.map((b) => b.text).join("\n\n") };
}
