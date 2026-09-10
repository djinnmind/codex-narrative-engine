import { describe, it, expect } from 'vitest';
import { extractWikiLinkTargets, matchRecipeIntent } from '../src/ai/recipe-intent';

describe('matchRecipeIntent', () => {
  it('matches explicit @recipe and @skill tokens', () => {
    expect(matchRecipeIntent('@npc-at-location at [[Blackmoss Landing]]')).toEqual({
      id: 'npc-at-location',
      explicit: true,
    });
    expect(matchRecipeIntent('@recipe npc-at-location')).toEqual({
      id: 'npc-at-location',
      explicit: true,
    });
    expect(matchRecipeIntent('@recipe advance-plots from last session')).toEqual({
      id: 'advance-plots',
      explicit: true,
    });
    expect(matchRecipeIntent('@recipe')).toBeNull();
    expect(matchRecipeIntent('@recipe unknown-skill')).toBeNull();
  });

  it('matches implicit recipe phrasing', () => {
    expect(matchRecipeIntent(
      'Create an NPC at [[Blackmoss Landing]] and wire them into [[The Lockdown]] and [[The Sunken Spire\'s Heartbeat]]',
    )?.id).toBe('npc-at-location');
    expect(matchRecipeIntent('Advance the plots from last session')?.id).toBe('advance-plots');
    expect(matchRecipeIntent(
      'Add an arc based on [[Session 5]] involving [[Elara Vance]]',
    )?.id).toBe('add-arc');
    expect(matchRecipeIntent('@add-arc from [[Session 5]]')).toEqual({
      id: 'add-arc',
      explicit: true,
    });
    expect(matchRecipeIntent('@add-location near [[Blackmoss Landing]]')).toEqual({
      id: 'add-location',
      explicit: true,
    });
    expect(matchRecipeIntent(
      'Add a location near [[Blackmoss Landing]] based on [[Session 5]]',
    )?.id).toBe('add-location');
    expect(matchRecipeIntent('@recipe add-location')).toEqual({
      id: 'add-location',
      explicit: true,
    });
  });

  it('does not steal ordinary lore questions', () => {
    expect(matchRecipeIntent('@session How would Darian Holt react to Valerius\'s betrayal?')).toBeNull();
    expect(matchRecipeIntent('Generate a shopkeeper NPC for the market district')).toBeNull();
    expect(matchRecipeIntent('What plot hooks are still unresolved?')).toBeNull();
    expect(matchRecipeIntent('Where is this location?')).toBeNull();
    expect(matchRecipeIntent('Tell me about the location of the archive')).toBeNull();
  });
});

describe('extractWikiLinkTargets', () => {
  it('returns exact wiki-link names only', () => {
    expect(extractWikiLinkTargets(
      'Create an NPC at [[Oakhaven]] and wire them into [[The Thorne Inheritance]].',
    )).toEqual(['Oakhaven', 'The Thorne Inheritance']);
  });
});
