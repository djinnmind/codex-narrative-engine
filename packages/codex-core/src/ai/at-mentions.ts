import { DEFAULT_ENTITY_TYPES } from '../types';
import { RECIPE_SCOPE_TOKENS } from './recipe-intent';

const BUILTIN_SCOPES = new Set<string>(['all', 'recent', ...DEFAULT_ENTITY_TYPES, ...RECIPE_SCOPE_TOKENS]);

export interface ParsedAtMentions {
  /** Canonical directives such as `@session`, `@npc`, `@Kaelen`. */
  directives: string[];
  /** User text with @tokens removed, for the I1 finder. */
  remainder: string;
}

/**
 * Pull `@session` / `@npc` / `@"Kaelen Vance"` tokens out of a Lore Chat
 * message so they can be assembled separately from free-text lookup.
 */
export function parseAtMentions(
  message: string,
  extraTypes: string[] = [],
): ParsedAtMentions {
  const scopes = new Set(BUILTIN_SCOPES);
  for (const t of extraTypes) {
    if (t.trim()) scopes.add(t.trim().toLowerCase());
  }

  const directives: string[] = [];
  const ranges: { start: number; end: number }[] = [];
  const re = /@(?:"([^"]+)"|([A-Za-z][\w-]*))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    const token = (m[1] ?? m[2] ?? '').trim();
    if (!token) continue;
    const lower = token.toLowerCase();
    directives.push(scopes.has(lower) ? `@${lower}` : `@${token}`);
    ranges.push({ start: m.index, end: m.index + m[0].length });
  }

  let remainder = message;
  for (const r of [...ranges].reverse()) {
    remainder = remainder.slice(0, r.start) + remainder.slice(r.end);
  }
  remainder = remainder.replace(/\s+/g, ' ').trim();
  return { directives, remainder };
}

export const FOLLOW_MAX_NOTES = 4;
export const FOLLOW_MAX_CHARS_EACH = 8000;
export const FOLLOW_MAX_CHARS_TOTAL = 24_000;

export interface FollowTarget {
  name: string;
  filePath: string;
  type?: string;
  linkedEntityNames?: string[];
}

const PLOT_TYPES = new Set(['adventure', 'quest', 'arc']);

function isPlotNote(entity: FollowTarget): boolean {
  return PLOT_TYPES.has((entity.type ?? '').toLowerCase());
}

/**
 * Adventures / quests / arcs wiki-linked from session notes, newest session first.
 */
export function plotsLinkedFromSessions(
  sessions: FollowTarget[],
  all: FollowTarget[],
): FollowTarget[] {
  const byName = new Map<string, FollowTarget>();
  for (const e of all) {
    byName.set(e.name.toLowerCase(), e);
  }
  const out: FollowTarget[] = [];
  const seen = new Set<string>();
  for (const s of sessions) {
    for (const link of s.linkedEntityNames ?? []) {
      const hit = byName.get(link.toLowerCase());
      if (!hit || !isPlotNote(hit) || seen.has(hit.filePath)) continue;
      seen.add(hit.filePath);
      out.push(hit);
    }
  }
  return out;
}

const NAME_TITLES = new Set([
  'prince', 'lord', 'lady', 'captain', 'sergeant', 'master', 'sir', 'dame',
]);

/** First distinctive token of a name (`Prince Valerius Thorne` → `valerius`). */
export function primaryNameToken(name: string): string {
  const tokens = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !NAME_TITLES.has(t));
  return tokens[0] ?? '';
}

function specificity(entity: FollowTarget): number {
  let n = entity.name.length;
  if (entity.type === 'npc') n += 80;
  else if (entity.type === 'session') n += 40;
  else if (entity.type === 'location' || entity.type === 'world') n -= 30;
  return n;
}

const GENERIC_NAME_TOKENS = new Set([
  'session', 'adventure', 'quest', 'arc', 'note', 'the', 'new',
]);

/**
 * One entity per identity token: keep Prince Valerius Thorne, drop the dead
 * artificer `Valerius` and `Valerius's Spire` when the query only said Valerius.
 */
export function collapseRelatedNames<T extends FollowTarget>(entities: T[]): T[] {
  const best = new Map<string, T>();
  const passthrough: T[] = [];
  for (const e of entities) {
    if (e.type === 'session') {
      passthrough.push(e);
      continue;
    }
    const token = primaryNameToken(e.name);
    if (!token || token.length < 4 || GENERIC_NAME_TOKENS.has(token)) {
      passthrough.push(e);
      continue;
    }
    const prev = best.get(token);
    if (!prev || specificity(e) > specificity(prev)) best.set(token, e);
  }
  const kept = new Set([
    ...passthrough.map(e => e.filePath),
    ...Array.from(best.values()).map(e => e.filePath),
  ]);
  return entities.filter(e => kept.has(e.filePath));
}

/**
 * Named seeds first. When @session assembled notes, reserve a slot for the
 * newest session and — if those sessions link an adventure/quest/arc — one
 * plot note instead of a second stale session.
 */
export function pickFollowTargets(
  entities: FollowTarget[],
  seedPaths: string[],
  maxNotes = FOLLOW_MAX_NOTES,
): FollowTarget[] {
  const collapsed = collapseRelatedNames(entities);
  const byPath = new Map<string, FollowTarget>();
  for (const e of collapsed) {
    if (e.filePath && !byPath.has(e.filePath)) byPath.set(e.filePath, e);
  }

  const sessions = collapsed.filter(e => e.type === 'session');
  const plots = plotsLinkedFromSessions(sessions.slice(0, 1), collapsed).slice(0, 1);
  const reservePlots = plots.length > 0 ? Math.min(1, maxNotes - 1) : 0;
  const reserveSessions = sessions.length > 0
    ? Math.min(
        sessions.length,
        reservePlots > 0 ? 1 : 2,
        Math.max(1, maxNotes - 1 - reservePlots),
      )
    : 0;
  const namedMax = Math.max(1, maxNotes - reserveSessions - reservePlots);

  const named: FollowTarget[] = [];
  const seen = new Set<string>();
  const pushNamed = (path: string) => {
    if (named.length >= namedMax) return;
    const hit = byPath.get(path);
    if (!hit || hit.type === 'session' || seen.has(path)) return;
    seen.add(path);
    named.push(hit);
  };

  for (const p of seedPaths) pushNamed(p);
  for (const e of collapsed) {
    if (e.type !== 'session') pushNamed(e.filePath);
  }

  const out = [...named];
  const pushRest = (hit: FollowTarget) => {
    if (out.length >= maxNotes || seen.has(hit.filePath)) return false;
    seen.add(hit.filePath);
    out.push(hit);
    return true;
  };
  let plotSlots = reservePlots;
  for (const p of plots) {
    if (plotSlots <= 0) break;
    if (pushRest(p)) plotSlots--;
  }
  let sessionSlots = reserveSessions;
  for (const s of sessions) {
    if (sessionSlots <= 0) break;
    if (pushRest(s)) sessionSlots--;
  }
  return out;
}
