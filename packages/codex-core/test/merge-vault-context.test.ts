import { describe, it, expect } from 'vitest';
import { mergeVaultContextWithCloudHits } from '../src/ai/merge-vault-context';
import type { VaultContext, EntitySummary } from '../src/ai/types';

const baseEntity = (name: string, path: string): EntitySummary => ({
  name,
  type: 'npc',
  filePath: path,
  aliases: [],
  frontmatter: {},
  bodyPreview: 'x',
  bodyExcerpt: 'x',
  linkedEntityNames: [],
});

describe('mergeVaultContextWithCloudHits', () => {
  const local: VaultContext = {
    entities: [baseEntity('LocalOnly', 'a.md'), baseEntity('Shared', 'b.md')],
    recentSessions: [],
    worldRules: [],
    totalEntityCount: 10,
  };

  it('prefers cloud ordering and dedupes by filePath', () => {
    const cloud: EntitySummary[] = [
      baseEntity('CloudFirst', 'c.md'),
      baseEntity('Shared', 'b.md'),
    ];
    const merged = mergeVaultContextWithCloudHits(local, cloud, 10);
    expect(merged.entities.map(e => e.filePath)).toEqual(['c.md', 'b.md', 'a.md']);
  });

  it('respects maxTotal', () => {
    const cloud = [baseEntity('C1', '1.md'), baseEntity('C2', '2.md')];
    const merged = mergeVaultContextWithCloudHits(local, cloud, 2);
    expect(merged.entities).toHaveLength(2);
  });
});
