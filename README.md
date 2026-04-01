# Codex Narrative Engine

An [Obsidian](https://obsidian.md) plugin that adds narrative intelligence to your TTRPG campaign vault. Codex indexes your world-building notes, surfaces broken links, detects logical contradictions in your story, and brings AI assistance directly into your creative workflow — so you can focus on running the game instead of auditing your lore.

## Features

### World Management

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

### AI-Powered Tools (Bring Your Own Key)

All AI features work with your own API key — no subscription required. Supports **Google Gemini**, **OpenAI**, **Anthropic (Claude)**, **Ollama**, **LM Studio**, and any **OpenAI-compatible** endpoint.

**Lore Chat** — A sidebar conversation panel grounded in your campaign. Ask questions about your world, generate new content, or brainstorm plot ideas. Codex automatically assembles relevant entities, sessions, and world rules as context so the AI stays consistent with your established lore.

**Save All as Notes** — When Lore Chat generates multiple entities in a single response, one click creates each as an individual note with proper frontmatter, filed into the correct folder.

**Edit & Regenerate** — Edit any previous prompt and re-send, or regenerate the last response with one click.

**AI: Enhance Note** — Expands a stub entity into a fully fleshed-out note, filling in missing sections while preserving your existing content and wiki-links.

**AI: Generate Entity** — Creates a new NPC, location, item, faction, creature, quest, or other entity from a short description, including frontmatter and (optionally) a Fantasy Statblocks-compatible stat block.

**AI: Describe Scene (Read-Aloud)** — Generates atmospheric read-aloud text for a location or session scene.

**AI: Extract Entities from Note** — Scans a session log or narrative note, identifies unnamed NPCs, locations, and items mentioned in the text, and creates individual entity files for each.

**AI: Revise Selection** — Select any text and give a natural-language instruction ("make it more dramatic", "add sensory details", "rewrite as bullet points"). The AI rewrites just that selection and presents a diff for review before applying.

**Diff review** — All AI edits go through a side-by-side diff review modal. Accept or reject changes before they touch your notes.

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
