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
  arc: 'arcs',
  adventure: 'adventures',
  session: 'sessions',
  event: 'events',
  world: 'world',
  rules: 'rules',
  handout: 'handouts',
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

  return sanitizeStatblocks(stripToFrontmatter(content));
}

/**
 * Drop LLM chatter / a leading ```yaml fence so the note still starts with
 * `---` and can be indexed.
 */
export function stripToFrontmatter(content: string): string {
  let t = content.trimStart();
  const openFence = t.match(/^```(?:ya?ml|markdown|md)?\s*\n/i);
  if (openFence) {
    const after = t.slice(openFence[0].length).trimStart();
    if (after.startsWith('---')) {
      t = after.replace(/\n```\s*$/, '').trimEnd() + '\n';
    }
  }
  if (t.startsWith('---')) return t.endsWith('\n') ? t : `${t}\n`;
  const idx = t.search(/^---\s*$/m);
  if (idx < 0) return content;
  const rest = t.slice(idx);
  if (!hasFrontmatter(rest)) return content;
  return rest.endsWith('\n') ? rest : `${rest}\n`;
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

export interface ParsedEntity {
  name: string;
  type: string;
  content: string;
}

/**
 * Splits a multi-entity AI response into individual notes with proper
 * frontmatter.  Handles headings like `## Name (type)`, `**Name (type)**`,
 * or `### Name (type)` followed by key-value metadata lines.
 */
export function parseEntitySections(response: string): ParsedEntity[] {
  const headingRe =
    /(?:^|\n)(?:#{1,4}\s+|\*\*)([\w][\w\s''',.:&-]+?)\s*\((\w+)\)\s*\*{0,2}\s*(?:\n|$)/g;

  const hits: { index: number; fullLen: number; name: string; type: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(response)) !== null) {
    const typeLower = m[2].trim().toLowerCase();
    if (ENTITY_FOLDER_MAP[typeLower]) {
      hits.push({ index: m.index, fullLen: m[0].length, name: m[1].trim(), type: typeLower });
    }
  }
  if (hits.length === 0) return [];

  const entities: ParsedEntity[] = [];
  const metaKeys = new Set([
    'type', 'status', 'tags', 'session', 'summary', 'description',
    'location', 'alignment', 'level', 'race', 'class', 'hp', 'ac',
  ]);

  for (let i = 0; i < hits.length; i++) {
    const bodyStart = hits[i].index + hits[i].fullLen;
    const bodyEnd = i + 1 < hits.length ? hits[i + 1].index : response.length;
    const sectionBody = response.slice(bodyStart, bodyEnd).trim();

    const fields: Record<string, string> = {};
    const bodyLines: string[] = [];

    for (const line of sectionBody.split('\n')) {
      const kvMatch = line.match(/^(\w[\w\s]*):\s+(.+)$/);
      if (kvMatch && metaKeys.has(kvMatch[1].trim().toLowerCase())) {
        fields[kvMatch[1].trim().toLowerCase()] = kvMatch[2].trim();
      } else {
        bodyLines.push(line);
      }
    }

    const fm: string[] = ['---'];
    fm.push(`name: "${hits[i].name}"`);
    fm.push(`type: ${fields.type ?? hits[i].type}`);
    delete fields.type;
    if (fields.status) { fm.push(`status: ${fields.status}`); delete fields.status; }
    if (fields.tags) {
      const tagList = fields.tags.split(',').map(t => t.trim()).filter(Boolean);
      fm.push(`tags: [${tagList.join(', ')}]`);
      delete fields.tags;
    }
    if (fields.session) { fm.push(`session: ${fields.session}`); delete fields.session; }
    for (const [k, v] of Object.entries(fields)) {
      fm.push(`${k}: ${v}`);
    }
    fm.push('---');

    const body = bodyLines.join('\n').trim();
    const finalContent = body ? fm.join('\n') + '\n\n' + body + '\n' : fm.join('\n') + '\n';

    entities.push({ name: hits[i].name, type: hits[i].type, content: finalContent });
  }

  return entities;
}
