import { computeLineDiff } from '@codex-ide/core';
import type { DiffLine } from '@codex-ide/core';

export type CollapsedDiffEntry = DiffLine | { type: 'collapsed'; lines: DiffLine[] };

/**
 * Collapse long unchanged regions, keeping `margin` context lines around changes.
 * Hidden lines stay on the collapsed entry so the UI can expand them.
 */
export function collapseContext(lines: DiffLine[], margin = 3): CollapsedDiffEntry[] {
  const isChange = (l: DiffLine) => l.type !== 'context';
  const changeIndices = lines.map((l, i) => isChange(l) ? i : -1).filter(i => i >= 0);

  if (changeIndices.length === 0) {
    if (lines.length <= margin * 2 + 1) return lines;
    return [
      ...lines.slice(0, margin),
      { type: 'collapsed' as const, lines: lines.slice(margin, lines.length - margin) },
      ...lines.slice(lines.length - margin),
    ];
  }

  const visible = new Set<number>();
  for (const ci of changeIndices) {
    for (let k = Math.max(0, ci - margin); k <= Math.min(lines.length - 1, ci + margin); k++) {
      visible.add(k);
    }
  }

  const output: CollapsedDiffEntry[] = [];
  let hidden: DiffLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (visible.has(i)) {
      if (hidden.length > 0) {
        output.push({ type: 'collapsed', lines: hidden });
        hidden = [];
      }
      output.push(lines[i]);
    } else {
      hidden.push(lines[i]);
    }
  }
  if (hidden.length > 0) {
    output.push({ type: 'collapsed', lines: hidden });
  }

  return output;
}

export function diffCounts(oldContent: string, newContent: string): { additions: number; removals: number } {
  const raw = computeLineDiff(oldContent, newContent);
  return {
    additions: raw.filter(l => l.type === 'add').length,
    removals: raw.filter(l => l.type === 'remove').length,
  };
}

function renderLine(parent: HTMLElement, entry: DiffLine): void {
  const row = parent.createDiv({ cls: `codex-diff-line codex-diff-line-${entry.type}` });
  const marker = entry.type === 'add' ? '+' : entry.type === 'remove' ? '−' : ' ';
  row.createSpan({ cls: 'codex-diff-gutter', text: marker });
  row.createSpan({ cls: 'codex-diff-text', text: entry.text });
}

function mountCollapsedRegion(parent: HTMLElement, lines: DiffLine[]): { expand: () => void; collapse: () => void } {
  const region = parent.createDiv({ cls: 'codex-diff-hunk-gap' });
  const toggle = region.createEl('button', {
    cls: 'codex-diff-collapsed',
    attr: { type: 'button' },
  });
  const linesEl = region.createDiv({ cls: 'codex-diff-expanded-lines' });
  for (const line of lines) renderLine(linesEl, line);

  let expanded = false;
  const sync = () => {
    toggle.setText(
      expanded
        ? `▲ collapse ${lines.length} unchanged lines`
        : `··· ${lines.length} unchanged lines ···`,
    );
    toggle.setAttr('title', expanded ? 'Hide unchanged lines' : 'Show unchanged lines');
    linesEl.toggleClass('is-hidden', !expanded);
  };
  const expand = () => { expanded = true; sync(); };
  const collapse = () => { expanded = false; sync(); };
  toggle.addEventListener('click', () => {
    expanded = !expanded;
    sync();
  });
  sync();
  return { expand, collapse };
}

export function renderDiffBody(body: HTMLElement, oldContent: string, newContent: string): void {
  body.empty();
  const collapsed = collapseContext(computeLineDiff(oldContent, newContent));
  const gaps: { expand: () => void; collapse: () => void }[] = [];

  if (collapsed.some(e => e.type === 'collapsed')) {
    const bar = body.createDiv({ cls: 'codex-diff-expand-bar' });
    const allBtn = bar.createEl('button', {
      cls: 'codex-diff-expand-all',
      attr: { type: 'button' },
      text: 'Expand unchanged lines',
    });
    allBtn.addEventListener('click', () => {
      const anyCollapsed = gaps.length > 0 && allBtn.getText() === 'Expand unchanged lines';
      if (anyCollapsed) {
        for (const g of gaps) g.expand();
        allBtn.setText('Collapse unchanged lines');
      } else {
        for (const g of gaps) g.collapse();
        allBtn.setText('Expand unchanged lines');
      }
    });
  }

  for (const entry of collapsed) {
    if (entry.type === 'collapsed') {
      gaps.push(mountCollapsedRegion(body, entry.lines));
      continue;
    }
    renderLine(body, entry);
  }
}
