import type { VaultContext } from './types';

export interface SystemPromptOptions {
  ruleSystem: string;
  campaignTone: string;
  language: string;
}

const DEFAULT_OPTIONS: SystemPromptOptions = {
  ruleSystem: 'D&D 5e',
  campaignTone: '',
  language: 'English',
};

/**
 * Builds the system prompt for LLM interactions, injecting vault context
 * so responses are grounded in the user's actual lore.
 */
export function buildSystemPrompt(
  context: VaultContext,
  options: Partial<SystemPromptOptions> = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const sections: string[] = [
    BASE_PROMPT,
    buildCampaignMeta(opts, context),
  ];

  if (context.entities.length > 0) {
    sections.push(buildEntityContext(context));
  }

  if (context.worldRules.length > 0) {
    sections.push(buildWorldRules(context));
  }

  if (context.recentSessions.length > 0) {
    sections.push(buildRecentSessions(context));
  }

  if (context.followedNotes && context.followedNotes.length > 0) {
    sections.push(buildFollowedNotes(context));
  }

  sections.push(buildGenerationRules(opts));

  return sections.join('\n\n');
}

const BASE_PROMPT = `You are a creative assistant for a tabletop RPG campaign. You have deep knowledge of the campaign's lore and must stay consistent with established facts.

Your role:
- Answer questions about the campaign world using ONLY the provided context
- Generate new content that fits seamlessly into the existing lore
- Flag potential contradictions if you notice them
- Be creative but never contradict established facts`;

function buildCampaignMeta(opts: SystemPromptOptions, context: VaultContext): string {
  const lines = ['CAMPAIGN INFO:'];
  if (opts.ruleSystem) lines.push(`- Rule System: ${opts.ruleSystem}`);
  if (opts.campaignTone) lines.push(`- Tone: ${opts.campaignTone}`);
  if (opts.language && opts.language !== 'English') lines.push(`- Language: ${opts.language}`);
  lines.push(`- Total indexed entities: ${context.totalEntityCount}`);
  lines.push(`- Entities in current context: ${context.entities.length}`);
  if (context.unknownNames?.length) {
    lines.push(`- Not in vault (do not invent): ${context.unknownNames.join(', ')}`);
  }
  return lines.join('\n');
}

function buildEntityContext(context: VaultContext): string {
  const followed = new Set((context.followedNotes ?? []).map(n => n.filePath));
  const lines = ['KNOWN ENTITIES:'];
  for (const entity of context.entities) {
    lines.push(`\n### ${entity.name} (${entity.type})`);
    if (entity.aliases?.length) {
      lines.push(`  aliases: ${entity.aliases.join(', ')}`);
    }

    const fmEntries = Object.entries(entity.frontmatter)
      .filter(([k]) => k !== 'type' && k !== 'name' && k !== 'aliases')
      .map(([k, v]) => `  ${k}: ${formatValue(v)}`);
    if (fmEntries.length > 0) {
      lines.push(fmEntries.join('\n'));
    }

    if (!followed.has(entity.filePath)) {
      const body = entity.bodyExcerpt || entity.bodyPreview;
      if (body) {
        lines.push(body);
      }
    } else {
      lines.push('  (full note followed below)');
    }

    if (entity.statblockRaw && !followed.has(entity.filePath)) {
      lines.push('  Statblock:');
      for (const sbLine of entity.statblockRaw.split('\n').slice(0, 20)) {
        lines.push(`    ${sbLine}`);
      }
    }

    if (entity.linkedEntityNames.length > 0) {
      const unique = [...new Set(entity.linkedEntityNames)];
      lines.push(`  Links to: ${unique.join(', ')}`);
    }
  }
  return lines.join('\n');
}

function buildWorldRules(context: VaultContext): string {
  return 'WORLD RULES & LORE:\n' + context.worldRules.join('\n\n');
}

function buildRecentSessions(context: VaultContext): string {
  return 'RECENT SESSIONS:\n' + context.recentSessions.join('\n\n');
}

function buildFollowedNotes(context: VaultContext): string {
  const lines = [
    'FULL NOTES (followed from the vault — prefer these over excerpts):',
  ];
  for (const note of context.followedNotes ?? []) {
    lines.push(`\n### ${note.name}`);
    lines.push(`path: ${note.filePath}`);
    lines.push(note.body);
  }
  return lines.join('\n');
}

function buildGenerationRules(opts: SystemPromptOptions): string {
  const lines = [
    'RESPONSE RULES:',
    '- Use [[Entity Name]] wiki-link syntax when referencing existing campaign entities',
    '- When generating new entities, include proper YAML frontmatter delimited by --- lines. Example:',
    '  ---',
    '  type: npc',
    '  name: "Guard Captain"',
    '  status: alive',
    '  tags: [guard, city-watch]',
    '  ---',
    '  IMPORTANT: Always use --- delimiters, lowercase keys (type, name, tags), and quote values that contain special characters. Do NOT use "Entity Name:", "Type:", "Tags:" or similar informal labels — use strict YAML frontmatter only.',
    '- Maintain consistency with all established relationships, timelines, and character states',
    '- If a query word matches an entity alias or nickname listed above, that word refers to THAT entity. Do not invent a new place, metal, technique, or faction with the same name.',
    '- If asked about a named person or place that is not in KNOWN ENTITIES or FULL NOTES, say they are not in the vault. Suggest the closest listed entities. Do not invent personality archetypes for missing characters.',
    '- Frontmatter status is current canon and overrides older session prep when they disagree. If someone is already allied, captured, dead, or missing, answer in present tense from that state — do not write a hypothetical "would they turn / ally / stay loyal."',
    '- If asked to create content that would contradict existing lore, explain the contradiction and suggest alternatives',
    '- Keep the tone consistent with the campaign setting',
  ];
  if (opts.language && opts.language !== 'English') {
    lines.push(`- IMPORTANT: Write ALL prose, descriptions, and dialogue in ${opts.language}. Keep YAML frontmatter keys, type values, and wiki-link syntax in English.`);
  }
  return lines.join('\n');
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.join(', ');
  if (v === null || v === undefined) return '';
  return String(v);
}
