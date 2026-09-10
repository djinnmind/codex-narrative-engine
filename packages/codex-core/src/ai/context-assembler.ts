import type { EntityRegistry } from '../indexer/entity-registry';
import type { Entity } from '../types';
import type { ChatMessage, EntitySummary, VaultContext } from './types';
import { collapseRelatedNames, parseAtMentions } from './at-mentions';

export interface MentionPin {
  name: string;
  type: string;
  aliases: string[];
  bodyExcerpt?: string;
  status?: string;
  frontmatter?: Record<string, unknown>;
}

export interface ContextAssemblerOptions {
  maxEntities?: number;
  recentSessionCount?: number;
  linkExpansionDepth?: number;
  includeWorldEntities?: boolean;
  /** Max entities to take from lexical fallback when the query names no entity. */
  lexicalFallbackTopK?: number;
}

const DEFAULTS: Required<ContextAssemblerOptions> = {
  maxEntities: 60,
  recentSessionCount: 3,
  linkExpansionDepth: 1,
  includeWorldEntities: true,
  lexicalFallbackTopK: 8,
};

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'for', 'with', 'this', 'that',
  'how', 'would', 'what', 'who', 'whom', 'whose', 'which', 'when', 'where', 'why',
  'is', 'was', 'are', 'were', 'be', 'been', 'being', 'am', 'do', 'does', 'did',
  'can', 'could', 'should', 'on', 'at', 'from', 'by', 'as', 'my', 'your', 'our',
  'their', 'his', 'her', 'its', 'about', 'into', 'over', 'after', 'before',
  'just', 'than', 'then', 'them', 'these', 'those', 'any', 'all', 'some',
]);

const LINTED_FM_KEYS = [
  'status', 'faction', 'location', 'leader', 'held_by', 'occupation', 'title', 'role', 'tags',
];

/**
 * Assembles vault context for LLM prompts by extracting relevant entities
 * from the registry based on a user query.
 */
export class ContextAssembler {
  constructor(
    private registry: EntityRegistry,
    private options: ContextAssemblerOptions = {},
  ) {}

  /**
   * Build a VaultContext for a user query. Extracts mentioned entity names
   * and aliases, falls back to lexical scoring, expands via link graph, and
   * includes recent sessions + world rules.
   */
  assemble(userMessage: string, overrides: ContextAssemblerOptions = {}): VaultContext {
    const opts = { ...DEFAULTS, ...this.options, ...overrides };
    const allEntities = this.registry.getAllEntities();

    const mentioned = this.extractMentionedEntities(userMessage, allEntities);
    let seeds = mentioned;
    if (seeds.length === 0) {
      seeds = this.lexicalFallback(userMessage, allEntities, opts.lexicalFallbackTopK);
    }

    const expanded = new Map<string, Entity>();
    for (const entity of seeds) {
      expanded.set(entity.filePath, entity);
    }
    if (opts.linkExpansionDepth > 0) {
      this.expandLinks(expanded, seeds, opts.linkExpansionDepth);
    }

    const blanketWorld = opts.includeWorldEntities && mentioned.length === 0;
    if (blanketWorld) {
      for (const entity of this.registry.getByType('world')) {
        expanded.set(entity.filePath, entity);
      }
    }

    const entities = Array.from(expanded.values())
      .slice(0, opts.maxEntities)
      .map(e => this.toSummary(e));

    const recentSessions =
      mentioned.length === 0 ? this.getRecentSessions(opts.recentSessionCount) : [];
    const worldRules = blanketWorld ? this.getWorldRules() : [];

    return {
      entities,
      recentSessions,
      worldRules,
      totalEntityCount: allEntities.length,
    };
  }

  /**
   * Lore Chat path: @session / @npc / @Name plus leftover free text through
   * the name/alias finder.
   */
  assembleForChat(userMessage: string): {
    context: VaultContext;
    directives: string[];
    remainder: string;
    seedPaths: string[];
  } {
    const extraTypes = this.registry.getCustomTypes();
    const { directives, remainder } = parseAtMentions(userMessage, extraTypes);
    const allEntities = this.registry.getAllEntities();
    const lookupText = remainder.trim() || userMessage;

    if (directives.length === 0) {
      const mentioned = this.extractMentionedEntities(userMessage, allEntities);
      const context = this.assemble(userMessage);
      context.unknownNames = this.unknownProperNames(lookupText, mentioned);
      return {
        context,
        directives,
        remainder: userMessage,
        seedPaths: mentioned.map(e => e.filePath),
      };
    }

    const scoped = this.assembleFromMentions(directives);
    const mentioned = remainder.trim()
      ? this.extractMentionedEntities(remainder, allEntities)
      : [];
    const seedPaths = [
      ...mentioned.map(e => e.filePath),
      ...scoped.entities.map(e => e.filePath),
    ];

    if (!remainder.trim()) {
      scoped.unknownNames = this.unknownProperNames(lookupText, mentioned);
      return { context: scoped, directives, remainder, seedPaths: Array.from(new Set(seedPaths)) };
    }

    const rest = this.assemble(remainder, { includeWorldEntities: false });
    const context = mergeLocalContexts(scoped, rest);
    context.unknownNames = this.unknownProperNames(lookupText, mentioned);
    return {
      context,
      directives,
      remainder,
      seedPaths: Array.from(new Set(seedPaths)),
    };
  }

