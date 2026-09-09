import type { EntitySummary, VaultContext } from './types';

/**
 * Prefer Cloud RAG hits first, then fill remaining slots from local context
 * without duplicate file paths.
 */
export function mergeVaultContextWithCloudHits(
  local: VaultContext,
  cloudHits: EntitySummary[],
  maxTotal = 60,
): VaultContext {
  const seen = new Set<string>();
  const out: EntitySummary[] = [];
  for (const e of cloudHits) {
    if (seen.has(e.filePath)) continue;
    seen.add(e.filePath);
    out.push(e);
    if (out.length >= maxTotal) {
      return { ...local, entities: out, totalEntityCount: local.totalEntityCount };
    }
  }
  for (const e of local.entities) {
    if (out.length >= maxTotal) break;
    if (seen.has(e.filePath)) continue;
    seen.add(e.filePath);
    out.push(e);
  }
  return { ...local, entities: out, totalEntityCount: local.totalEntityCount };
}
