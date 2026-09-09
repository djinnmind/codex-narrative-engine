import { activeDocument as obsidianActiveDocument, activeWindow as obsidianActiveWindow } from 'obsidian';

/**
 * Obsidian's activeDocument/activeWindow are preferred for pop-out windows,
 * but some desktop builds expose them as undefined — fall back to globals.
 */
export function getActiveDocument(): Document {
  return obsidianActiveDocument ?? document;
}

export function getActiveWindow(): Window {
  return obsidianActiveWindow ?? window;
}
