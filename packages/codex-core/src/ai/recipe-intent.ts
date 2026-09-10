export type RecipeId = 'npc-at-location' | 'advance-plots' | 'add-arc' | 'add-location';

export interface RecipeMatch {
  id: RecipeId;
  explicit: boolean;
}

const RECIPE_ALIASES: Record<string, RecipeId> = {
  'npc-at-location': 'npc-at-location',
  'npc-at-this-location': 'npc-at-location',
  'advance-plots': 'advance-plots',
  'advance-plot': 'advance-plots',
  'add-arc': 'add-arc',
  'add-plot': 'add-arc',
  'create-arc': 'add-arc',
  'add-location': 'add-location',
  'create-location': 'add-location',
  'add-place': 'add-location',
};

export const RECIPE_SCOPE_TOKENS = [
  'recipe',
  'npc-at-location',
  'npc-at-this-location',
  'advance-plots',
  'advance-plot',
  'add-arc',
  'add-plot',
  'create-arc',
  'add-location',
  'create-location',
  'add-place',
] as const;

const SKILL_AT_RE = new RegExp(
  `@(npc-at-location|npc-at-this-location|advance-plots|advance-plot|add-arc|add-plot|create-arc|add-location|create-location|add-place)\\b`,
  'i',
);

export function canonicalRecipeId(raw: string): RecipeId | null {
  return RECIPE_ALIASES[raw.trim().toLowerCase()] ?? null;
}

/** Exact `[[Name]]` targets, in order. Does not substring-match other notes. */
export function extractWikiLinkTargets(message: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]|#]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    const name = m[1].trim();
    if (name) out.push(name);
  }
  return out;
}

function remainderLooksLikeNpcRecipe(lower: string): boolean {
  if (!/\bnpc\b/.test(lower)) return false;
  if (!/\b(create|add|wire|place|put|introduce)\b/.test(lower)) return false;
  const atLoc = /\bat (this )?location\b/.test(lower) || /\bat \[\[/.test(lower);
  const intoTwo = /\binto\b/.test(lower) && /\band\b/.test(lower);
  return atLoc || intoTwo;
}

function remainderLooksLikeAddArc(lower: string): boolean {
  if (!/\b(create|add|start|begin|write)\b/.test(lower)) return false;
  if (/\ban?\s+arc\b/.test(lower) || /\bcampaign arc\b/.test(lower)) return true;
  return /\ban?\s+plot\b/.test(lower) && !/\bplot hooks?\b/.test(lower);
}

function remainderLooksLikeAddLocation(lower: string): boolean {
  if (/\bnpc\b/.test(lower)) return false;
  if (!/\b(create|add|start|begin|write)\b/.test(lower)) return false;
  if (/\b(create|add|start|begin|write)\s+(a |an |new )?location\b/.test(lower)) return true;
  return /\b(create|add)\s+(a |an |new )?(place|site)\b/.test(lower);
}

function remainderLooksLikeAdvance(lower: string): boolean {
  if (/\badvance\b/.test(lower) && /\bplots?\b/.test(lower)) return true;
  return (
    /\bupdate\b/.test(lower)
    && /\b(plots?|quests?|adventures?)\b/.test(lower)
    && /\bsessions?\b/.test(lower)
  );
}

/**
 * Explicit `@recipe` / `@npc-at-location` / `@advance-plots`, or a
 * high-confidence implicit ask. Does not steal ordinary lore questions.
 */
export function matchRecipeIntent(message: string): RecipeMatch | null {
  const recipeCmd = message.match(/@recipe(?::|\s+)([\w-]+)/i);
  if (recipeCmd) {
    const id = canonicalRecipeId(recipeCmd[1]);
    if (id) return { id, explicit: true };
  }

  const skillAt = message.match(SKILL_AT_RE);
  if (skillAt) {
    const id = canonicalRecipeId(skillAt[1]);
    if (id) return { id, explicit: true };
  }

  const lower = message.toLowerCase();
  if (remainderLooksLikeAdvance(lower)) {
    return { id: 'advance-plots', explicit: false };
  }
  if (remainderLooksLikeAddArc(lower)) {
    return { id: 'add-arc', explicit: false };
  }
  if (remainderLooksLikeAddLocation(lower)) {
    return { id: 'add-location', explicit: false };
  }
  if (remainderLooksLikeNpcRecipe(lower)) {
    return { id: 'npc-at-location', explicit: false };
  }
  return null;
}
