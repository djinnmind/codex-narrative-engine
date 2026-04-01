export const DEFAULT_ENTITY_TYPES = [
  'npc', 'creature', 'location', 'faction', 'item',
  'session', 'quest', 'adventure', 'event', 'world', 'rules', 'handout',
] as const;

export const ENTITY_TYPES = [...DEFAULT_ENTITY_TYPES, 'custom'] as const;

export type EntityType = typeof ENTITY_TYPES[number] | (string & {});

export interface Entity {
  filePath: string;
  name: string;
  aliases: string[];
  type: EntityType;
  frontmatter: Record<string, unknown>;
  links: LinkReference[];
  bodyPreview: string;
  statblock?: StatblockData;
}

export interface StatblockData {
  /** Bestiary creature reference (e.g. `creature: Ancient Red Dragon`) */
  creature?: string;
  name?: string;
  size?: string;
  /** The D&D creature type (dragon, humanoid, etc.) — named to avoid collision with Entity.type */
  creatureType?: string;
  subtype?: string;
  alignment?: string;
  ac?: string;
  hp?: string;
  hitDice?: string;
  speed?: string;
  /** Ability scores in order: [STR, DEX, CON, INT, WIS, CHA] */
  stats?: number[];
  cr?: string;
  senses?: string;
  languages?: string;
  damageImmunities?: string;
  damageResistances?: string;
  damageVulnerabilities?: string;
  conditionImmunities?: string;
  /** Full raw YAML from the statblock code block (includes traits, actions, etc.) */
  raw: string;
}

export interface LinkReference {
  target: string;
  line: number;
  column: number;
  context: 'frontmatter' | 'body';
  sourcePath: string;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'hint';

export interface Diagnostic {
  filePath: string;
  line: number;
  column: number;
  endColumn?: number;
  severity: DiagnosticSeverity;
  message: string;
  rule: string;
  relatedEntities: string[];
}

export interface EntityQuery {
  name?: string;
  type?: EntityType;
  status?: string;
}

export type StatblockFormat = 'markdown' | 'fantasy-statblocks';

export function isEntityType(value: unknown, customTypes?: string[]): value is EntityType {
  if (typeof value !== 'string') return false;
  if ((ENTITY_TYPES as readonly string[]).includes(value)) return true;
  if (customTypes && customTypes.includes(value)) return true;
  return false;
}
