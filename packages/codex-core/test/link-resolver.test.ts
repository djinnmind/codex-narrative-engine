import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EntityRegistry } from '../src/indexer/entity-registry';
import { LinkResolver } from '../src/resolver/link-resolver';

const FIXTURES = join(__dirname, 'fixtures', 'sample-vault');

function readFixture(relativePath: string): string {
  return readFileSync(join(FIXTURES, relativePath), 'utf-8');
}

describe('LinkResolver', () => {
  let registry: EntityRegistry;
  let resolver: LinkResolver;

  beforeEach(() => {
    registry = new EntityRegistry();
    resolver = new LinkResolver(registry);

    const files = [
      'npcs/lord-varos.md', 'npcs/mira-the-scout.md',
      'locations/ironhold.md',
      'factions/silver-order.md',
      'items/blade-of-first-king.md',
    ];
    for (const file of files) {
      registry.indexFile(file, readFixture(file));
    }
  });

  it('resolves by exact frontmatter name', () => {
    const results = resolver.resolve('Lord Varos');
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('npcs/lord-varos.md');
  });

  it('resolves case-insensitively', () => {
    const results = resolver.resolve('lord varos');
    expect(results).toHaveLength(1);
  });

  it('resolves by filename when name differs', () => {
    // "silver-order" as filename should resolve even if name is "The Silver Order"
    const results = resolver.resolve('silver-order');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('The Silver Order');
  });

  it('resolves by path', () => {
    const results = resolver.resolve('npcs/lord-varos');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Lord Varos');
  });

  it('returns empty array for non-existent links', () => {
    const results = resolver.resolve('Nonexistent Castle');
    expect(results).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(resolver.resolve('')).toHaveLength(0);
    expect(resolver.resolve('   ')).toHaveLength(0);
  });

  it('reports resolvability correctly', () => {
    expect(resolver.isResolvable('Lord Varos')).toBe(true);
    expect(resolver.isResolvable('Nonexistent')).toBe(false);
  });
});
