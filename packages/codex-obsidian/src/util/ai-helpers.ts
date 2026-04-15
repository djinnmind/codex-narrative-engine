/**
 * Shared helpers for AI response processing — used by both ai-commands and chat-view.
 */

export const ENTITY_FOLDER_MAP: Record<string, string> = {
  npc: 'npcs',
  creature: 'creatures',
  location: 'locations',
  faction: 'factions',
  item: 'items',
  quest: 'quests',
  adventure: 'adventures',
  arc: 'arcs',
  session: 'sessions',
  event: 'events',
  world: 'world',
};

/**
 * Strip outer markdown code fences from an AI response and sanitize
 * Fantasy Statblocks YAML blocks.
 *
 * Only strips the wrapper if the response both starts AND ends with a code
 * fence — this avoids accidentally truncating content when inner fences
 * (e.g. ```yaml blocks) appear mid-response.
 */
export function extractMarkdown(response: string): string {
  const trimmed = response.trim();

  let content: string;
  const outerFenceStart = trimmed.match(/^```\w*\s*\n/);
  const endsWithFence = /\n```\s*$/.test(trimmed);

  if (outerFenceStart && endsWithFence) {
    const closingIdx = trimmed.lastIndexOf('\n```');
    if (closingIdx > outerFenceStart[0].length) {
      content = trimmed.slice(outerFenceStart[0].length, closingIdx).trim() + '\n';
    } else {
      content = trimmed + '\n';
    }
  } else {
    content = trimmed + '\n';
  }

  return sanitizeStatblocks(content);
}

function sanitizeStatblocks(content: string): string {
  return content.replace(
    /^```statblock\s*\n([\s\S]*?)^```/gm,
    (_match, yaml: string) => {
      let cleaned = yaml;
      cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
      cleaned = cleaned.replace(
        /^(\s*desc:\s+)(?!")(.+)$/gm,
        (_m, prefix: string, value: string) => {
          if (value.includes(':')) {
            const escaped = value.replace(/"/g, '\\"');
            return `${prefix}"${escaped}"`;
          }
          return `${prefix}${value}`;
        },
      );
      return '```statblock\n' + cleaned + '```';
    },
  );
}

/**
 * Extract the entity name from markdown content by checking frontmatter `name:`
 * or the first `# Heading`.
 */
export function extractNameFromContent(content: string): string | null {
  const nameMatch = content.match(/^name:\s*"?([^"\n]+)"?\s*$/m);
  if (nameMatch) return nameMatch[1].trim();

  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();

  return null;
}

/**
 * Extract the `type` field from YAML frontmatter in a markdown string.
 */
export function extractTypeFromContent(content: string): string | null {
  const typeMatch = content.match(/^type:\s*"?([^"\n]+)"?\s*$/m);
  if (typeMatch) return typeMatch[1].trim().toLowerCase();
  return null;
}

/**
 * Returns true if the content starts with YAML frontmatter delimiters.
 */
export function hasFrontmatter(content: string): boolean {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) return false;
  const endIdx = trimmed.indexOf('---', 3);
  return endIdx > 3;
}
