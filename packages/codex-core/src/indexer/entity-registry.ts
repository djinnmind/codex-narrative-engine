import Fuse from 'fuse.js';
import type { Entity, EntityType, LinkReference } from '../types';
import { parseFrontmatter, bodyPreview } from '../parser/frontmatter';
import { extractLinks } from '../parser/link-extractor';
import { extractStatblocks } from '../parser/statblock-parser';
import { stripLeadingArticle } from '../util/articles';

export class EntityRegistry {
  private byPath = new Map<string, Entity>();
  private byName = new Map<string, Entity[]>();
  private byAlias = new Map<string, Entity[]>();
  private byType = new Map<EntityType, Entity[]>();
  private allLinks: LinkReference[] = [];
  private fuse: Fuse<Entity> | null = null;
  private fuseDirty = true;
  private customTypes: string[] = [];

  setCustomTypes(types: string[]): void {
    this.customTypes = types;
  }

  getCustomTypes(): string[] {
    return this.customTypes;
  }

  /**
   * Index a single file. Replaces any previous entry at the same path.
   * Returns the entity if the file has recognized frontmatter, null otherwise.
   */
  indexFile(filePath: string, content: string): Entity | null {
    this.removeFile(filePath);

    const parsed = parseFrontmatter(content, filePath, this.customTypes);
    if (!parsed) {
      // Still extract links from non-entity files for dead-link checking
      const links = extractLinks(content, filePath, 1);
      if (links.length > 0) {
        this.allLinks.push(...links);
      }
      return null;
    }

    const links = extractLinks(content, filePath, parsed.bodyStartLine);

    const rawAliases = parsed.frontmatter.aliases;
    const aliases: string[] = Array.isArray(rawAliases)
      ? rawAliases.filter((a): a is string => typeof a === 'string')
      : [];

    const statblocks = extractStatblocks(content);
    const statblock = statblocks.length > 0 ? statblocks[0] : undefined;

    const entity: Entity = {
      filePath,
      name: parsed.name,
      aliases,
      type: parsed.type,
      frontmatter: parsed.frontmatter,
      links,
      bodyPreview: bodyPreview(parsed.bodyContent),
      statblock,
    };

    this.byPath.set(filePath, entity);

    const nameKey = this.normalizeKey(entity.name);
    const nameEntries = this.byName.get(nameKey) ?? [];
    nameEntries.push(entity);
    this.byName.set(nameKey, nameEntries);

    for (const alias of aliases) {
      const aliasKey = this.normalizeKey(alias);
      const aliasEntries = this.byAlias.get(aliasKey) ?? [];
      aliasEntries.push(entity);
      this.byAlias.set(aliasKey, aliasEntries);
    }

    const typeEntries = this.byType.get(entity.type) ?? [];
    typeEntries.push(entity);
    this.byType.set(entity.type, typeEntries);

    this.allLinks.push(...links);
    this.fuseDirty = true;

    return entity;
  }

  /**
   * Remove a file from the index.
   */
  removeFile(filePath: string): void {
    const existing = this.byPath.get(filePath);
    if (existing) {
      this.byPath.delete(filePath);

      const nameKey = this.normalizeKey(existing.name);
      const nameEntries = this.byName.get(nameKey);
      if (nameEntries) {
        const filtered = nameEntries.filter(e => e.filePath !== filePath);
        if (filtered.length > 0) {
          this.byName.set(nameKey, filtered);
        } else {
          this.byName.delete(nameKey);
        }
      }

      for (const alias of existing.aliases) {
        const aliasKey = this.normalizeKey(alias);
        const aliasEntries = this.byAlias.get(aliasKey);
        if (aliasEntries) {
          const filtered = aliasEntries.filter(e => e.filePath !== filePath);
          if (filtered.length > 0) {
            this.byAlias.set(aliasKey, filtered);
          } else {
            this.byAlias.delete(aliasKey);
          }
        }
      }

      const typeEntries = this.byType.get(existing.type);
      if (typeEntries) {
        const filtered = typeEntries.filter(e => e.filePath !== filePath);
        if (filtered.length > 0) {
          this.byType.set(existing.type, filtered);
        } else {
          this.byType.delete(existing.type);
        }
      }
    }

    this.allLinks = this.allLinks.filter(l => l.sourcePath !== filePath);
    this.fuseDirty = true;
  }

  getByPath(filePath: string): Entity | undefined {
    return this.byPath.get(filePath);
  }

  getByName(name: string): Entity[] {
    const key = this.normalizeKey(name);
    const byName = this.byName.get(key) ?? [];
    if (byName.length > 0) return byName;
    return this.byAlias.get(key) ?? [];
  }

  private normalizeKey(str: string): string {
    const lowered = str
      .toLowerCase()
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
    return stripLeadingArticle(lowered);
  }

  getByType(type: EntityType): Entity[] {
    return this.byType.get(type) ?? [];
  }

  getAllEntities(): Entity[] {
    return Array.from(this.byPath.values());
  }

  getAllLinks(): LinkReference[] {
    return this.allLinks;
  }

  /**
   * Find all links that target a given entity name.
   */
  findReferences(entityName: string): LinkReference[] {
    const key = this.normalizeKey(entityName);
    return this.allLinks.filter(l => this.normalizeKey(l.target) === key);
  }

  /**
   * Find links originating from a specific file.
   */
  getLinksFromFile(filePath: string): LinkReference[] {
    return this.allLinks.filter(l => l.sourcePath === filePath);
  }

  /**
   * Fuzzy search for autocomplete. Returns entities matching the partial string,
   * optionally filtered by type.
   */
  suggest(partial: string, typeFilter?: EntityType): Entity[] {
    let candidates = this.getAllEntities();
    if (typeFilter) {
      candidates = candidates.filter(e => e.type === typeFilter);
    }

    if (partial.length === 0) {
      return candidates.slice(0, 50);
    }

    const lower = partial.toLowerCase();

    // Fuse.js fuzzy search (rebuilt when index changes)
    if (this.fuseDirty || !this.fuse) {
      this.fuse = new Fuse(this.getAllEntities(), {
        keys: ['name', 'aliases'],
        threshold: 0.4,
        includeScore: true,
      });
      this.fuseDirty = false;
    }

    const fuseResults = this.fuse.search(partial);
    let results = typeFilter
      ? fuseResults.filter(r => r.item.type === typeFilter).map(r => r.item)
      : fuseResults.map(r => r.item);

    // Fallback: if Fuse returned nothing, do a simple substring match on candidates
    if (results.length === 0) {
      results = candidates.filter(e =>
        e.name.toLowerCase().includes(lower) ||
        e.aliases.some(a => a.toLowerCase().includes(lower))
      );
    }

    return results.slice(0, 50);
  }

  get size(): number {
    return this.byPath.size;
  }

  clear(): void {
    this.byPath.clear();
    this.byName.clear();
    this.byAlias.clear();
    this.byType.clear();
    this.allLinks = [];
    this.fuse = null;
    this.fuseDirty = true;
  }
}
