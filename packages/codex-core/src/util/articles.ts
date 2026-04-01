/**
 * Leading articles stripped during name normalization.
 * Sorted longest-first so "an " is tried before "a ".
 */
const LEADING_ARTICLES = ['the ', 'an ', 'a '];

/**
 * Strip a leading English article ("the", "a", "an") from a
 * **lowercased** string. Only strips if something remains after removal.
 *
 *   stripLeadingArticle("the zenith guardian") → "zenith guardian"
 *   stripLeadingArticle("anthem")              → "anthem"   (no trailing space)
 *   stripLeadingArticle("a")                   → "a"        (nothing left)
 */
export function stripLeadingArticle(lowered: string): string {
  for (const article of LEADING_ARTICLES) {
    if (lowered.startsWith(article) && lowered.length > article.length) {
      return lowered.slice(article.length);
    }
  }
  return lowered;
}