  /** Capitalized query words that did not resolve to an indexed entity. */
  unknownProperNames(query: string, _mentioned: Entity[]): string[] {
    const all = this.registry.getAllEntities();
    const found: string[] = [];
    const seen = new Set<string>();
    const caps = query.match(/\b[A-Z][a-zA-Z]{2,}\b/g) ?? [];
    for (const word of caps) {
      const lower = word.toLowerCase();
      if (STOPWORDS.has(lower) || seen.has(lower)) continue;
      seen.add(lower);
      if (this.extractMentionedEntities(word, all).length > 0) continue;
      found.push(word);
    }
    return found;
  }

  /**
   * Build a VaultContext scoped to specific @mention directives.
   */
  assembleFromMentions(mentions: string[]): VaultContext {
    const opts = { ...DEFAULTS, ...this.options };
    const allEntities = this.registry.getAllEntities();
    const collected = new Map<string, Entity>();
    let includeWorldRules = false;

    for (const mention of mentions) {
      const lower = mention.toLowerCase();

      if (lower === '@all') {
        for (const e of allEntities) collected.set(e.filePath, e);
        includeWorldRules = true;
        break;
      }
      if (lower === '@recent') {
        const sessions = this.registry.getByType('session')
          .sort((a, b) => this.sessionSortKey(b) - this.sessionSortKey(a))
          .slice(0, 3);
        for (const s of sessions) collected.set(s.filePath, s);
        this.collectPlotNotesFromSessions(collected, sessions.slice(0, 1));
        continue;
      }
      if (lower === '@world') {
        for (const e of this.registry.getByType('world')) collected.set(e.filePath, e);
        includeWorldRules = true;
        continue;
      }

      const typeMatch = lower.replace('@', '');
      const byType = this.registry.getByType(typeMatch as any);
      if (byType.length > 0) {
        const ordered = typeMatch === 'session'
          ? [...byType].sort((a, b) => this.sessionSortKey(b) - this.sessionSortKey(a))
          : byType;
        const take = ordered.slice(0, typeMatch === 'session' ? 8 : 20);
        for (const e of take) collected.set(e.filePath, e);
        if (typeMatch === 'session') {
          this.collectPlotNotesFromSessions(collected, take.slice(0, 1));
        }
        continue;
      }

      this.resolveNamedMention(mention.replace(/^@/, ''), allEntities, collected);
    }

    const entities = Array.from(collected.values())
      .slice(0, opts.maxEntities)
      .map(e => this.toSummary(e));

    return {
      entities,
      recentSessions: [],
      worldRules: includeWorldRules ? this.getWorldRules() : [],
      totalEntityCount: allEntities.length,
    };
  }

  private resolveNamedMention(
    entityName: string,
    allEntities: Entity[],
    collected: Map<string, Entity>,
  ): void {
    const byName = this.registry.getByName(entityName);
    if (byName.length > 0) {
      for (const e of byName) collected.set(e.filePath, e);
      return;
    }
    const lower = entityName.toLowerCase();
    for (const e of allEntities) {
      const nameLower = e.name.toLowerCase();
      if (
        nameLower === lower ||
        nameLower.startsWith(lower + ' ') ||
        e.aliases.some(a => a.toLowerCase() === lower)
      ) {
        collected.set(e.filePath, e);
      }
    }
  }

  /** Exposed for tests: name + alias substring match, longest labels first. */
  extractMentionedEntities(query: string, allEntities: Entity[]): Entity[] {
    const queryLower = query.toLowerCase();
    const found = new Map<string, Entity>();

    const labels: { label: string; entity: Entity }[] = [];
    for (const entity of allEntities) {
      for (const label of labelsFromName(entity.name)) {
        labels.push({ label, entity });
      }
      for (const alias of entity.aliases) {
        for (const label of labelsFromAlias(alias)) {
          labels.push({ label, entity });
        }
      }
    }
    labels.sort((a, b) => b.label.length - a.label.length);

    for (const { label, entity } of labels) {
      if (found.has(entity.filePath)) continue;
      if (queryLower.includes(label)) {
        found.set(entity.filePath, entity);
      }
    }
    return collapseRelatedNames(Array.from(found.values()));
  }

