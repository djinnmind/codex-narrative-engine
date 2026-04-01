import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder, StateEffect } from '@codemirror/state';
import type CodexPlugin from '../main';
import type { Diagnostic } from '@codex-ide/core';

class GutterIconWidget extends WidgetType {
  constructor(
    private severity: 'error' | 'warning' | 'hint',
    private message: string,
    private rule: string,
    private target: string | undefined,
    private plugin: CodexPlugin,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const icon = document.createElement('span');
    icon.className = `codex-gutter-${this.severity}`;
    icon.textContent = this.severity === 'hint' ? 'ℹ' : '⚠';
    icon.title = this.rule === 'dead-link' && this.target
      ? `${this.message} (click to create)`
      : this.message;

    if (this.rule === 'dead-link' && this.target) {
      icon.classList.add('codex-gutter-clickable');
      icon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.plugin.app.commands.executeCommandById('codex-narrative-engine:create-entity-from-link');
      });
    }

    return icon;
  }
}

const deadLinkMark = Decoration.mark({ class: 'codex-dead-link' });
const stateConflictMark = Decoration.mark({ class: 'codex-state-conflict' });
const hintMark = Decoration.mark({ class: 'codex-hint' });

export const refreshDiagnostics = StateEffect.define<null>();

function markForSeverity(severity: string): Decoration {
  switch (severity) {
    case 'error': return stateConflictMark;
    case 'warning': return stateConflictMark;
    case 'hint': return hintMark;
    default: return deadLinkMark;
  }
}

function markForRule(rule: string, severity: string): Decoration {
  if (rule === 'dead-link') return deadLinkMark;
  return markForSeverity(severity);
}

function filterVaultResolved(diagnostics: Diagnostic[], plugin: CodexPlugin, filePath: string): Diagnostic[] {
  return diagnostics.filter(d => {
    if (d.rule !== 'dead-link' || !d.relatedEntities?.[0]) return true;
    return !plugin.app.metadataCache.getFirstLinkpathDest(d.relatedEntities[0], filePath);
  });
}

/**
 * Find the 1-indexed line number where the body starts (after closing `---`).
 * Returns 1 if no frontmatter is detected.
 */
function findBodyStartLine(doc: import('@codemirror/state').Text): number {
  let delimCount = 0;
  for (let i = 1; i <= doc.lines; i++) {
    if (doc.line(i).text.trim() === '---') {
      delimCount++;
      if (delimCount === 2) return i + 1;
    }
  }
  return 1;
}

export function createDiagnosticViewPlugin(plugin: CodexPlugin) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate): void {
        const hasRefresh = update.transactions.some(t => t.effects.some(e => e.is(refreshDiagnostics)));
        if (update.docChanged || update.viewportChanged || hasRefresh) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const file = plugin.app.workspace.getActiveFile();
        if (!file) return builder.finish();

        const diagnostics = filterVaultResolved(
          plugin.diagnosticEngine.diagnoseFile(file.path), plugin, file.path,
        );
        if (diagnostics.length === 0) return builder.finish();

        const doc = view.state.doc;
        const bodyStart = findBodyStartLine(doc);

        // Skip inline marks for diagnostics relocated from frontmatter —
        // underlining an entire unrelated paragraph looks wrong. The gutter
        // plugin still shows the icon with a tooltip for these.
        const visible = diagnostics.filter(d =>
          d.rule === 'dead-link' || d.line >= bodyStart,
        );

        // Sort diagnostics by position for RangeSetBuilder (requires sorted ranges)
        const sorted = [...visible].sort((a, b) => {
          if (a.line !== b.line) return a.line - b.line;
          return a.column - b.column;
        });

        for (const diag of sorted) {
          if (diag.line < 1 || diag.line > doc.lines) continue;

          const line = doc.line(diag.line);
          const from = line.from + diag.column;
          const to = diag.endColumn
            ? Math.min(line.from + diag.endColumn, line.to)
            : line.to;

          if (from >= to || from < line.from || to > line.to) continue;

          builder.add(from, to, markForRule(diag.rule, diag.severity));
        }

        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations },
  );
}

export function createGutterViewPlugin(plugin: CodexPlugin) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate): void {
        const hasRefresh = update.transactions.some(t => t.effects.some(e => e.is(refreshDiagnostics)));
        if (update.docChanged || update.viewportChanged || hasRefresh) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const file = plugin.app.workspace.getActiveFile();
        if (!file) return builder.finish();

        const diagnostics = filterVaultResolved(
          plugin.diagnosticEngine.diagnoseFile(file.path), plugin, file.path,
        );
        if (diagnostics.length === 0) return builder.finish();

        const doc = view.state.doc;
        const bodyStart = findBodyStartLine(doc);

        // One gutter icon per line — use the highest severity
        const lineMap = new Map<number, Diagnostic>();
        for (const diag of diagnostics) {
          // Relocate frontmatter diagnostics to first body line
          const effectiveLine = (diag.rule !== 'dead-link' && diag.line < bodyStart && bodyStart <= doc.lines)
            ? bodyStart : diag.line;
          if (effectiveLine < 1 || effectiveLine > doc.lines) continue;
          const existing = lineMap.get(effectiveLine);
          if (!existing || severityRank(diag.severity) > severityRank(existing.severity)) {
            lineMap.set(effectiveLine, diag);
          }
        }

        const sortedLines = [...lineMap.entries()].sort((a, b) => a[0] - b[0]);
        for (const [lineNum, diag] of sortedLines) {
          const line = doc.line(lineNum);
          builder.add(
            line.from,
            line.from,
            Decoration.widget({
              widget: new GutterIconWidget(
                diag.severity,
                diag.message,
                diag.rule,
                diag.relatedEntities[0],
                plugin,
              ),
              side: -1,
            }),
          );
        }

        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations },
  );
}

function severityRank(severity: string): number {
  switch (severity) {
    case 'error': return 3;
    case 'warning': return 2;
    case 'hint': return 1;
    default: return 0;
  }
}
