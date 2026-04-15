# Features

This page covers Codex Narrative Engine's world-management features in detail. For AI-powered features, see the [AI Guide](ai-guide.md).

## Entity Indexing

Codex builds a live index of every markdown file in your vault that has a `type` field in its YAML frontmatter. The index powers autocomplete, hover previews, link resolution, diagnostics, and AI context assembly.

### What Gets Indexed

For each entity, Codex reads:

- **Frontmatter fields** — `type`, `name`, `aliases`, `status`, `location`, `faction`, `leader`, `cr`, `date`, `tags`, and any other fields you add.
- **Wiki-links** — every `[[link]]` in the body and frontmatter, along with its position.
- **Body preview** — the first portion of the note's body text, used for hover previews and AI context.
- **Statblock** — if a ```` ```statblock ```` code block exists, its structured data is parsed and stored.

### When Indexing Happens

- **On startup** — a full vault scan runs when Obsidian finishes loading.
- **On file changes** — when you create, modify, rename, or delete a markdown file, the index updates incrementally.
- **Manual re-index** — use the **Re-index vault** command or the button in Settings > Maintenance to force a full rebuild.

### Ignored Folders

Folders listed in **Settings > Ignored folders** are excluded from indexing entirely. By default this is `.trash`. Separate multiple folders with commas.

## Smart Autocomplete

Codex replaces Obsidian's built-in link suggest with an enhanced version that searches the entity index.

### Basic Usage

Type `[[` to open the suggest dropdown. As you type, results are filtered by entity name and aliases.

### Type Filtering

Add a type prefix followed by a colon to filter by entity type:

- `[[npc:` — show only NPCs
- `[[location:` — show only locations
- `[[item:sword` — show items matching "sword"

The type prefix is stripped from the final link — `[[npc:Kira` inserts `[[Kira Ashwood]]`.

### What's Shown

Each suggestion displays:

- The entity name
- The entity type as a badge
- A snippet of the body preview

## Hover Previews

Hover over any `[[wiki-link]]` in the editor (Live Preview, Source, or Reading mode) to see a tooltip with:

- The entity's name and type
- Key frontmatter fields (status, location, faction, etc.)
- The first few lines of the note body

This works via a global hover handler that covers all editing and reading modes.

## Dead-Link Detection

A dead link is a `[[wiki-link]]` that doesn't resolve to any file in the vault. Codex surfaces these in three places:

### Editor Decorations

In Live Preview and Source mode, dead links are styled with a dashed red underline so they stand out from valid links.

### Gutter Icons

When **Settings > Gutter icons** is enabled, a warning icon appears in the editor gutter on any line that contains a dead link. Hovering the icon shows the diagnostic message.

### Reading Mode

In Reading mode, dead links are marked with a visual badge via a markdown post-processor, so they're visible even outside the editor.

### Narrative Warnings Panel

All dead links (and state conflicts) are collected in the Narrative Warnings sidebar. Open it with:

- The **scroll icon** in the ribbon, or
- The **Open narrative warnings** command

Each warning shows the file path, line number, and a description. Click a warning to jump directly to the problematic line in the editor.

## State Conflict Detection

Beyond dead links, Codex detects logical contradictions in your narrative. When enabled (**Settings > State conflict warnings**), the diagnostic engine checks three rules:

### Dead NPC Present in Session

If an NPC has `status: dead` (or `destroyed`, `deceased`, etc.) but is mentioned in a session whose `date` is after a reasonable point, a warning is raised.

### Item on Dead NPC

If an item's `location` frontmatter links to an NPC who is dead, a warning flags the inconsistency — the item should probably be somewhere else.

### Faction Leader Mismatch

If a faction's `leader` field links to an NPC, but that NPC doesn't link back to the faction, a warning is raised to flag the missing reciprocal reference.

### Viewing Conflicts

State conflicts appear in:

- The **Narrative Warnings panel** alongside dead links
- The **editor gutter** (when gutter icons are enabled)

## Create Entity

Create a new entity file with proper frontmatter from a modal dialog.

### From the Command Palette

Run **Create entity** to open a dialog where you enter the entity name and choose a type. Codex creates the file in the appropriate type folder (e.g., `npcs/` for NPCs) with frontmatter pre-filled.

### From a Dead Link

If you've written `[[Someone]]` but the file doesn't exist yet, select the link text and run **Create entity from dead link**. The selected text becomes the suggested entity name. Pick a type and Codex creates the file.

### File Structure

Created files include:

- YAML frontmatter with `type`, `name`, `status` (where applicable), and `tags`
- An `# Entity Name` heading
- The file is opened automatically after creation

> **Note:** Files created via **AI: generate entity** may also include a `sections` frontmatter field if you unchecked sections in the generation dialog. This field tells Enhance Note which sections to target. See the [AI Guide](ai-guide.md#section-selection-and-the-sections-frontmatter-field) for details.

## Rename Entity

Rename an entity and update every reference across the vault in one operation.

### How It Works

1. Run **Rename entity** from the command palette (only available when the active file is an indexed entity), or right-click an entity file in the file explorer and choose **Codex: rename**.
2. Enter the new name in the dialog.
3. A confirmation modal shows you how many files will be updated and lists them.
4. Click **Rename** to apply. Codex will:
   - Update the `name:` field in the entity's frontmatter
   - Rewrite every `[[Old Name]]` and `[[Old Name|display text]]` link across the vault
   - Rename the file on disk to match the new name

## Link Resolution

Codex enhances Obsidian's link navigation to handle cases the default resolver misses:

### Alias Matching

If you link to `[[The Silver Hand]]` but the file's name is `Silver Hand.md` with `aliases: ["The Silver Hand"]` in frontmatter, Codex resolves the link correctly.

### Plural Matching

Codex generates plural and singular variants of entity names. If a link targets `[[Dragons]]` but the file is `Dragon.md`, the plugin can resolve the match.

### Fallback Behavior

Link resolution only kicks in when Obsidian's built-in resolver fails. If Obsidian can find the target file natively, Codex stays out of the way.

## Plural Alias Generation

The **Generate plural aliases** maintenance action (in Settings or via button) scans all entities and adds plural/singular variants as YAML aliases in their frontmatter. For example, an entity named "Dragon" would get `aliases: ["Dragons"]` added automatically.

This improves both link resolution and autocomplete for plural references.

### When to Use It

Run this after a large import or when you notice plural links not resolving. It's safe to run multiple times — existing aliases are preserved and duplicates are skipped.

## Arc Review

Codex can analyze an entire adventure arc for narrative consistency and completeness using AI.

### What It Checks

Given an adventure entity and its linked sessions, the AI reviews:

- **Timeline consistency** across sessions
- **Character continuity** (NPCs introduced, dropped, or behaving inconsistently)
- **Plot thread tracking** (open threads resolved vs. dangling)
- **World consistency** (locations, factions, items)
- **Arc completeness** (how much of the adventure outline has been covered)

### Output

The review is saved as a note in `_codex/reviews/` with frontmatter linking back to the adventure and sessions reviewed. See the [AI Guide](ai-guide.md#ai-review-arc) for full details.

## Next Steps

- [AI Guide](ai-guide.md) — set up a provider and learn how Lore Chat, Enhance Note, and other AI commands work
- [Settings Reference](settings.md) — every setting explained
- [Commands Reference](commands.md) — complete list of commands, hotkeys, and menus
