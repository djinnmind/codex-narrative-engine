import type { Entity } from '../types';
import type { EntityRegistry } from '../indexer/entity-registry';
import { pluralVariants } from '../util/plurals';
import { stripLeadingArticle } from '../util/articles';

export class LinkResolver {
  constructor(private registry: EntityRegistry) {}

  /**
   * Resolve a wiki-link target string to zero or more entities.
   *
   * Resolution priority:
   * 1. Exact frontmatter `name` match (case-insensitive)
   * 2. Filename match (with or without extension, kebab/snake → space normalization)
   * 3. Path match (e.g., "npcs/varos" → "npcs/varos.md")
   */
  resolve(linkText: string): Entity[] {
    if (!linkText || linkText.trim().length === 0) return [];

    const normalized = this.normalizeQuotes(linkText.trim());

    // 1. Exact name match
    const byName = this.registry.getByName(normalized);
    if (byName.length > 0) return byName;

    // 2. Filename match — normalize separators and compare
    const fileNormalized = this.normalizeForFilename(normalized);
    const allEntities = this.registry.getAllEntities();
    const byFilename = allEntities.filter(e => {
      const entityFilename = this.extractFilename(e.filePath);
      return this.normalizeForFilename(entityFilename) === fileNormalized;
    });
    if (byFilename.length > 0) return byFilename;

    // 3. Path match — treat linkText as a relative path
    const pathTarget = normalized.endsWith('.md') ? normalized : normalized + '.md';
    const byPath = this.registry.getByPath(pathTarget);
    if (byPath) return [byPath];

    // Also try with forward-slash normalization
    const byPathNormalized = this.registry.getByPath(
      pathTarget.replace(/\\/g, '/')
    );
    if (byPathNormalized) return [byPathNormalized];

    // 4. Plural/singular fallback — try alternate forms before giving up
    for (const variant of pluralVariants(normalized)) {
      const byVariant = this.registry.getByName(variant);
      if (byVariant.length > 0) return byVariant;
    }

    return [];
  }

  /**
   * Check if a link target resolves to at least one entity.
   */
  isResolvable(linkText: string): boolean {
    return this.resolve(linkText).length > 0;
  }

  private normalizeQuotes(str: string): string {
    return str
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
  }

  private normalizeForFilename(str: string): string {
    const base = this.normalizeQuotes(str)
      .toLowerCase()
      .replace(/\.md$/i, '')
      .replace(/[-_]/g, ' ')
      .trim();
    return stripLeadingArticle(base);
  }

  private extractFilename(filePath: string): string {
    const parts = filePath.split('/');
    return parts[parts.length - 1].replace(/\.md$/i, '');
  }

}
