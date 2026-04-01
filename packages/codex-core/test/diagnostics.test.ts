import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EntityRegistry } from '../src/indexer/entity-registry';
import { DiagnosticEngine } from '../src/diagnostics/diagnostic-engine';

const FIXTURES = join(__dirname, 'fixtures', 'sample-vault');

function readFixture(relativePath: string): string {
  return readFileSync(join(FIXTURES, relativePath), 'utf-8');
}

function indexFullVault(registry: EntityRegistry): void {
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
}

describe('DiagnosticEngine', () => {
  let registry: EntityRegistry;
  let engine: DiagnosticEngine;

  beforeEach(() => {
    registry = new EntityRegistry();
    engine = new DiagnosticEngine(registry);
    indexFullVault(registry);
  });

  describe('dead-link detection', () => {
    it('detects [[Nonexistent Castle]] as a dead link', () => {
      const diagnostics = engine.diagnoseAll();
      const deadLinks = diagnostics.filter(d => d.rule === 'dead-link');

      const nonexistent = deadLinks.filter(d =>
        d.message.includes('Nonexistent Castle')
      );
      expect(nonexistent.length).toBeGreaterThan(0);
      expect(nonexistent[0].severity).toBe('warning');
    });

    it('does not flag valid links as dead', () => {
      const diagnostics = engine.diagnoseAll();
      const deadLinks = diagnostics.filter(d => d.rule === 'dead-link');

      const falsePositives = deadLinks.filter(d =>
        d.message.includes('Lord Varos') ||
        d.message.includes('Ironhold') ||
        d.message.includes('Mira the Scout')
      );
      expect(falsePositives).toHaveLength(0);
    });
  });

  describe('state conflict: dead NPC present', () => {
    it('flags Lord Varos as dead but present in session-12', () => {
      const diagnostics = engine.diagnoseAll();
      const deadNpc = diagnostics.filter(d =>
        d.rule === 'state-conflict/dead-npc-present'
      );

      expect(deadNpc.length).toBeGreaterThan(0);
      const varosWarning = deadNpc.find(d =>
        d.message.includes('Lord Varos') && d.message.includes('dead')
      );
      expect(varosWarning).toBeDefined();
      expect(varosWarning!.filePath).toBe('sessions/session-12.md');
      expect(varosWarning!.severity).toBe('warning');
    });

    it('does not flag alive NPCs', () => {
      const diagnostics = engine.diagnoseAll();
      const deadNpc = diagnostics.filter(d =>
        d.rule === 'state-conflict/dead-npc-present'
      );

      const miraWarning = deadNpc.find(d =>
        d.message.includes('Mira the Scout')
      );
      expect(miraWarning).toBeUndefined();
    });
  });

  describe('state conflict: item held by dead NPC', () => {
    it('flags Blade of the First King as held by dead Lord Varos', () => {
      const diagnostics = engine.diagnoseAll();
      const itemDead = diagnostics.filter(d =>
        d.rule === 'state-conflict/item-held-by-dead'
      );

      expect(itemDead.length).toBeGreaterThan(0);
      const bladeWarning = itemDead.find(d =>
        d.message.includes('Blade of the First King') && d.message.includes('dead')
      );
      expect(bladeWarning).toBeDefined();
      expect(bladeWarning!.filePath).toBe('items/blade-of-first-king.md');
      expect(bladeWarning!.severity).toBe('warning');
    });
  });

  describe('state conflict: faction leader mismatch', () => {
    it('detects that Lord Varos is leader of Silver Order', () => {
      const diagnostics = engine.diagnoseAll();
      const mismatches = diagnostics.filter(d =>
        d.rule === 'state-conflict/faction-leader-mismatch'
      );

      // Lord Varos DOES reference The Silver Order in his faction field,
      // so this should NOT trigger a mismatch
      const varosMismatch = mismatches.find(d =>
        d.message.includes('Lord Varos') && d.message.includes('Silver Order')
      );
      expect(varosMismatch).toBeUndefined();
    });
  });

  describe('diagnoseFile', () => {
    it('returns only diagnostics for the specified file', () => {
      const sessionDiags = engine.diagnoseFile('sessions/session-12.md');
      expect(sessionDiags.length).toBeGreaterThan(0);
      expect(sessionDiags.every(d => d.filePath === 'sessions/session-12.md')).toBe(true);
    });

    it('returns empty array for clean files', () => {
      const cleanDiags = engine.diagnoseFile('npcs/mira-the-scout.md');
      expect(cleanDiags).toHaveLength(0);
    });
  });
});
