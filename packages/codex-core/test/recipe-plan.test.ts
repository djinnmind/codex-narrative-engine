import { describe, it, expect } from 'vitest';
import { parseRecipePlan, sanitizeRecipePath } from '../src/ai/recipe-plan';

describe('sanitizeRecipePath', () => {
  it('accepts vault-relative markdown paths', () => {
    expect(sanitizeRecipePath('npcs/Darian Holt.md')).toBe('npcs/Darian Holt.md');
    expect(sanitizeRecipePath('/adventures/The Lockdown.md')).toBe('adventures/The Lockdown.md');
  });

  it('rejects traversal and non-markdown', () => {
    expect(sanitizeRecipePath('../secrets.md')).toBeNull();
    expect(sanitizeRecipePath('npcs/foo.txt')).toBeNull();
    expect(sanitizeRecipePath('')).toBeNull();
  });
});

describe('parseRecipePlan', () => {
  it('parses a fenced plan and drops duplicate paths', () => {
    const plan = parseRecipePlan(`\`\`\`json
{
  "title": "Wire Mira into two plots",
  "steps": [
    { "path": "npcs/Mira.md", "action": "create", "summary": "New scout at the docks" },
    { "path": "locations/Blackmoss Landing.md", "action": "patch", "summary": "Link Mira" },
    { "path": "npcs/Mira.md", "action": "patch", "summary": "duplicate" }
  ]
}
\`\`\``);
    expect(plan.title).toBe('Wire Mira into two plots');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]).toEqual({
      path: 'npcs/Mira.md',
      action: 'create',
      summary: 'New scout at the docks',
    });
  });

  it('throws when nothing valid remains', () => {
    expect(() => parseRecipePlan('{ "title": "x", "steps": [{ "path": "../x.md", "action": "create", "summary": "no" }] }'))
      .toThrow(/no valid steps/i);
  });
});