  /** Exposed for tests: token overlap over type, names, linted frontmatter, excerpt. */
  lexicalFallback(query: string, allEntities: Entity[], topK: number): Entity[] {
    const tokens = tokenizeQuery(query);
    if (tokens.length === 0) return [];

    const scored = allEntities
      .map(entity => ({ entity, score: scoreEntity(tokens, entity) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name));

    return scored.slice(0, topK).map(s => s.entity);
  }

  private expandLinks(
    expanded: Map<string, Entity>,
    seeds: Entity[],
    depth: number,
  ): void {
    let frontier = seeds;
    for (let d = 0; d < depth; d++) {
      const next: Entity[] = [];
      for (const entity of frontier) {
        for (const link of entity.links) {
          const targets = this.registry.getByName(link.target);
          for (const t of targets) {
            if (!expanded.has(t.filePath)) {
              expanded.set(t.filePath, t);
              next.push(t);
            }
          }
        }
      }
      frontier = next;
    }
  }

  private toSummary(entity: Entity): EntitySummary {
    const summary: EntitySummary = {
      name: entity.name,
      type: entity.type,
      filePath: entity.filePath,
      aliases: [...entity.aliases],
      frontmatter: entity.frontmatter,
      bodyPreview: entity.bodyPreview,
      bodyExcerpt: entity.bodyExcerpt,
      linkedEntityNames: entity.links.map(l => l.target),
    };
    if (entity.statblock) {
      summary.statblockRaw = entity.statblock.raw;
    }
    return summary;
  }

  private collectPlotNotesFromSessions(
    collected: Map<string, Entity>,
    sessions: Entity[],
  ): void {
    const plot = new Set(['adventure', 'quest', 'arc']);
    for (const s of sessions) {
      for (const link of s.links) {
        for (const t of this.registry.getByName(link.target)) {
          if (plot.has(String(t.type).toLowerCase())) {
            collected.set(t.filePath, t);
          }
        }
      }
    }
  }

  private getRecentSessions(count: number): string[] {
    return this.registry
      .getByType('session')
      .sort((a, b) => this.sessionSortKey(b) - this.sessionSortKey(a))
      .slice(0, count)
      .map(s => `## ${s.name}\n${s.bodyExcerpt || s.bodyPreview}`);
  }

  private getWorldRules(): string[] {
    return this.registry
      .getByType('world')
      .map(w => `## ${w.name}\n${w.bodyExcerpt || w.bodyPreview}`);
  }

  /** session_number, then a digit in the title, then date. Numbers beat dates so Session 5 wins an empty date. */
  private sessionSortKey(entity: Entity): number {
    const n = entity.frontmatter['session_number'];
    if (typeof n === 'number' && Number.isFinite(n)) return n;
    if (typeof n === 'string' && n.trim()) {
      const parsed = Number(n);
      if (!Number.isNaN(parsed)) return parsed;
    }
    const fromName = entity.name.match(/(\d+)/);
    if (fromName) return Number(fromName[1]);
    const d = entity.frontmatter['date'];
    if (typeof d === 'string' && d.trim()) {
      const t = new Date(d).getTime();
      if (!Number.isNaN(t) && t !== 0) return t;
    }
    return 0;
  }
}

/**
 * Full alias plus quoted nicknames and distinctive tokens.
 * `Kaelen "Ironhook" Vance` also yields `ironhook` so a query can hit the nickname.
 */
function labelsFromAlias(alias: string): string[] {
  const trimmed = alias.trim();
  if (trimmed.length < 2) return [];
  const labels = new Set<string>([trimmed.toLowerCase()]);

  for (const m of trimmed.matchAll(/["“”']([^"“”']{3,})["“”']/g)) {
    labels.add(m[1].trim().toLowerCase());
  }

  for (const tok of trimmed.replace(/["“”']/g, ' ').split(/[^a-zA-Z0-9]+/)) {
    const t = tok.toLowerCase();
    if (t.length >= 5 && !STOPWORDS.has(t)) labels.add(t);
  }
  return Array.from(labels);
}

/** Canonical name plus first-name / distinctive tokens (`Mira` → Mira the Scout). */
function labelsFromName(name: string): string[] {
  const trimmed = name.trim();
  if (trimmed.length < 2) return [];
  const labels = new Set<string>([trimmed.toLowerCase()]);
  for (const tok of trimmed.replace(/["“”']/g, ' ').split(/[^a-zA-Z0-9]+/)) {
    const t = tok.toLowerCase();
    if (t.length >= 3 && !STOPWORDS.has(t)) labels.add(t);
  }
  return Array.from(labels);
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/['\u2019]s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

function formatFmValue(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(formatFmValue).join(' ');
  return '';
}

function scoreEntity(tokens: string[], entity: Entity): number {
  const hay = [
    entity.type,
    entity.name,
    ...entity.aliases,
    ...LINTED_FM_KEYS.map(k => formatFmValue(entity.frontmatter[k])),
    entity.bodyExcerpt || entity.bodyPreview,
  ].join(' ').toLowerCase();

  let score = 0;
  for (const tok of tokens) {
    if (!hay.includes(tok)) continue;
    score += tok.length;
    if (entity.type.toLowerCase() === tok) score += 4;
    if (entity.name.toLowerCase().includes(tok)) score += 2;
    const status = formatFmValue(entity.frontmatter.status).toLowerCase();
    if (status && status === tok) score += 3;
  }
  return score;
}

/**
 * Pin vault matches onto the current question so chat history cannot
 * redefine an alias as a metal, place, or invented technique.
 */
export function mentionPinsFromEntities(
  entities: Array<{
    name: string;
    type: string;
    aliases: string[];
    bodyExcerpt?: string;
    frontmatter?: Record<string, unknown>;
  }>,
): MentionPin[] {
  return entities.map(e => ({
    name: e.name,
    type: String(e.type),
    aliases: e.aliases,
    bodyExcerpt: e.bodyExcerpt,
    frontmatter: e.frontmatter,
    status: pinStatus(e),
  }));
}

function pinStatus(e: MentionPin): string {
  const direct = e.status?.trim() ?? '';
  if (direct) return direct;
  return formatFmValue(e.frontmatter?.status).trim();
}

export function groundUserMessageWithMentions(query: string, mentioned: MentionPin[]): string {
  if (mentioned.length === 0) return query;
  const names = mentioned.map(e => `[[${e.name}]]`).join(', ');
  const stateLines = mentioned
    .map(e => ({ e, status: pinStatus(e) }))
    .filter(x => x.status)
    .map(x => `- [[${x.e.name}]] (${x.e.type}): ${x.status} — already true. Describe this state; do not treat it as an open question.`);
  const currentState = stateLines.length
    ? `CURRENT STATE (frontmatter status beats older session prep):\n${stateLines.join('\n')}\n\n`
    : '';
  const cards = mentioned
    .map(e => {
      const aka = e.aliases.length ? `aliases: ${e.aliases.join(', ')}` : '';
      const status = pinStatus(e);
      const statusLine = status ? `status: ${status}` : '';
      const body = stripStatblockFence(e.bodyExcerpt ?? '').slice(0, 1200);
      return [`### ${e.name} (${e.type})`, aka, statusLine, body].filter(Boolean).join('\n');
    })
    .join('\n\n');
  return `${query}

[VAULT CANON]
${currentState}The question names ${names}. Those are existing campaign entities (nicknames/titles included). They are not a metal, alloy, forging technique, place, or faction — do not invent one.

${cards}

Answer from these notes only: who they are, what they are forging or doing, and why. If CURRENT STATE is listed, write in present tense from that state. Session notes that still describe a pending interrogation or undecided loyalty are stale.]`;
}

function stripStatblockFence(text: string): string {
  return text.replace(/```statblock[\s\S]*?```/gi, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Name/alias hits are lookups. Drop prior chat so a poisoned thread cannot
 * keep answering the same invented lore.
 */
export function messagesForLookupTurn(
  messages: ChatMessage[],
  mentioned: MentionPin[],
): ChatMessage[] {
  if (mentioned.length === 0) return messages;
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return messages;
  return [{ role: 'user', content: groundUserMessageWithMentions(lastUser.content, mentioned) }];
}

function mergeLocalContexts(primary: VaultContext, extra: VaultContext): VaultContext {
  const seen = new Set(primary.entities.map(e => e.filePath));
  const entities = [...primary.entities];
  for (const e of extra.entities) {
    if (seen.has(e.filePath)) continue;
    seen.add(e.filePath);
    entities.push(e);
  }
  return {
    entities,
    recentSessions: primary.recentSessions.length ? primary.recentSessions : extra.recentSessions,
    worldRules: primary.worldRules.length ? primary.worldRules : extra.worldRules,
    totalEntityCount: extra.totalEntityCount || primary.totalEntityCount,
    followedNotes: primary.followedNotes ?? extra.followedNotes,
    unknownNames: primary.unknownNames ?? extra.unknownNames,
  };
}
