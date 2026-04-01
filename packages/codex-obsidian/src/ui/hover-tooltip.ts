import { EditorView, hoverTooltip, Tooltip } from '@codemirror/view';
import type CodexPlugin from '../main';
import type { Entity } from '@codex-ide/core';

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

/**
 * Find the [[wiki-link]] target under a given document position.
 */
function findLinkAtPos(
  view: EditorView,
  pos: number,
): { target: string; from: number; to: number } | null {
  const line = view.state.doc.lineAt(pos);
  const lineText = line.text;
  const offset = pos - line.from;

  WIKI_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKI_LINK_RE.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset >= start && offset <= end) {
      return {
        target: match[1].trim(),
        from: line.from + start,
        to: line.from + end,
      };
    }
  }

  return null;
}

export function renderEntityTooltip(entity: Entity, refCount: number): HTMLElement {
  const container = document.createElement('div');
  container.className = 'codex-hover-tooltip';

  // Type badge + name row
  const header = container.createDiv();
  const badge = header.createSpan({ cls: 'codex-entity-type-badge' });
  badge.dataset.type = entity.type;
  badge.textContent = entity.type.toUpperCase();
  const title = entity.frontmatter.title;
  if (typeof title === 'string') {
    const titleEl = header.createSpan({ cls: 'codex-entity-title' });
    titleEl.textContent = title + ' ';
  }
  const name = header.createSpan({ cls: 'codex-entity-name' });
  name.textContent = entity.name;

  if (entity.aliases.length > 0) {
    const aliasRow = container.createDiv({ cls: 'codex-entity-meta' });
    aliasRow.textContent = `aka: ${entity.aliases.join(', ')}`;
  }

  // Metadata row
  const meta = container.createDiv({ cls: 'codex-entity-meta' });
  const metaParts: string[] = [];

  const status = entity.frontmatter.status;
  if (typeof status === 'string') metaParts.push(`Status: ${status}`);

  const faction = entity.frontmatter.faction;
  if (typeof faction === 'string') metaParts.push(`Faction: ${faction.replace(/\[\[|\]\]/g, '')}`);

  const location = entity.frontmatter.location;
  if (typeof location === 'string') metaParts.push(`Location: ${location.replace(/\[\[|\]\]/g, '')}`);

  const heldBy = entity.frontmatter.held_by;
  if (typeof heldBy === 'string') metaParts.push(`Held by: ${heldBy.replace(/\[\[|\]\]/g, '')}`);

  const leader = entity.frontmatter.leader;
  if (typeof leader === 'string') metaParts.push(`Leader: ${leader.replace(/\[\[|\]\]/g, '')}`);

  const parent = entity.frontmatter.parent;
  if (typeof parent === 'string') metaParts.push(`Parent: ${parent.replace(/\[\[|\]\]/g, '')}`);

  metaParts.push(`Referenced by ${refCount} file${refCount !== 1 ? 's' : ''}`);
  meta.textContent = metaParts.join(' · ');

  // Body preview
  if (entity.bodyPreview) {
    const preview = container.createDiv({ cls: 'codex-entity-preview' });
    preview.textContent = entity.bodyPreview;
  }

  return container;
}

export function createHoverTooltip(plugin: CodexPlugin) {
  return hoverTooltip((view: EditorView, pos: number): Tooltip | null => {
    const link = findLinkAtPos(view, pos);
    if (!link) return null;

    const resolver = plugin.diagnosticEngine.getResolver();
    const resolved = resolver.resolve(link.target);
    if (resolved.length === 0) return null;

    const entity = resolved[0];
    // Only show enhanced tooltip for typed entities
    if (entity.type === 'custom' && !entity.frontmatter.type) return null;

    const refPaths = new Set(
      plugin.registry.findReferences(entity.name).map(r => r.sourcePath)
    );
    for (const alias of entity.aliases) {
      for (const ref of plugin.registry.findReferences(alias)) {
        refPaths.add(ref.sourcePath);
      }
    }
    const refCount = refPaths.size;

    return {
      pos: link.from,
      end: link.to,
      above: true,
      create(): { dom: HTMLElement } {
        return { dom: renderEntityTooltip(entity, refCount) };
      },
    };
  });
}
