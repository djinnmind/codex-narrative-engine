# Settings Reference

All settings are in **Settings > Codex Narrative Engine**. They are organized into the groups below.

## Narrative Linting

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Dead-link warnings | Toggle | On | Highlight `[[links]]` that don't resolve to any file in the vault. Dead links appear as dashed red underlines in the editor, badges in reading mode, and entries in the Narrative Warnings panel. |
| State conflict warnings | Toggle | On | Flag logical contradictions in your narrative. Detects dead NPCs listed as present in sessions, items held by dead NPCs, and faction leader mismatches. |
| Gutter icons | Toggle | On | Show warning icons in the editor gutter on lines that have diagnostics (dead links or state conflicts). Hover the icon to see the message. |
| Ignored folders | Text | `.trash` | Comma-separated list of folders to exclude from entity indexing. Files in these folders are invisible to Codex — they won't appear in autocomplete, hover previews, or diagnostics. |

## AI Provider

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Provider | Dropdown | Google Gemini | Which AI provider to use. Changing the provider resets the model, base URL, and max context tokens to that provider's defaults. |
| API key | Password | (empty) | Your API key for the selected provider. Stored locally in the vault's plugin data — never sent anywhere except the provider's API. Only shown for providers that require a key (Gemini, OpenAI, Anthropic, OpenAI-Compatible). |
| Model | Dropdown / Text | Varies by provider | The model to use for completions. Cloud providers (Gemini, OpenAI, Anthropic) show a dropdown of known models. Local/compatible providers show a text field where you type the model name. |
| Base URL | Text | Varies by provider | API base URL. Usually you don't need to change this unless you're using a proxy, custom endpoint, or non-standard port for a local server. |
| Test connection | Button | — | Sends a minimal request to the provider to verify the API key and endpoint are valid. Shows latency on success. |

### Default Models and URLs by Provider

| Provider | Default Model | Default Base URL | Max Context Tokens |
|----------|---------------|------------------|--------------------|
| Google Gemini | `gemini-2.5-flash` | `https://generativelanguage.googleapis.com` | 1,000,000 |
| OpenAI | `gpt-4o` | `https://api.openai.com/v1` | 128,000 |
| Anthropic (Claude) | `claude-sonnet-4-20250514` | `https://api.anthropic.com/v1` | 200,000 |
| OpenAI-Compatible | (you specify) | `http://localhost:8080/v1` | 32,000 |
| Ollama (Local) | `llama3` | `http://localhost:11434` | 32,000 |
| LM Studio (Local) | (you specify) | `http://localhost:1234/v1` | 32,000 |

## AI Context

These settings control what information from your vault is included when building context for AI calls.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Recent sessions to include | Slider (0–10) | 3 | Number of recent session logs (sorted by the `date` frontmatter field) to include in AI context. Set to 0 to exclude session history entirely. |
| Link expansion depth | Slider (0–3) | 1 | How many link hops to follow when gathering entity context. At 0, only entities directly mentioned in the input text are included. At 1, their linked neighbors are also included. Higher values cast a wider net but use more tokens. |
| Include world entities | Toggle | On | Always include all entities with `type: world` in AI context, regardless of whether they're mentioned. Useful for cosmology, pantheons, and world rules that should always inform AI responses. |
| Excluded folders | Text | (empty) | Comma-separated folders to exclude from AI context. Entities in these folders are still indexed (for autocomplete and diagnostics) but are never sent to the AI. Useful for player-facing secrets or out-of-game notes. |

## AI Generation

These settings affect the style and format of AI-generated content.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Rule system | Dropdown | D&D 5e | The game system used when generating content. Options: D&D 5e, D&D 5e (2024), Pathfinder 2e, Custom / system-agnostic. Injected into the system prompt so the AI produces system-appropriate mechanics, stat blocks, and terminology. |
| Campaign tone | Text | (empty) | A free-text description of your campaign's tone, such as "dark fantasy", "lighthearted adventure", "gritty noir", or "cosmic horror". Influences the writing style of all AI-generated content. Leave blank for a neutral default. |
| Stat block format | Dropdown | Fantasy Statblocks (plugin) | Format for AI-generated creature stat blocks. **Fantasy Statblocks** produces a ```` ```statblock ```` YAML code block compatible with the [Fantasy Statblocks](https://github.com/javalent/fantasy-statblocks) plugin. **Markdown tables** produces standard markdown table stat blocks. |
| Stat block width | Slider (300–900) | 600 | Width in pixels of rendered Fantasy Statblocks cards. The plugin's own default is 400px; Codex sets 600px for wider campaign notes. Adjust to fit your theme and reading width. |
| Temperature | Slider (0.1–1.0) | 0.8 | Controls randomness in AI responses. Lower values (0.1–0.3) produce focused, predictable output — good for factual queries. Higher values (0.7–1.0) produce more creative, varied output — good for generation and brainstorming. Each AI command also uses its own internal temperature (e.g., Extract Entities uses 0.2 for precision), but Lore Chat uses this setting directly. |

## Entity Types

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Entity type list | List | npc, creature, location, faction, item, session, quest, adventure, event, world, rules, handout | The list of entity types the plugin indexes and offers in generation dialogs. Built-in types are labeled. |
| Add custom type | Text + Button | — | Add a custom type (lowercase, alphanumeric + hyphens). The new type will appear in autocomplete type filters, the Create Entity dialog, and the Generate Entity dialog. |
| Reset to defaults | Button | — | Removes all custom types and restores the built-in list. |

Custom types are synced to the entity registry immediately when added or removed.

## Entity Templates

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Template folder | Text | `_codex/templates` | Vault folder where entity generation templates are stored. Each template is a markdown file named `{type}.md` (e.g., `npc.md`). Templates tell the AI what sections and frontmatter fields to include when generating a new entity. |
| Open templates folder | Button | — | Opens the template folder in Obsidian's file explorer so you can edit templates directly. Creates the folder and default templates if they don't exist. |
| Reset templates | Button | — | Overwrites all template files in the template folder with built-in defaults. Use this if you've edited templates and want to start fresh. |

## Maintenance

| Setting | Type | Description |
|---------|------|-------------|
| Re-index vault | Button | Clears the entity index and rebuilds it from scratch by scanning every markdown file in the vault. Use this if the index seems out of sync, or after bulk-importing files outside of Obsidian. |
| Generate plural aliases | Button | Scans all indexed entities and adds plural/singular variants as YAML `aliases` in their frontmatter. For example, "Dragon" gets an alias "Dragons". Improves link resolution and autocomplete for plural references. Safe to run multiple times. |
