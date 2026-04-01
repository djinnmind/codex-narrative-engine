import type { StatblockData } from '../types';

/**
 * Matches fenced code blocks with the `statblock` language tag.
 * Captures the YAML content between the opening and closing fences.
 */
const STATBLOCK_FENCE_RE = /^```statblock\s*\n([\s\S]*?)^```/gm;

/**
 * Extract all Fantasy Statblocks code blocks from raw Markdown content.
 * Returns structured data for each block found.
 */
export function extractStatblocks(content: string): StatblockData[] {
  const results: StatblockData[] = [];

  let match: RegExpExecArray | null;
  STATBLOCK_FENCE_RE.lastIndex = 0;

  while ((match = STATBLOCK_FENCE_RE.exec(content)) !== null) {
    const raw = match[1].trim();
    if (raw.length === 0) continue;

    const parsed = parseStatblockYaml(raw);
    if (parsed) {
      results.push(parsed);
    }
  }

  return results;
}

/**
 * Lightweight YAML parser for Fantasy Statblocks content.
 * Handles both bestiary references (`creature: Name`) and
 * full inline stat block definitions.
 */
function parseStatblockYaml(raw: string): StatblockData | null {
  const fields = parseSimpleYaml(raw);
  if (Object.keys(fields).length === 0) return null;

  const data: StatblockData = { raw };

  if (fields.creature) data.creature = String(fields.creature);
  if (fields.name) data.name = String(fields.name);
  if (fields.size) data.size = String(fields.size);
  if (fields.type) data.creatureType = String(fields.type);
  if (fields.subtype) data.subtype = String(fields.subtype);
  if (fields.alignment) data.alignment = String(fields.alignment);
  if (fields.ac != null) data.ac = String(fields.ac);
  if (fields.hp != null) data.hp = String(fields.hp);
  if (fields.hit_dice) data.hitDice = String(fields.hit_dice);
  if (fields.speed) data.speed = String(fields.speed);
  if (fields.cr != null) data.cr = String(fields.cr);
  if (fields.senses) data.senses = String(fields.senses);
  if (fields.languages) data.languages = String(fields.languages);
  if (fields.damage_immunities) data.damageImmunities = String(fields.damage_immunities);
  if (fields.damage_resistances) data.damageResistances = String(fields.damage_resistances);
  if (fields.damage_vulnerabilities) data.damageVulnerabilities = String(fields.damage_vulnerabilities);
  if (fields.condition_immunities) data.conditionImmunities = String(fields.condition_immunities);

  if (fields.stats) {
    data.stats = parseStatsArray(fields.stats);
  }

  return data;
}

/**
 * Parse top-level YAML key-value pairs without a full YAML parser.
 * Handles simple scalars and inline arrays like `[30, 10, 29, 18, 15, 23]`.
 * Ignores nested blocks (traits, actions, etc.) — those stay in `raw`.
 */
function parseSimpleYaml(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.startsWith('  ') || line.startsWith('\t')) continue;
    if (line.startsWith('-')) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    if (key && value) {
      result[key] = value;
    }
  }

  return result;
}

function parseStatsArray(raw: unknown): number[] | undefined {
  const str = String(raw);
  const match = str.match(/\[([^\]]+)\]/);
  if (!match) return undefined;

  const nums = match[1].split(',').map(s => parseInt(s.trim(), 10));
  if (nums.length === 6 && nums.every(n => !isNaN(n))) {
    return nums;
  }
  return undefined;
}
