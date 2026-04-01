import type { LinkReference } from '../types';

/**
 * Regex to match [[wiki-links]], including [[target|alias]] syntax.
 * Captures the target (before the pipe) in group 1.
 */
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

/**
 * Extract all [[wiki-link]] references from raw file content.
 * Returns link targets with line/column positions and context (frontmatter vs body).
 */
export function extractLinks(
  content: string,
  sourcePath: string,
  bodyStartLine: number,
): LinkReference[] {
  const links: LinkReference[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;

    WIKI_LINK_RE.lastIndex = 0;
    while ((match = WIKI_LINK_RE.exec(line)) !== null) {
      const target = match[1].trim();
      if (target.length === 0) continue;

      links.push({
        target,
        line: i + 1, // 1-indexed
        column: match.index,
        context: (i + 1) < bodyStartLine ? 'frontmatter' : 'body',
        sourcePath,
      });
    }
  }

  return links;
}

/**
 * Extract link targets from a single frontmatter value.
 * Handles strings like "[[Lord Varos]]" and arrays of such strings.
 */
export function extractLinksFromValue(value: unknown): string[] {
  const targets: string[] = [];

  if (typeof value === 'string') {
    let match: RegExpExecArray | null;
    WIKI_LINK_RE.lastIndex = 0;
    while ((match = WIKI_LINK_RE.exec(value)) !== null) {
      targets.push(match[1].trim());
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      targets.push(...extractLinksFromValue(item));
    }
  }

  return targets;
}
