# AI Features Guide

Codex Narrative Engine's AI features are entirely bring-your-own-key. You connect your own API key (or a local model server) and the plugin handles context assembly, prompt construction, and result integration. No data leaves your machine except the API calls you configure.

## Supported Providers

| Provider | API Key Required | Default Model | Default Base URL |
|----------|:---:|---|---|
| Google Gemini | Yes | Gemini 2.5 Flash | `https://generativelanguage.googleapis.com` |
| OpenAI | Yes | GPT-4o | `https://api.openai.com/v1` |
| Anthropic (Claude) | Yes | Claude Sonnet 4 | `https://api.anthropic.com/v1` |
| OpenAI-Compatible | Yes | (you specify) | `http://localhost:8080/v1` |
| Ollama (Local) | No | llama3 | `http://localhost:11434` |
| LM Studio (Local) | No | (you specify) | `http://localhost:1234/v1` |

## Provider Setup

### Google Gemini

1. Go to [Google AI Studio](https://aistudio.google.com/) and sign in.
2. Click **Get API key** and create a key.
3. In Codex settings, set **Provider** to **Google Gemini**.
4. Paste your API key into the **API key** field.
5. Choose a model from the dropdown (Gemini 2.5 Flash is the default and a good balance of speed and quality).
6. Click **Test connection** to verify.

### OpenAI

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys) and create an API key.
2. In Codex settings, set **Provider** to **OpenAI**.
3. Paste your API key.
4. Choose a model (GPT-4o is the default).
5. Click **Test connection**.

### Anthropic (Claude)

