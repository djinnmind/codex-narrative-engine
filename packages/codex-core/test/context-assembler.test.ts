import { describe, it, expect, beforeEach } from 'vitest';
import { EntityRegistry } from '../src/indexer/entity-registry';
import { ContextAssembler, groundUserMessageWithMentions, messagesForLookupTurn } from '../src/ai/context-assembler';
import { bodyPreview, bodyExcerpt, AI_EXCERPT_MAX_LINES } from '../src/parser/frontmatter';
import { buildSystemPrompt } from '../src/ai/system-prompt';

function indexNpc(
  registry: EntityRegistry,
  path: string,
  opts: {
    name: string;
    aliases?: string[];
    status?: string;
    location?: string;
    faction?: string;
    body: string;
  },
): void {
  const aliases = opts.aliases?.length
    ? `aliases:\n${opts.aliases.map(a => `  - ${JSON.stringify(a)}`).join('\n')}\n`
    : '';
  const content = `---
type: npc
name: "${opts.name}"
${aliases}status: ${opts.status ?? 'alive'}
location: "${opts.location ?? ''}"
faction: "${opts.faction ?? ''}"
---

${opts.body}
`;
  registry.indexFile(path, content);
}

describe('bodyPreview vs bodyExcerpt', () => {
  const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1} of lore about the spy.`).join('\n\n');

  it('keeps hover preview to three non-empty lines', () => {
    const preview = bodyPreview(lines);
    expect(preview.split('\n')).toHaveLength(3);
    expect(preview).toContain('Line 1');
    expect(preview).not.toContain('Line 4');
  });

  it('AI excerpt is longer than hover but not the full file', () => {
    const excerpt = bodyExcerpt(lines);
    expect(excerpt.split('\n').length).toBe(AI_EXCERPT_MAX_LINES);
    expect(excerpt).toContain('Line 40');
    expect(excerpt).not.toContain('Line 41');
    expect(excerpt.length).toBeGreaterThan(bodyPreview(lines).length);
  });
});

describe('ContextAssembler index v2', () => {
  let registry: EntityRegistry;
  let assembler: ContextAssembler;

  beforeEach(() => {
    registry = new EntityRegistry();
    assembler = new ContextAssembler(registry, {
      includeWorldEntities: false,
      linkExpansionDepth: 0,
    });
  });

  it('matches entities by alias when the query omits the canonical name', () => {
    indexNpc(registry, 'npcs/varos.md', {
      name: 'Lord Varos',
      aliases: ['The Last Commander', 'the fallen duke'],
      status: 'dead',
      location: '[[Ironhold]]',
      faction: '[[The Silver Order]]',
      body: 'He fell during the Siege of Ironhold.\n\nHis blade was lost.',
    });
    indexNpc(registry, 'npcs/mira.md', {
      name: 'Mira the Scout',
      status: 'alive',
      body: 'A living scout in the Undercrypt.',
    });

    const ctx = assembler.assemble('What happened to the last commander?');
    expect(ctx.entities.map(e => e.name)).toContain('Lord Varos');
    expect(ctx.entities.map(e => e.name)).not.toContain('Mira the Scout');
    expect(ctx.entities[0].aliases).toContain('The Last Commander');
  });

  it('matches a quoted nickname inside an alias (Ironhook → Kaelen)', () => {
    indexNpc(registry, 'npcs/kaelen.md', {
      name: 'Kaelen Vance',
      aliases: ['Kaelen "Ironhook" Vance', 'Master Smith Kaelen'],
      status: 'alive',
      location: '[[The Ironbound Anvil]]',
      body: 'He is obsessed with forging a defense against the Ninth Constellation.',
    });
    indexNpc(registry, 'npcs/silas.md', {
      name: 'Silas Thorne',
      aliases: ['Mayor Silas Thorne'],
      status: 'alive',
      body: 'Mayor of Blackmoss Landing.',
    });

    const ctx = assembler.assemble('What is Ironhook forging, and why?');
    expect(ctx.entities.map(e => e.name)).toContain('Kaelen Vance');
    expect(ctx.entities.map(e => e.name)).not.toContain('Silas Thorne');
  });

  it('does not dump all world notes when an alias already seeded the query', () => {
    indexNpc(registry, 'npcs/kaelen.md', {
      name: 'Kaelen Vance',
      aliases: ['Kaelen "Ironhook" Vance'],
      body: 'Smith at the Ironbound Anvil. Forging a defense against the Ninth Constellation.',
    });
    registry.indexFile(
      'world/valerian-tech.md',
      `---
type: world
name: "Valerian Metallurgy"
---

GM guide: Valerian forging uses Aegis Core alloys and constellation-bonded steel.
`,
    );
    registry.indexFile(
      'sessions/session-3.md',
      `---
type: session
name: "Session 3"
date: "2026-01-01"
---

Party retrieved Ever-Steel schematics from the Solar Forge.
`,
    );

    const worldDumpAssembler = new ContextAssembler(registry, {
      includeWorldEntities: true,
      linkExpansionDepth: 0,
    });
    const ctx = worldDumpAssembler.assemble('What is Ironhook forging, and why?');
    expect(ctx.entities.map(e => e.name)).toContain('Kaelen Vance');
    expect(ctx.entities.map(e => e.name)).not.toContain('Valerian Metallurgy');
    expect(ctx.worldRules).toHaveLength(0);
    expect(ctx.recentSessions).toHaveLength(0);
  });

  it('uses lexical fallback when the query names no entity', () => {
    indexNpc(registry, 'npcs/varos.md', {
      name: 'Lord Varos',
      aliases: ['The Last Commander'],
      status: 'dead',
      location: '[[Ironhold]]',
      faction: '[[The Silver Order]]',
      body: 'The last commander of the Silver Order and spymaster of Ironhold before the siege.',
    });
    indexNpc(registry, 'npcs/mira.md', {
      name: 'Mira the Scout',
      status: 'alive',
      location: '[[The Undercrypt]]',
      body: 'A resourceful scout who survived the fall.',
    });

    const ctx = assembler.assemble("the dead duke's spymaster in Ironhold");
    expect(ctx.entities.map(e => e.name)).toContain('Lord Varos');
    const varos = ctx.entities.find(e => e.name === 'Lord Varos');
    expect(varos).toBeDefined();
  });

  it('puts the AI excerpt on summaries while the registry keeps a short hover preview', () => {
    const extra = Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1} of hidden court intrigue.`).join('\n\n');
    indexNpc(registry, 'npcs/varos.md', {
      name: 'Lord Varos',
      aliases: ['the fallen duke'],
      status: 'dead',
      body: `Lord Varos was the last commander.\n\nHe fell at Ironhold.\n\nThe blade was lost.\n\n${extra}`,
    });

    const entity = registry.getByPath('npcs/varos.md')!;
    expect(entity.bodyPreview.split('\n')).toHaveLength(3);
    expect(entity.bodyExcerpt.split('\n').length).toBeGreaterThan(3);
    expect(entity.bodyExcerpt).toContain('Paragraph 5');

    const ctx = assembler.assemble('Lord Varos');
    const summary = ctx.entities.find(e => e.name === 'Lord Varos')!;
    expect(summary.bodyPreview).toBe(entity.bodyPreview);
    expect(summary.bodyExcerpt).toBe(entity.bodyExcerpt);

    const prompt = buildSystemPrompt(ctx, { ruleSystem: 'D&D 5e' });
    expect(prompt).toContain('Paragraph 5');
    expect(prompt).toContain('aliases:');
  });

  it('does not lexical-match stopwords-only queries', () => {
    indexNpc(registry, 'npcs/mira.md', {
      name: 'Mira the Scout',
      body: 'A scout.',
    });
    const ctx = assembler.assemble('what about this');
    expect(ctx.entities).toHaveLength(0);
  });

  it('matches a first name token (Mira → Mira the Scout)', () => {
    indexNpc(registry, 'npcs/mira.md', {
      name: 'Mira the Scout',
      body: 'A resourceful scout who survived the fall.',
    });
    const ctx = assembler.assemble('How would Mira react to the betrayal?');
    expect(ctx.entities.map(e => e.name)).toContain('Mira the Scout');
  });

  it('drops poisoned chat history when an alias already resolved the query', () => {
    const mentioned = [
      {
        name: 'Kaelen Vance',
        type: 'npc',
        aliases: ['Kaelen "Ironhook" Vance'],
        bodyExcerpt: 'Obsessed with forging a defense against the Ninth Constellation.',
      },
    ];
    const history = [
      { role: 'user' as const, content: 'What is Ironhook forging, and why?' },
      {
        role: 'assistant' as const,
        content: 'Ironhook Forging is a Valerian metalworking technique.',
      },
      { role: 'user' as const, content: 'What is Ironhook forging, and why?' },
    ];
    const msgs = messagesForLookupTurn(history, mentioned);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toContain('Kaelen Vance');
    expect(msgs[0].content).toContain('VAULT CANON');
    expect(msgs[0].content).toContain('forging a defense');
    expect(msgs[0].content).not.toContain('Valerian metalworking');
    expect(groundUserMessageWithMentions('hello', [])).toBe('hello');
  });

  it('pins frontmatter status onto the current user turn', () => {
    const grounded = groundUserMessageWithMentions('How would Darian Holt react to the betrayal?', [
      {
        name: 'Darian Holt',
        type: 'npc',
        aliases: [],
        status: 'Captured, Tentative Ally',
        bodyExcerpt: 'A captured sergeant.',
      },
    ]);
    expect(grounded).toContain('CURRENT STATE');
    expect(grounded).toContain('Captured, Tentative Ally');
    expect(grounded).toMatch(/already true/i);
    expect(grounded).toMatch(/present tense/i);
  });
});
