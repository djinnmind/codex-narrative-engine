# Commands Reference

Every command, hotkey, context menu entry, and ribbon icon in Codex Narrative Engine.

## Command Palette

All commands are accessible via the command palette (`Cmd/Ctrl + P`). Commands marked with a condition are only available when that condition is met.

| Command | ID | Default Hotkey | Condition |
|---------|----|:-:|-----------|
| Open narrative warnings | `open-warnings-panel` | — | Always available |
| Open lore chat | `open-lore-chat` | — | Always available |
| Re-index vault | `reindex-vault` | — | Always available |
| Create entity | `create-entity` | — | Always available |
| Create entity from dead link | `create-entity-from-link` | — | A markdown file is open |
| Rename entity | `rename-entity` | — | Active file is an indexed entity |
| AI: enhance note | `ai-enhance-note` | — | A markdown file is open |
| AI: generate entity | `ai-generate-entity` | — | Always available |
| AI: describe scene (read-aloud) | `ai-describe-scene` | — | A markdown file is open |
| AI: extract entities from note | `ai-extract-entities` | — | A markdown file is open |
| Accept AI suggestions | `accept-suggestions` | — | Always available (no-op if no suggestions active) |
| Reject AI suggestions | `reject-suggestions` | — | Always available (no-op if no suggestions active) |

> None of these commands have default hotkeys. You can assign your own in **Settings > Hotkeys** by searching for "Codex".

## Ribbon Icons

| Icon | Tooltip | Action |
|------|---------|--------|
| Scroll | Codex: narrative warnings | Opens the Narrative Warnings sidebar panel |
| Chat bubble | Codex: lore chat | Opens the Lore Chat sidebar panel |

## Editor Context Menu

Right-click in the editor to see these items. The menu is only shown for markdown files.

### Codex AI Submenu

The **Codex AI** submenu (wand icon) contains:

| Item | Icon | Condition | Description |
|------|------|-----------|-------------|
| Revise selection... | Pencil | Text is selected | Opens the Revise Selection modal for the selected text |
| Generate "*word*"... | Plus circle | Word under cursor or text selected | Classifies the word's entity type via AI, then opens the Generate Entity dialog |
| *(separator)* | | | |
| Enhance note | Sparkles | Always | Runs AI: enhance note on the current file |
| Describe scene (read-aloud) | Eye | Always | Runs AI: describe scene on the current file |
| *(separator)* | | | |
| Extract entities | Scan search | Always | Runs AI: extract entities on the current file |

### Entity Actions

| Item | Icon | Condition | Description |
|------|------|-----------|-------------|
| Rename "*entity*"... | Pencil line | Current file is an indexed entity | Opens the Rename Entity dialog |

### Suggestion Review (when AI suggestions are active)

When AI suggestion decorations are visible in the editor, these items appear at the top of the context menu:

| Item | Icon | Condition | Description |
|------|------|-----------|-------------|
| Accept this change | Check | Cursor is on a suggestion hunk | Accepts the single change under the cursor |
| Reject this change | X | Cursor is on a suggestion hunk | Rejects the single change under the cursor |
| Accept all changes | Check-check | Suggestions are active | Accepts all pending suggestions |
| Reject all changes | X | Suggestions are active | Rejects all pending suggestions |

## File Explorer Context Menu

Right-click a markdown file in the file explorer to see these items.

| Item | Icon | Condition | Description |
|------|------|-----------|-------------|
| Codex: rename "*entity*"... | Pencil line | File is an indexed entity | Opens the Rename Entity dialog for this file |
| Codex: extract entities | Scan search | File is a markdown file | Runs AI: extract entities on this file |

## Sidebar Panels

### Narrative Warnings

The Narrative Warnings panel lists all diagnostics found across the vault:

- Dead links (unresolved `[[wiki-links]]`)
- State conflicts (logical contradictions)

Each entry shows the file path, line number, severity, and message. Click an entry to open the file and jump to the problematic line.

Open via: ribbon scroll icon, command palette **Open narrative warnings**, or Settings > Maintenance.

### Lore Chat

The Lore Chat panel is a conversation interface for AI-assisted lore queries and content generation.

- Type a message and press Enter to send
- Previous messages can be edited and re-sent
- The last assistant response can be regenerated
- When multiple entities are generated in a response, a **Save All as Notes** button appears

Open via: ribbon chat bubble icon or command palette **Open lore chat**.
