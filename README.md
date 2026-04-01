# Codex Narrative Engine

An [Obsidian](https://obsidian.md) plugin that adds narrative intelligence to your TTRPG campaign vault. Codex indexes your world-building notes, surfaces broken links, and detects logical contradictions in your story — so you can focus on running the game instead of auditing your lore.

## Features

**Entity indexing** — Codex reads frontmatter (`type: npc`, `type: location`, etc.) to build a live index of every entity in your vault.

**Smart autocomplete** — Type `[[` to search your entity index. Filter by type with `[[npc:`, `[[location:`, `[[item:`, and more.

**Hover previews** — Hover any `[[wiki-link]]` to see a quick summary pulled from the entity's frontmatter and opening text.

**Dead-link detection** — Links that don't resolve to a file are underlined in the editor and flagged with a gutter icon.

**State conflict warnings** — Codex catches logical contradictions in your narrative:
- A dead NPC listed as present in a session
- An item held by a dead NPC
- A faction leader who doesn't reference their faction

**Narrative Warnings panel** — A sidebar panel listing every detected issue. Click a warning to jump straight to the source.

**Create & rename entities** — Create new entity files from templates, or rename an entity and have all references updated automatically.

## Installation

### From Obsidian Community Plugins (coming soon)

1. Open **Settings > Community Plugins**
2. Search for **Codex Narrative Engine**
3. Click **Install**, then **Enable**

### Manual / Sideload

1. Download `main.js`, `manifest.json`, and (if present) `styles.css` from the [latest release](https://github.com/jdicorpo/codex-narrative-engine/releases/latest).
2. Create a folder in your vault: `.obsidian/plugins/codex-narrative-engine/`
3. Copy the downloaded files into that folder.
4. Open **Settings > Community Plugins**, refresh the list, and enable **Codex Narrative Engine**.

## Building from Source

Requires [Node.js](https://nodejs.org) 18+.

```bash
git clone https://github.com/jdicorpo/codex-narrative-engine.git
cd codex-narrative-engine
npm install
npm run build
```

The built plugin files will be at `packages/codex-obsidian/main.js` and `packages/codex-obsidian/manifest.json`.

To develop with hot-reload:

```bash
npm run dev
```

## Running Tests

```bash
npm test
```

Runs the `codex-core` unit test suite (entity indexing, link resolution, diagnostic rules).

## Project Structure

```
packages/
  codex-core/       Editor-agnostic narrative engine (indexing, diagnostics, link resolution)
  codex-obsidian/   Obsidian plugin (UI, commands, vault integration)
```

`codex-core` has no dependency on Obsidian and can be reused in other editors.

## License

[MIT](LICENSE)
