import type { Diagnostic, Entity } from '../types';
import type { EntityRegistry } from '../indexer/entity-registry';
import type { LinkResolver } from '../resolver/link-resolver';
import { extractLinksFromValue } from '../parser/link-extractor';

/**
 * Detect cross-file state contradictions in the campaign.
 */
export function detectStateConflicts(
  registry: EntityRegistry,
  resolver: LinkResolver,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  diagnostics.push(...detectDeadNpcPresent(registry, resolver));
  diagnostics.push(...detectItemHeldByDead(registry, resolver));
  diagnostics.push(...detectFactionLeaderMismatch(registry, resolver));

  return diagnostics;
}

/**
 * Rule: Dead NPC referenced as present in a session.
 * If an NPC has status "dead" but appears in a session's npcs_present, warn.
 */
function detectDeadNpcPresent(
  registry: EntityRegistry,
  resolver: LinkResolver,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const sessions = registry.getByType('session');

  const npcFieldNames = ['npcs_present', 'npcs', 'characters_present', 'characters'];

  for (const session of sessions) {
    const npcsPresent = npcFieldNames
      .map(f => session.frontmatter[f])
      .find(v => v != null);
    if (!npcsPresent) continue;

    const npcLinks = extractLinksFromValue(npcsPresent);
    for (const npcName of npcLinks) {
      const resolved = resolver.resolve(npcName);
      for (const npc of resolved) {
        if (npc.type !== 'npc') continue;
        const status = npc.frontmatter.status;
        if (typeof status === 'string' && status.toLowerCase() === 'dead') {
          const matchingLinks = session.links.filter(
            l => l.target.toLowerCase() === npcName.toLowerCase()
          );
          // Prefer body links so the decoration is visible in Live Preview
          // (frontmatter lines are hidden behind the Properties panel)
          const linkRef = matchingLinks.find(l => l.context === 'body')
            ?? matchingLinks[0];
          const col = linkRef?.column ?? 0;
          diagnostics.push({
            filePath: session.filePath,
            line: linkRef?.line ?? 1,
            column: col,
            endColumn: col + npcName.length + 4, // [[ + target + ]]
            severity: 'warning',
            message: `"${npc.name}" has status "dead" but is listed as present in this session.`,
            rule: 'state-conflict/dead-npc-present',
            relatedEntities: [npc.filePath],
          });
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Rule: Item held by a dead NPC.
 * If an item has held_by referencing an NPC with status "dead", warn.
 */
function detectItemHeldByDead(
  registry: EntityRegistry,
  resolver: LinkResolver,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const items = registry.getByType('item');
  const holderFields = ['held_by', 'owner', 'held_by_npc', 'carrier'];

  for (const item of items) {
    const heldByValue = holderFields
      .map(f => item.frontmatter[f])
      .find(v => v != null);
    if (!heldByValue) continue;

    const holderLinks = extractLinksFromValue(heldByValue);
    for (const holderName of holderLinks) {
      const resolved = resolver.resolve(holderName);
      for (const holder of resolved) {
        if (holder.type !== 'npc') continue;
        const status = holder.frontmatter.status;
        if (typeof status === 'string' && status.toLowerCase() === 'dead') {
          const matchingLinks = item.links.filter(
            l => l.target.toLowerCase() === holderName.toLowerCase()
          );
          const linkRef = matchingLinks.find(l => l.context === 'body')
            ?? matchingLinks[0];
          const col = linkRef?.column ?? 0;
          diagnostics.push({
            filePath: item.filePath,
            line: linkRef?.line ?? 1,
            column: col,
            endColumn: col + holderName.length + 4,
            severity: 'warning',
            message: `"${item.name}" is held by "${holder.name}" who has status "dead".`,
            rule: 'state-conflict/item-held-by-dead',
            relatedEntities: [holder.filePath],
          });
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Rule: Faction leader does not reference the faction.
 * If a faction lists a leader but the leader's NPC file doesn't reference
 * that faction, emit an informational hint.
 */
function detectFactionLeaderMismatch(
  registry: EntityRegistry,
  resolver: LinkResolver,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const factions = registry.getByType('faction');

  for (const faction of factions) {
    const leaderRef = faction.frontmatter.leader;
    if (!leaderRef) continue;

    const leaderLinks = extractLinksFromValue(leaderRef);
    for (const leaderName of leaderLinks) {
      const leaders = resolver.resolve(leaderName);
      for (const leader of leaders) {
        if (leader.type !== 'npc') continue;

        const npcFaction = leader.frontmatter.faction;
        if (!npcFaction) {
          diagnostics.push(buildFactionHint(faction, leader));
          continue;
        }

        const npcFactionLinks = extractLinksFromValue(npcFaction);
        const referencesFaction = npcFactionLinks.some(
          f => f.toLowerCase() === faction.name.toLowerCase()
        );

        if (!referencesFaction) {
          diagnostics.push(buildFactionHint(faction, leader));
        }
      }
    }
  }

  return diagnostics;
}

function buildFactionHint(faction: Entity, leader: Entity): Diagnostic {
  const linkRef = faction.links.find(
    l => l.target.toLowerCase() === leader.name.toLowerCase()
  );
  const col = linkRef?.column ?? 0;
  return {
    filePath: faction.filePath,
    line: linkRef?.line ?? 1,
    column: col,
    endColumn: col + leader.name.length + 4,
    severity: 'hint',
    message: `"${leader.name}" is listed as leader of "${faction.name}" but does not reference this faction.`,
    rule: 'state-conflict/faction-leader-mismatch',
    relatedEntities: [leader.filePath],
  };
}
