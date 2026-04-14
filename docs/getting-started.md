# Getting Started

This guide walks you through installing Codex Narrative Engine, setting up your vault so the plugin can index it, and finding your way around the interface.

## Installation

### Via BRAT (recommended)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) installs plugins directly from GitHub and keeps them updated automatically.

1. Install **BRAT** from Settings > Community Plugins (search "BRAT").
2. Open **Settings > BRAT > Add Beta Plugin**.
3. Enter `jdicorpo/codex-narrative-engine` and click **Add Plugin**.
4. Enable **Codex Narrative Engine** in Settings > Community Plugins.

### From Obsidian Community Plugins (coming soon)

1. Open **Settings > Community Plugins** and make sure restricted mode is off.
2. Click **Browse** and search for **Codex Narrative Engine**.
3. Click **Install**, then **Enable**.

### Manual / Sideload

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/jdicorpo/codex-narrative-engine/releases/latest).
2. In your vault's `.obsidian/plugins/` folder, create a subfolder called `codex-narrative-engine`.
3. Copy the three downloaded files into that subfolder.
4. Open **Settings > Community Plugins**, click the refresh button, and enable **Codex Narrative Engine**.

> Codex is desktop-only (Windows, macOS, Linux). It does not run on Obsidian Mobile.

## What Happens on First Run

When you enable the plugin for the first time:

1. **Indexing** — Codex scans every markdown file in your vault looking for YAML frontmatter with a `type` field. Any file that has one becomes an indexed entity.
2. **Template creation** — A `_codex/templates/` folder is created in your vault with default templates for each entity type (npc, creature, location, etc.). These are used by the AI generation commands.
3. **Ribbon icons** — Two icons appear in Obsidian's left ribbon:
   - **Scroll** — opens the Narrative Warnings panel
   - **Chat bubble** — opens the Lore Chat panel

## Setting Up Your Vault

Codex recognizes entities by their YAML frontmatter. At minimum, each entity note needs a `type` field:

```yaml
---
type: npc
name: "Kira Ashwood"
status: alive
location: "[[Thornhaven]]"
faction: "[[The Silver Order]]"
tags: [ally, merchant]
---
```

### Supported Entity Types

The built-in types are:

| Type | Purpose |
|------|---------|
| `npc` | Non-player characters |
| `creature` | Monsters and beasts |
| `location` | Places, dungeons, regions |
| `faction` | Organizations, guilds, governments |
| `item` | Magic items, artifacts, equipment |
| `quest` | Active or completed quests |
| `adventure` | Multi-session adventure arcs |
| `session` | Session logs and recaps |
| `event` | Historical or plot events |
| `world` | Cosmology, pantheons, world rules (always included in AI context) |
| `rules` | House rules and rule references |
| `handout` | Player handouts and reference sheets |

You can add custom types in **Settings > Codex Narrative Engine > Entity types**.

### Folder Organization

When you create entities through Codex (via the command palette or AI generation), files are placed in a folder matching the type name:

| Type | Folder |
|------|--------|
| `npc` | `npcs/` |
| `creature` | `creatures/` |
| `location` | `locations/` |
| `faction` | `factions/` |
| `item` | `items/` |
| `quest` | `quests/` |
| `session` | `sessions/` |
| `adventure` | `adventures/` |
| `event` | `events/` |
| `world` | `world/` |

You don't have to follow this convention — Codex indexes by frontmatter, not folder structure. But the create/generate commands will use these folders by default.

### Frontmatter Fields

The only required field is `type`. Everything else is optional but useful:

- **`name`** — display name for the entity. If omitted, Codex uses the filename.
- **`aliases`** — alternative names the entity is known by. Codex uses these for link resolution and autocomplete.
- **`status`** — used by state conflict detection (e.g. `dead`, `alive`, `destroyed`, `active`).
- **`location`** — where the entity is. Use a wiki-link and quote it: `location: "[[Thornhaven]]"`.
- **`faction`** — faction membership. Same quoting rule for wiki-links.
- **`leader`** — for factions, links to the faction's leader.
- **`cr`** — challenge rating for creatures and combat NPCs.
- **`date`** — for sessions and events; used to sort recent sessions in AI context.
- **`tags`** — a YAML list for your own organization.

## Entity Templates

Codex stores entity templates in the `_codex/templates/` folder (configurable in settings). Each template is a markdown file named after its entity type (e.g., `npc.md`, `location.md`). Templates describe the sections and frontmatter fields that the AI should include when generating a new entity of that type.

You can edit these templates to match your campaign's needs. For example, if your NPCs always need a "Rumors" section, add it to `_codex/templates/npc.md`.

To restore the defaults, go to **Settings > Codex Narrative Engine > Entity templates > Reset templates**.

## Quick Orientation

### Ribbon Icons

| Icon | Action |
|------|--------|
| Scroll | Open the Narrative Warnings panel |
| Chat bubble | Open the Lore Chat panel |

### Command Palette

All Codex commands are available through the command palette (`Cmd/Ctrl + P`). They are prefixed with descriptive names:

- **Open narrative warnings**
- **Open lore chat**
- **Re-index vault**
- **Create entity**
- **Rename entity**
- **AI: enhance note**, **AI: generate entity**, **AI: describe scene**, **AI: extract entities**
- **Accept AI suggestions** / **Reject AI suggestions**

### Context Menus

Right-click in the editor to find:

- **Codex AI** submenu — with options for Revise selection, Generate entity, Enhance note, Describe scene, and Extract entities.
- **Rename** — appears when the current file is an indexed entity.

Right-click a file in the file explorer to find:

- **Codex: rename** — rename an entity and update all references.
- **Codex: extract entities** — scan the file for named entities.

## Next Steps

- [Features](features.md) — detailed walkthrough of every world-management feature
- [AI Guide](ai-guide.md) — set up an AI provider and learn each AI command
- [Settings Reference](settings.md) — every setting explained
- [Commands Reference](commands.md) — every command, hotkey, and context menu entry
