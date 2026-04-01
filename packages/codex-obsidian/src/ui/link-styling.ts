import { ViewPlugin, ViewUpdate, EditorView } from '@codemirror/view';
import type CodexPlugin from '../main';

/**
 * CM6 ViewPlugin that overrides dimmed styling on Obsidian's .is-unresolved
 * link elements when Codex can resolve them (alias, plural, etc.).
 */
export function createLinkStylingPlugin(plugin: CodexPlugin) {
  return ViewPlugin.fromClass(
    class {
      private pending = false;

      constructor(private view: EditorView) {
        this.scheduleFixup();
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) {
          this.scheduleFixup();
        }
      }

      destroy(): void {
        this.pending = false;
      }

      private scheduleFixup(): void {
        if (this.pending) return;
        this.pending = true;
        requestAnimationFrame(() => {
          this.pending = false;
          this.fixUnresolvedLinks();
        });
      }

      private fixUnresolvedLinks(): void {
        const file = plugin.app.workspace.getActiveFile();
        if (!file) return;

        const resolver = plugin.diagnosticEngine.getResolver();
        const els = this.view.dom.querySelectorAll('.is-unresolved:not(.codex-editor-resolved)');

        for (const el of Array.from(els)) {
          const text = el.textContent?.trim();
          if (!text) continue;

          const resolved = resolver.resolve(text);
          if (resolved.length > 0) {
            el.classList.add('codex-editor-resolved');
          }
        }
      }
    },
  );
}
