import { App, TFile } from 'obsidian';
import type { FollowedNote, VaultContext } from '@codex-ide/core';
import {
  FOLLOW_MAX_CHARS_EACH,
  FOLLOW_MAX_CHARS_TOTAL,
  pickFollowTargets,
} from '@codex-ide/core';
import type { FollowTarget } from '@codex-ide/core';

export function excludedFolderPrefixes(raw: string): string[] {
  return raw
    .split(',')
    .map(s => s.trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);
}

export function isExcludedPath(filePath: string, prefixes: string[]): boolean {
  const path = filePath.replace(/\\/g, '/');
  return prefixes.some(p => path === p || path.startsWith(p + '/'));
}

export async function readFollowedNotes(
  app: App,
  entities: FollowTarget[],
  seedPaths: string[],
  opts: {
    excludedFolders?: string;
    maxNotes?: number;
    maxCharsEach?: number;
    maxCharsTotal?: number;
  } = {},
): Promise<FollowedNote[]> {
  const maxCharsEach = opts.maxCharsEach ?? FOLLOW_MAX_CHARS_EACH;
  const maxCharsTotal = opts.maxCharsTotal ?? FOLLOW_MAX_CHARS_TOTAL;
  const excluded = excludedFolderPrefixes(opts.excludedFolders ?? '');
  const targets = pickFollowTargets(entities, seedPaths, opts.maxNotes).filter(
    t => !isExcludedPath(t.filePath, excluded),
  );

  const notes: FollowedNote[] = [];
  let total = 0;
  for (const t of targets) {
    if (total >= maxCharsTotal) break;
    const abstract = app.vault.getAbstractFileByPath(t.filePath);
    if (!(abstract instanceof TFile)) continue;
    let body = await app.vault.cachedRead(abstract);
    const budget = Math.min(maxCharsEach, maxCharsTotal - total);
    if (body.length > budget) {
      body = body.slice(0, budget).trimEnd() + '\n…';
    }
    notes.push({ name: t.name, filePath: t.filePath, body });
    total += body.length;
  }
  return notes;
}

export async function followContext(
  app: App,
  context: VaultContext,
  seedPaths: string[],
  excludedFolders: string,
): Promise<VaultContext> {
  const followed = await readFollowedNotes(app, context.entities, seedPaths, {
    excludedFolders,
  });
  if (followed.length === 0) return context;
  return { ...context, followedNotes: followed };
}
