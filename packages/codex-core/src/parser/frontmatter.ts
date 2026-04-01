import matter from 'gray-matter';
import { isEntityType } from '../types';
import type { EntityType } from '../types';

export interface ParsedFrontmatter {
  type: EntityType;
  name: string;
  frontmatter: Record<string, unknown>;
  bodyContent: string;
  bodyStartLine: number;
}

/**
 * Extract structured frontmatter from raw Markdown file content.
 * Returns null if the file has no frontmatter or no recognized `type` field.
 */
export function parseFrontmatter(
  content: string,
  filePath: string,
  customTypes?: string[],
): ParsedFrontmatter | null {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(content);
  } catch {
    return null;
  }

  const data = parsed.data;
  if (!data || typeof data !== 'object') return null;

  const rawType = data.type;
  const type: EntityType = isEntityType(rawType, customTypes) ? rawType : 'custom';

  // Files without any `type` field are not treated as entities
  if (rawType === undefined) return null;

  const name = typeof data.name === 'string'
    ? data.name
    : filePathToName(filePath);

  const bodyContent = parsed.content;

  // Calculate where the body starts by finding the closing `---` delimiter.
  // We scan the raw content for the second occurrence of a line matching `---`.
  const bodyStartLine = findBodyStartLine(content);

  return {
    type,
    name,
    frontmatter: data as Record<string, unknown>,
    bodyContent,
    bodyStartLine,
  };
}

function findBodyStartLine(content: string): number {
  const lines = content.split('\n');
  let delimiterCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      delimiterCount++;
      if (delimiterCount === 2) {
        return i + 2; // 1-indexed, first line after closing delimiter
      }
    }
  }
  return 1;
}

function filePathToName(filePath: string): string {
  const filename = filePath.split('/').pop() ?? filePath;
  return filename.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
}

/**
 * Generate a body preview: first N non-empty lines of the Markdown body.
 */
export function bodyPreview(bodyContent: string, maxLines = 3): string {
  return bodyContent
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .slice(0, maxLines)
    .join('\n');
}
