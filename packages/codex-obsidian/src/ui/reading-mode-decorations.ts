import { MarkdownPostProcessorContext } from 'obsidian';
import type CodexPlugin from '../main';

export function createDeadLinkPostProcessor(plugin: CodexPlugin) {
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    const links = el.querySelectorAll('a.internal-link');

    for (const link of Array.from(links)) {
      const href = link.getAttribute('data-href');
      if (!href) continue;

      const nativeResolved = plugin.app.metadataCache.getFirstLinkpathDest(href, ctx.sourcePath);
      if (nativeResolved) continue;

      // Obsidian can't resolve this link — check if Codex can
      const resolver = plugin.diagnosticEngine.getResolver();
      const codexResolved = resolver.resolve(href);

      if (codexResolved.length > 0) {
        // Codex resolved it (via alias, name, or plural) — remap to the real file
        const entity = codexResolved[0];
        const realPath = entity.filePath.replace(/\.md$/, '');
        link.setAttribute('data-href', realPath);
        link.setAttribute('href', realPath);
        link.classList.remove('is-unresolved');
        link.classList.add('codex-resolved-link');
      } else {
        // Truly dead link — add warning badge
        link.classList.add('codex-reading-dead-link');
        link.setAttribute('title', `Entity "${href}" not found (Alt+click to create)`);

        link.addEventListener('click', (e) => {
          if (!(e.target as HTMLElement)?.matches?.('.codex-reading-dead-link')) return;
          if (!e.altKey) return;
          e.preventDefault();
          e.stopPropagation();
          plugin.app.commands.executeCommandById('codex-narrative-engine:create-entity-from-link');
        });
      }
    }
  };
}
