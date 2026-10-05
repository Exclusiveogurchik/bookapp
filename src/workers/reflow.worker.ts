import { extractBlocks, type TextItem } from "../lib/reflow";
self.onmessage = (e: MessageEvent<{ id: number; items: TextItem[] }>) => {
  self.postMessage({ id: e.data.id, ...extractBlocks(e.data.items) });
};
