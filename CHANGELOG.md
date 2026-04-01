# Changelog

## 0.2.0 — 2026-03-31

Initial public release.

### Features

- **Entity indexing** — Automatically parses Markdown frontmatter to index NPCs, locations, items, factions, sessions, quests, and custom entity types across your vault.
- **Autocomplete** — Type `[[` to get contextual suggestions from your entity index. Filter by type with `[[npc:`, `[[location:`, etc.
- **Hover previews** — Hover over any `[[wiki-link]]` to see a quick summary of the linked entity's frontmatter and opening text.
- **Dead-link detection** — Inline underline decorations and gutter icons flag `[[links]]` that don't resolve to any file in the vault.
- **State conflict diagnostics** — Warns when your narrative has logical contradictions:
  - Dead NPC listed as present in a session
  - Item held by a dead NPC
  - Faction leader who doesn't reference their faction
- **Narrative Warnings panel** — A dedicated sidebar panel listing all detected issues. Click any warning to jump to the source file and line.
- **Gutter icons** — Warning and error icons in the editor gutter with tooltips describing each issue.
- **Create Entity** — Command palette action to create a new entity file from a template, pre-filled with the correct frontmatter type.
- **Rename Entity** — Rename an entity file and automatically update all `[[wiki-links]]` referencing it across the vault.
- **Re-index Vault** — Command to manually trigger a full re-index of all entities.
- **Configurable entity types** — Settings tab to customize recognized entity types and their associated frontmatter fields.
