import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EntityRegistry } from '../src/indexer/entity-registry';

const FIXTURES = join(__dirname, 'fixtures', 'sample-vault');

function readFixture(relativePath: string): string {
  return readFileSync(join(FIXTURES, relativePath), 'utf-8');
}

describe('EntityRegistry', () => {
  let registry: EntityRegistry;

  beforeEach(() => {
    registry = new EntityRegistry();
  });

  it('indexes a file with valid frontmatter', () => {
    const content = readFixture('npcs/lord-varos.md');
    const entity = registry.indexFile('npcs/lord-varos.md', content);

    expect(entity).not.toBeNull();
    expect(entity!.name).toBe('Lord Varos');
    expect(entity!.type).toBe('npc');
    expect(entity!.frontmatter.status).toBe('dead');
  });

  it('returns null for files without a type field', () => {
    const content = '# Just a plain note\n\nNo frontmatter here.';
    const entity = registry.indexFile('notes/random.md', content);

    expect(entity).toBeNull();
  });

  it('indexes files with unrecognized types as custom', () => {
    const content = '---\ntype: deity\nname: "Solara"\n---\nGoddess of the sun.';
    const entity = registry.indexFile('deities/solara.md', content);

    expect(entity).not.toBeNull();
    expect(entity!.type).toBe('custom');
  });

  it('extracts wiki-links from body content', () => {
    const content = readFixture('npcs/lord-varos.md');
    registry.indexFile('npcs/lord-varos.md', content);

    const entity = registry.getByPath('npcs/lord-varos.md');
    expect(entity).toBeDefined();
    const linkTargets = entity!.links.map(l => l.target);
    expect(linkTargets).toContain('Blade of the First King');
  });

  it('extracts wiki-links from frontmatter values', () => {
    const content = readFixture('npcs/lord-varos.md');
    registry.indexFile('npcs/lord-varos.md', content);

    const entity = registry.getByPath('npcs/lord-varos.md');
    const fmLinks = entity!.links.filter(l => l.context === 'frontmatter');
    const fmTargets = fmLinks.map(l => l.target);
    expect(fmTargets).toContain('Ironhold');
    expect(fmTargets).toContain('The Silver Order');
  });

  it('looks up entities by name (case-insensitive)', () => {
    const content = readFixture('npcs/lord-varos.md');
    registry.indexFile('npcs/lord-varos.md', content);

    expect(registry.getByName('Lord Varos')).toHaveLength(1);
    expect(registry.getByName('lord varos')).toHaveLength(1);
    expect(registry.getByName('LORD VAROS')).toHaveLength(1);
  });

  it('looks up entities by type', () => {
    registry.indexFile('npcs/lord-varos.md', readFixture('npcs/lord-varos.md'));
    registry.indexFile('npcs/mira-the-scout.md', readFixture('npcs/mira-the-scout.md'));
    registry.indexFile('locations/ironhold.md', readFixture('locations/ironhold.md'));

    expect(registry.getByType('npc')).toHaveLength(2);
    expect(registry.getByType('location')).toHaveLength(1);
  });

  it('removes a file and cleans up all indexes', () => {
    registry.indexFile('npcs/lord-varos.md', readFixture('npcs/lord-varos.md'));
    expect(registry.size).toBe(1);

    registry.removeFile('npcs/lord-varos.md');
    expect(registry.size).toBe(0);
    expect(registry.getByName('Lord Varos')).toHaveLength(0);
    expect(registry.getByType('npc')).toHaveLength(0);
  });

  it('re-indexes a file when content changes', () => {
    registry.indexFile('npcs/lord-varos.md', readFixture('npcs/lord-varos.md'));
    expect(registry.getByPath('npcs/lord-varos.md')!.frontmatter.status).toBe('dead');

    const updated = readFixture('npcs/lord-varos.md').replace('status: dead', 'status: alive');
    registry.indexFile('npcs/lord-varos.md', updated);

    expect(registry.size).toBe(1);
    expect(registry.getByPath('npcs/lord-varos.md')!.frontmatter.status).toBe('alive');
  });

  it('indexes the full sample vault', () => {
    const files = [
      'world/setting.md',
      'npcs/lord-varos.md', 'npcs/mira-the-scout.md', 'npcs/the-stranger.md',
      'locations/ironhold.md', 'locations/the-undercrypt.md', 'locations/northern-reaches.md',
      'factions/silver-order.md', 'factions/shadow-court.md',
      'items/blade-of-first-king.md',
      'sessions/session-01.md', 'sessions/session-12.md', 'sessions/session-13-prep.md',
      'quests/find-the-blade.md',
    ];

    for (const file of files) {
      registry.indexFile(file, readFixture(file));
    }

    expect(registry.size).toBe(14);
    expect(registry.getByType('npc')).toHaveLength(3);
    expect(registry.getByType('location')).toHaveLength(3);
    expect(registry.getByType('faction')).toHaveLength(2);
    expect(registry.getByType('session')).toHaveLength(3);
  });

  it('provides fuzzy autocomplete suggestions', () => {
    registry.indexFile('npcs/lord-varos.md', readFixture('npcs/lord-varos.md'));
    registry.indexFile('npcs/mira-the-scout.md', readFixture('npcs/mira-the-scout.md'));
    registry.indexFile('locations/ironhold.md', readFixture('locations/ironhold.md'));

    const results = registry.suggest('Var');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('Lord Varos');
  });
});