1. Go to [console.anthropic.com](https://console.anthropic.com/) and create an API key.
2. In Codex settings, set **Provider** to **Anthropic (Claude)**.
3. Paste your API key.
4. Choose a model (Claude Sonnet 4 is the default).
5. Click **Test connection**.

### OpenAI-Compatible Endpoint

Use this for any service that exposes an OpenAI-compatible chat completions API (e.g., Together AI, Fireworks, a self-hosted vLLM server).

1. Set **Provider** to **OpenAI-Compatible**.
2. Enter your API key.
3. Set the **Base URL** to your endpoint (e.g., `https://api.together.xyz/v1`).
4. Type the **Model** name manually (the dropdown is empty for this provider).
5. Click **Test connection**.

### Ollama (Local)

[Ollama](https://ollama.com/) runs models locally on your machine with no API key needed.

1. Install Ollama and pull a model: `ollama pull llama3`
2. Make sure Ollama is running (`ollama serve` or the desktop app).
3. In Codex settings, set **Provider** to **Ollama (Local)**.
4. The default base URL (`http://localhost:11434`) should work unless you changed it.
5. Type the model name you pulled (e.g., `llama3`, `mistral`, `gemma2`).
6. Click **Test connection**.

### LM Studio (Local)

[LM Studio](https://lmstudio.ai/) provides a GUI for running local models with an OpenAI-compatible server.

1. Download and install LM Studio.
2. Download a model and start the local server (usually on port 1234).
3. In Codex settings, set **Provider** to **LM Studio (Local)**.
4. The default base URL (`http://localhost:1234/v1`) should work.
5. Type the model identifier shown in LM Studio.
6. Click **Test connection**.

## How Context Assembly Works

Every AI call in Codex goes through the same pipeline:

1. **Context assembly** — the `ContextAssembler` scans your vault index and gathers relevant entities, recent sessions, and world rules based on the text being processed.
2. **System prompt** — `buildSystemPrompt` combines the assembled context with your campaign settings (rule system, tone) into a system-level instruction.
3. **User prompt** — each command adds its own task-specific instruction (enhance, revise, generate, etc.).
4. **Response handling** — the AI response is parsed, cleaned, and presented for review (usually via a diff modal or the chat panel).

### What the AI Sees

For a typical call, the assembled context includes:

- **Matched entities** (up to 60) — entities whose names appear in the input text, plus their 1-hop linked neighbors.
- **World entities** — all entities with `type: world` are always included (cosmology, pantheons, world rules).
- **Recent sessions** — the 3 most recent session logs by date (configurable, 0-10).
- **Campaign metadata** — your rule system, campaign tone, and total entity count.

### Tuning What the AI Sees

You can control context assembly in **Settings > AI context**:

- **Recent sessions to include** — how many session logs to include (0 to disable, up to 10).
- **Link expansion depth** — how many hops to follow from directly-mentioned entities (0 = only mentioned entities, up to 3).
- **Include world entities** — toggle whether `type: world` entities are always included.
- **Excluded folders** — comma-separated folders to exclude from AI context (useful for player-facing secrets you don't want leaking into AI responses).

## Lore Chat

Lore Chat is a sidebar conversation panel where you can ask questions about your campaign, brainstorm ideas, or generate content — all grounded in your vault's lore.

### Opening Lore Chat

- Click the **chat bubble** ribbon icon, or
- Run the **Open lore chat** command (`Cmd/Ctrl + Shift + L`)

### How It Works

1. Type a message in the input area and press Enter (or click Send).
2. Codex assembles context from your vault based on the entities mentioned in your message.
3. The AI responds with knowledge grounded in your campaign lore.
4. The full conversation history is sent with each message, so follow-up questions work naturally.

### Conversation Features

- **Edit a message** — click the edit icon on any previous user message to modify it and re-send from that point.
- **Regenerate** — click the regenerate icon on the last assistant message to get a different response.
- **Save All as Notes** — when the AI generates content for multiple entities in a single response, a "Save All as Notes" button appears. Clicking it creates individual entity files with proper frontmatter for each entity, filed into the correct type folder.

### Tips for Lore Chat

- Reference entities by name for best results — "Tell me about [[Kira Ashwood]]'s relationship with [[The Silver Order]]" gives the AI more context than "tell me about the merchant."
- Use it for brainstorming: "Suggest three plot hooks involving the missing artifact and the thieves' guild."
- Ask consistency questions: "Are there any contradictions between what happened in Session 12 and Borin's backstory?"

## AI: Enhance Note

Expands a stub or incomplete entity note into a fully developed document.

### What It Does

1. Reads the active note's content and entity type.
2. Checks the note's frontmatter for a `sections` field. If present, uses that list to scope which sections to generate. Otherwise, loads the full template from `_codex/templates/`.
3. Sends the full note to the AI with instructions to:
   - Fix and complete frontmatter
   - Reconcile contradictions between frontmatter, stat block, and prose
   - Reorganize content into the section structure (scoped or full)
   - Reformat markdown and convert plain entity names to `[[wiki-links]]`
   - Fill in missing sections with plausible content (only for sections in the list)
4. Presents the result in a diff review modal. Existing sections not in the `sections` list are preserved but not expanded.

### When to Use It

- After creating a stub entity with just a name and type
- When you've accumulated scattered notes and want them organized
- To fill in mechanical details (stat blocks, frontmatter fields) for a narratively-written entity

### How to Run It

- Command palette: **AI: enhance note**
- Right-click in editor: **Codex AI > Enhance note**

The command is only available when a markdown file is open.

## AI: Generate Entity

Creates a brand-new entity from scratch.

### From the Command Palette

Run **AI: generate entity** to open a dialog where you specify:

- **Name** (optional — the AI will choose one if left blank)
- **Entity type** (NPC, creature, location, etc.)
- **Sections** — a collapsible checklist of template sections (e.g. Description, Stat Block, Secrets). All are selected by default; uncheck any you don't need and the AI will only generate the checked sections. The list updates automatically when you change the entity type.
- **Description / guidance** (optional hints like "a paranoid dwarf merchant" or "a haunted swamp temple")

The AI generates a complete note with frontmatter, sections matching the entity template, and (for creatures/NPCs) an optional stat block. The file is created in the appropriate type folder and opened.

### Section Selection and the `sections` Frontmatter Field

When you uncheck sections in the generate dialog, Codex stores your selection as a `sections` field in the generated file's frontmatter:

```yaml
sections: ["Description", "Stat Block"]
```

This field is used later by **Enhance Note** to scope its work — it will only generate content for sections in this list, rather than filling in the full template. You can also add or edit the `sections` field manually in any entity's frontmatter to control what Enhance Note targets.

If the `sections` field is absent, Enhance Note uses the full template as before.

### From the Context Menu

Right-click in the editor to find **Codex AI > Generate "word"**. This picks up the word under your cursor (or selected text), asks the AI to classify its entity type, and opens the generate dialog with the name and type pre-filled. This is useful when you've written a name in a session log and want to quickly flesh it out.

### Stat Block Format

Generated stat blocks follow your **Stat block format** setting:

- **Fantasy Statblocks (plugin)** — generates a ```` ```statblock ```` YAML code block compatible with the [Fantasy Statblocks](https://github.com/javalent/fantasy-statblocks) plugin.
- **Markdown tables** — generates a standard markdown table stat block.

## AI: Describe Scene (Read-Aloud)

Generates atmospheric read-aloud text for a location or session scene.

### What It Does

1. Reads the active note's content.
2. Asks the AI to write 2-3 paragraphs of evocative, sensory-rich description — the kind you'd read aloud to players when they arrive at a location.
3. Appends the result as a callout block at the end of the note (after diff review).

The output uses a `> [!read-aloud]` callout format so it stands out visually.

### How to Run It

- Command palette: **AI: describe scene (read-aloud)**
- Right-click in editor: **Codex AI > Describe scene (read-aloud)**

Works best on location notes and session scenes. The AI avoids game mechanics and focuses on sight, sound, smell, and atmosphere.

## AI: Extract Entities from Note

Scans a note for named entities and creates individual files for each.

### What It Does

1. Reads the active note (typically a session log or narrative document).
2. Sends it to the AI with instructions to identify named NPCs, locations, items, factions, and other entities.
3. Presents a checklist modal showing every entity found, its detected type, and a short description.
4. Entities that already exist in the vault are marked and unchecked by default.
5. Click **Create** to generate files for the selected entities.

### After Extraction

- Each new entity file gets basic frontmatter (`type`, `name`, `status`, `tags`) and a heading.
- The source note is updated to wrap newly created entity names in `[[wiki-links]]` automatically.
- The vault is re-indexed to pick up the new files.

### How to Run It

- Command palette: **AI: extract entities from note**
- Right-click in editor: **Codex AI > Extract entities**
- Right-click a file in the explorer: **Codex: extract entities**

### Tips

- Run this on session logs after a game to quickly create stubs for all the NPCs, locations, and items that came up.
- Follow up with **Enhance Note** on the generated stubs to flesh them out.

## AI: Revise Selection

Rewrites a selected portion of text based on a natural-language instruction.

### How to Use It

1. Select text in the editor.
2. Right-click and choose **Codex AI > Revise selection**.
3. In the modal, type your instruction:
   - "Make it more dramatic"
   - "Add sensory details"
   - "Rewrite as bullet points"
   - "Shorten to two sentences"
   - "Translate to a more formal tone"
4. Click **Revise**.
5. Review the changes in the diff modal and accept or reject.

The AI preserves `[[wiki-links]]`, matches your existing writing style, and doesn't add frontmatter. Only the selected region is modified.

## Diff Review

All AI edits (Enhance Note, Revise Selection, Describe Scene) go through a diff review step before touching your notes.

### How It Works

1. After the AI produces its output, Codex computes a diff between the original file content and the proposed changes.
2. A diff review modal shows the changes as inline suggestions in the editor, with additions highlighted in green and removals in red.
3. You can:
   - **Accept all changes** — apply everything
   - **Reject all changes** — discard everything
   - **Accept/reject individual changes** — right-click on a specific change to accept or reject just that hunk

### Accessing Diff Review

When suggestions are active in the editor:

- Command palette: **Accept AI suggestions** / **Reject AI suggestions**
- Right-click: **Accept this change**, **Reject this change**, **Accept all changes**, **Reject all changes**

Suggestions persist until you explicitly accept or reject them, so you can scroll through the note and review at your own pace.

## Generation Settings

Several settings affect how AI-generated content is styled:

- **Rule system** — D&D 5e, D&D 5e (2024), Pathfinder 2e, or Custom. Injected into the system prompt so the AI generates system-appropriate mechanics.
- **Campaign tone** — a free-text description like "dark fantasy" or "lighthearted adventure". Influences the writing style of all generated content.
- **Stat block format** — Fantasy Statblocks (plugin) or Markdown tables.
- **Stat block width** — pixel width of rendered statblock cards (300-900, default 600).
- **Temperature** — controls randomness (0.1 = focused and predictable, 1.0 = creative and varied). The default of 0.8 works well for most generation tasks.

See the [Settings Reference](settings.md) for full details on every option.

## Next Steps

- [Settings Reference](settings.md) — every setting with type, default, and description
- [Commands Reference](commands.md) — every command, hotkey, and context menu entry
- [AI Prompt Architecture](ai-prompt-architecture.md) — deep dive into how prompts and context are constructed (advanced)
