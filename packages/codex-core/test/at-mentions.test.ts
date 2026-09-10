import { describe, it, expect, beforeEach } from 'vitest';
import { EntityRegistry } from '../src/indexer/entity-registry';
import { ContextAssembler } from '../src/ai/context-assembler';
import { parseAtMentions, pickFollowTargets } from '../src/ai/at-mentions';
import { buildSystemPrompt } from '../src/ai/system-prompt';

describe('parseAtMentions', () => {
  it('splits @session from leftover finder text', () => {
    const parsed = parseAtMentions('@session How would Mira react to the betrayal?');
    expect(parsed.directives).toEqual(['@session']);
    expect(parsed.remainder).toBe('How would Mira react to the betrayal?');
  });

  it('keeps quoted names as entity pins', () => {
    const parsed = parseAtMentions('@"Kaelen Vance" what is he forging?');
    expect(parsed.directives).toEqual(['@Kaelen Vance']);
    expect(parsed.remainder).toBe('what is he forging?');
  });
});

describe('assembleForChat @ scoping', () => {
  let registry: EntityRegistry;
  let assembler: ContextAssembler;

  beforeEach(() => {
    registry = new EntityRegistry();
    assembler = new ContextAssembler(registry, {
      includeWorldEntities: true,
      linkExpansionDepth: 0,
    });
    registry.indexFile(
      'npcs/mira.md',
      `---
type: npc
name: "Mira the Scout"
---

A resourceful scout who survived the fall.
`,
    );
    registry.indexFile(
      'world/cosmos.md',
      `---
type: world
name: "Valerian Cosmology"
---

GM guide dump that should not appear for @session queries.
`,
    );
    registry.indexFile(
      'sessions/session-2.md',
      `---
type: session
name: "Session 2"
date: "2026-02-01"
---

Mira witnessed the betrayal in the marsh hall and did not speak.
The full session prose is longer than a hover preview would keep.
`,
    );
    registry.indexFile(
      'sessions/session-3.md',
      `---
type: session
name: "Session 3"
date: "2026-03-01"
---

Later events at the Solar Forge.
`,
    );
  });

  it('@session plus a name keeps Mira and sessions, not the world dump', () => {
    const { context, directives, remainder, seedPaths } = assembler.assembleForChat(
      '@session How would Mira react to the betrayal?',
    );
    expect(directives).toEqual(['@session']);
    expect(remainder).toContain('Mira');
    expect(context.entities.map(e => e.name)).toContain('Mira the Scout');
    expect(context.entities.map(e => e.name)).toContain('Session 2');
    expect(context.entities.map(e => e.name)).not.toContain('Valerian Cosmology');
    expect(context.worldRules).toHaveLength(0);
    expect(seedPaths[0]).toBe('npcs/mira.md');
  });

  it('picks Mira before sessions when following', () => {
    const { context, seedPaths } = assembler.assembleForChat(
      '@session How would Mira react to the betrayal?',
    );
    const targets = pickFollowTargets(context.entities, seedPaths, 2);
    expect(targets.map(t => t.name)[0]).toBe('Mira the Scout');
    expect(targets.some(t => t.type === 'session')).toBe(true);
  });

  it('follows Darian plus a session, not every Valerius homonym', () => {
    registry.indexFile(
      'npcs/darian.md',
      `---
type: npc
name: "Darian Holt"
status: "Captured, Tentative Ally"
---

A captured sergeant. Already allied with the party after seeing the Aegis Core.
`,
    );
    registry.indexFile(
      'npcs/valerius-dead.md',
      `---
type: npc
name: "Valerius"
status: dead
---

Ancient artificer, not the prince.
`,
    );
    registry.indexFile(
      'npcs/prince.md',
      `---
type: npc
name: "Prince Valerius Thorne"
---

Merchant lord who betrayed the party.
`,
    );
    registry.indexFile(
      'locations/spire.md',
      `---
type: location
name: "Valerius's Spire"
---

A glowing tower in the marsh.
`,
    );

    const { context, seedPaths } = assembler.assembleForChat(
      "@session How would Darian Holt react to Valerius's betrayal?",
    );
    const targets = pickFollowTargets(context.entities, seedPaths, 4);
    const names = targets.map(t => t.name);
    expect(names).toContain('Darian Holt');
    expect(names.some(n => n.startsWith('Session'))).toBe(true);
    expect(names).not.toContain('Valerius');
    expect(names).not.toContain("Valerius's Spire");
    expect(names.filter(n => /valerius/i.test(n)).length).toBeLessThanOrEqual(1);
  });

  it('flags a capitalized name that is not in the vault', () => {
    const { context } = assembler.assembleForChat(
      '@session How would Grok react to the betrayal?',
    );
    expect(context.unknownNames).toContain('Grok');
    const prompt = buildSystemPrompt(context, { ruleSystem: 'D&D 5e' });
    expect(prompt).toContain('Not in vault');
    expect(prompt).toContain('Grok');
  });

  it('puts followed bodies in the system prompt instead of the excerpt', () => {
    const ctx = assembler.assemble('Mira the Scout');
    ctx.followedNotes = [{
      name: 'Mira the Scout',
      filePath: 'npcs/mira.md',
      body: 'Mira witnessed the betrayal in the marsh hall and did not speak.',
    }];
    const prompt = buildSystemPrompt(ctx, { ruleSystem: 'D&D 5e' });
    expect(prompt).toContain('FULL NOTES');
    expect(prompt).toContain('marsh hall');
    expect(prompt).toContain('full note followed below');
  });

  it('@session follows the linked adventure instead of a second stale session', () => {
    registry.indexFile(
      'npcs/darian.md',
      `---
type: npc
name: "Darian Holt"
status: "Captured, Tentative Ally"
---

Already allied after seeing the Aegis Core.
`,
    );
    registry.indexFile(
      'adventures/lockdown.md',
      `---
type: adventure
name: "The Lockdown"
---

Darian is no longer a captive. He broke after seeing the Aegis Core.
`,
    );
    registry.indexFile(
      'adventures/thorne.md',
      `---
type: adventure
name: "The Thorne Inheritance"
---

Vault heist. Holt is still a bound prisoner in the prep notes.
`,
    );
    registry.indexFile(
      'sessions/session-5.md',
      `---
type: session
name: "Session 5"
date: ""
session_number: 5
---

GM prep for [[The Lockdown]]. The party has their captive bound.
`,
    );
    registry.indexFile(
      'sessions/session-4.md',
      `---
type: session
name: "Session 4"
session_number: 4
adventure: "[[The Thorne Inheritance]]"
---

Retrieve the Aegis Core.
`,
    );

    const { context, seedPaths } = assembler.assembleForChat(
      '@session How would Darian Holt react to the betrayal?',
    );
    const sessionNames = context.entities.filter(e => e.type === 'session').map(e => e.name);
    expect(sessionNames[0]).toBe('Session 5');
    expect(context.entities.map(e => e.name)).toContain('The Lockdown');

    const follow = pickFollowTargets(context.entities, seedPaths, 4).map(t => t.name);
    expect(follow).toContain('Darian Holt');
    expect(follow).toContain('The Lockdown');
    expect(follow).toContain('Session 5');
    expect(follow).not.toContain('Session 4');
    expect(follow).not.toContain('The Thorne Inheritance');
  });
});
