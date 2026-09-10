import { getActiveWindow } from '../util/dom';

const MIN_W = 480;
const MIN_H = 300;

export interface ResizableModalOptions {
  storageKey: string;
  defaultMaxWidth?: number;
  defaultMaxHeight?: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function readSaved(key: string): { w: number; h: number } | null {
  try {
    const raw = getActiveWindow().localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { w?: unknown; h?: unknown };
    if (typeof parsed.w !== 'number' || typeof parsed.h !== 'number') return null;
    if (!Number.isFinite(parsed.w) || !Number.isFinite(parsed.h)) return null;
    return { w: parsed.w, h: parsed.h };
  } catch {
    return null;
  }
}

function writeSaved(key: string, w: number, h: number): void {
  try {
    getActiveWindow().localStorage.setItem(key, JSON.stringify({ w, h }));
  } catch {
    /* private mode */
  }
}

/**
 * Make an Obsidian modal window user-resizable. Size is remembered so a
 * sequence of recipe diffs opens at the last size.
 */
export function installResizableModal(
  modalEl: HTMLElement,
  opts: ResizableModalOptions,
): () => void {
  modalEl.addClass('codex-resizable-modal');

  const win = modalEl.ownerDocument.defaultView ?? getActiveWindow();
  const maxW = win.innerWidth - 24;
  const maxH = win.innerHeight - 24;
  const saved = readSaved(opts.storageKey);
  const w = clamp(
    saved?.w ?? Math.min(opts.defaultMaxWidth ?? 960, Math.round(win.innerWidth * 0.92)),
    MIN_W,
    maxW,
  );
  const h = clamp(
    saved?.h ?? Math.min(opts.defaultMaxHeight ?? 720, Math.round(win.innerHeight * 0.85)),
    MIN_H,
    maxH,
  );
  modalEl.style.width = `${w}px`;
  modalEl.style.height = `${h}px`;

  const handle = modalEl.createDiv({ cls: 'codex-modal-resize-handle' });
  handle.setAttr('aria-label', 'Drag to resize');
  handle.setAttr('title', 'Drag to resize');

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startW = 0;
  let startH = 0;

  const onMove = (ev: MouseEvent) => {
    if (!dragging) return;
    const nextW = clamp(startW + ev.clientX - startX, MIN_W, win.innerWidth - 24);
    const nextH = clamp(startH + ev.clientY - startY, MIN_H, win.innerHeight - 24);
    modalEl.style.width = `${nextW}px`;
    modalEl.style.height = `${nextH}px`;
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    modalEl.removeClass('is-resizing');
    win.removeEventListener('mousemove', onMove);
    win.removeEventListener('mouseup', onUp);
    writeSaved(opts.storageKey, modalEl.offsetWidth, modalEl.offsetHeight);
  };

  const onDown = (ev: MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    dragging = true;
    startX = ev.clientX;
    startY = ev.clientY;
    startW = modalEl.offsetWidth;
    startH = modalEl.offsetHeight;
    modalEl.addClass('is-resizing');
    win.addEventListener('mousemove', onMove);
    win.addEventListener('mouseup', onUp);
  };

  handle.addEventListener('mousedown', onDown);

  return () => {
    onUp();
    handle.removeEventListener('mousedown', onDown);
    handle.remove();
    modalEl.removeClass('codex-resizable-modal');
    modalEl.removeClass('is-resizing');
  };
}
