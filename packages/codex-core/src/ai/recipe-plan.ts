export type RecipeAction = 'create' | 'patch';

export interface RecipeStep {
  path: string;
  action: RecipeAction;
  summary: string;
}

export interface RecipePlan {
  title: string;
  steps: RecipeStep[];
}

export const RECIPE_MAX_STEPS = 8;

const PATH_RE = /^[A-Za-z0-9][\w ./'()-]*\.md$/;

/**
 * Normalize a recipe path. Rejects traversal, absolute paths, and non-markdown.
 */
export function sanitizeRecipePath(raw: string): string | null {
  const path = raw.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!path || path.includes('..') || path.includes('\0')) return null;
  if (!PATH_RE.test(path)) return null;
  if (path.split('/').some(seg => !seg || seg === '.' || seg === '..')) return null;
  return path;
}

function extractJsonObject(raw: string): unknown {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('No JSON object in recipe plan');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * Parse an LLM recipe plan. Invalid steps are dropped; empty plans throw.
 */
export function parseRecipePlan(raw: string): RecipePlan {
  const parsed = extractJsonObject(raw) as {
    title?: unknown;
    steps?: unknown;
  };
  const title = typeof parsed.title === 'string' && parsed.title.trim()
    ? parsed.title.trim()
    : 'Recipe plan';
  if (!Array.isArray(parsed.steps)) {
    throw new Error('Recipe plan is missing steps');
  }

  const seen = new Set<string>();
  const steps: RecipeStep[] = [];
  for (const item of parsed.steps) {
    if (steps.length >= RECIPE_MAX_STEPS) break;
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const path = typeof rec.path === 'string' ? sanitizeRecipePath(rec.path) : null;
    const action = rec.action === 'create' || rec.action === 'patch' ? rec.action : null;
    const summary = typeof rec.summary === 'string' ? rec.summary.trim() : '';
    if (!path || !action || !summary) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    steps.push({ path, action, summary: summary.slice(0, 240) });
  }

  if (steps.length === 0) {
    throw new Error('Recipe plan has no valid steps');
  }
  return { title, steps };
}

export function errorKey(d: { filePath: string; rule: string; line: number }): string {
  return `${d.filePath}:${d.rule}:${d.line}`;
}
