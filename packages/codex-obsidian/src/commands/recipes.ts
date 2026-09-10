import { Modal, Notice, TFile } from 'obsidian';
import {
  buildSystemPrompt,
  parseRecipePlan,
  errorKey,
  matchRecipeIntent,
  extractWikiLinkTargets,
} from '@codex-ide/core';
import type { Entity, RecipePlan, RecipeStep, VaultContext } from '@codex-ide/core';
import type CodexPlugin from '../main';
import { extractMarkdown, ENTITY_FOLDER_MAP } from '../util/ai-helpers';
import { readFollowedNotes } from '../ai/follow-notes';
import { buildRecipeDraft, openRecipeReview } from '../ui/recipe-review-modal';
import type { RecipeDraft } from '../ui/recipe-review-modal';
import { installResizableModal } from '../ui/resizable-modal';
import { getActiveDocument } from '../util/dom';

const PLOT_TYPES = new Set(['adventure', 'quest', 'arc']);

/**
 * Lore Chat skill entry: returns assistant markdown if this turn is a recipe,
 * or null so normal Q&A proceeds.
 */
export async function tryHandleRecipeChat(
  plugin: CodexPlugin,
  message: string,
): Promise<string | null> {
  const match = matchRecipeIntent(message);
  if (!match) {
    if (/(^|\s)@recipe\b/i.test(message)) return RECIPE_CATALOG;
    return null;
  }
  if (match.id === 'npc-at-location') {
    return handleNpcAtLocationChat(plugin, message);
  }
  if (match.id === 'add-arc') {
    return handleAddArcChat(plugin, message);
  }
  if (match.id === 'add-location') {
    return handleAddLocationChat(plugin, message);
  }
  return handleAdvancePlotsChat(plugin, message);
}

function requireProvider(plugin: CodexPlugin) {
  const provider = plugin.getProvider();
  if (!provider) {
    new Notice(
      'Codex: configure an AI provider in settings first.',
    );
    return null;
  }
  return provider;
}

function sessionSortKey(entity: Entity): number {
  const n = entity.frontmatter['session_number'];
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  if (typeof n === 'string' && n.trim()) {
    const parsed = Number(n);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const fromName = entity.name.match(/(\d+)/);
  if (fromName) return Number(fromName[1]);
  return 0;
}

function mostRecentSession(plugin: CodexPlugin): Entity | undefined {
  const sessions = plugin.registry.getByType('session');
  if (sessions.length === 0) return undefined;
  return [...sessions].sort((a, b) => sessionSortKey(b) - sessionSortKey(a))[0];
}

function plotsLinkedFrom(plugin: CodexPlugin, entity: Entity): Entity[] {
  const out: Entity[] = [];
  const seen = new Set<string>();
  for (const link of entity.links) {
    for (const t of plugin.registry.getByName(link.target)) {
      if (!PLOT_TYPES.has(String(t.type).toLowerCase()) || seen.has(t.filePath)) continue;
      seen.add(t.filePath);
      out.push(t);
    }
  }
  return out;
}

async function assembleRecipeContext(plugin: CodexPlugin, query: string, seedPaths: string[]): Promise<VaultContext> {
  const context = plugin.contextAssembler.assemble(query, {
    includeWorldEntities: false,
    maxEntities: 16,
    linkExpansionDepth: 0,
  });
  const keep = new Set(seedPaths);
  const entities = context.entities.filter(e => keep.has(e.filePath));
  for (const e of context.entities) {
    if (entities.length >= 16) break;
    if (keep.has(e.filePath)) continue;
    entities.push(e);
    keep.add(e.filePath);
  }
  return {
    ...context,
    entities,
    worldRules: [],
    recentSessions: [],
    followedNotes: [],
  };
}

async function chatJson(plugin: CodexPlugin, systemPrompt: string, user: string): Promise<string> {
  const provider = requireProvider(plugin);
  if (!provider) throw new Error('No AI provider');
  const response = await provider.chat({
    systemPrompt,
    messages: [{ role: 'user', content: user }],
    temperature: 0.2,
    maxTokens: 1024,
  });
  return response.content;
}

async function chatMarkdown(plugin: CodexPlugin, systemPrompt: string, user: string): Promise<string> {
  const provider = requireProvider(plugin);
  if (!provider) throw new Error('No AI provider');
  const response = await provider.chat({
    systemPrompt,
    messages: [{ role: 'user', content: user }],
    temperature: 0.5,
    maxTokens: 4096,
  });
  return extractMarkdown(response.content);
}

function snapshotErrors(plugin: CodexPlugin): Set<string> {
  return new Set(
    plugin.diagnosticEngine.diagnoseAll()
      .filter(d => d.severity === 'error')
      .map(errorKey),
  );
}

async function reindexPath(plugin: CodexPlugin, path: string): Promise<void> {
  const abstract = plugin.app.vault.getAbstractFileByPath(path);
  if (!(abstract instanceof TFile)) return;
  const content = await plugin.app.vault.cachedRead(abstract);
  plugin.registry.indexFile(path, content);
}

async function runRecipePlan(
  plugin: CodexPlugin,
  plan: RecipePlan,
  ctx: VaultContext,
  buildPrompt: (step: RecipeStep, existing: string) => string,
): Promise<string> {
  const accepted = await confirmPlan(plugin, plan);
  if (!accepted || accepted.length === 0) {
    return 'Recipe cancelled.';
  }

  const systemPrompt = buildSystemPrompt(ctx, {
    ruleSystem: plugin.settings.aiRuleSystem,
    campaignTone: plugin.settings.aiCampaignTone,
    language: plugin.settings.aiLanguage,
  });

  const drafts: RecipeDraft[] = [];
  let skipped = 0;
  const hide = showSpinner(`Drafting ${accepted.length} file${accepted.length === 1 ? '' : 's'}…`);
  try {
    for (const step of accepted) {
      const existingFile = plugin.app.vault.getAbstractFileByPath(step.path);
      const existing = existingFile instanceof TFile
        ? await plugin.app.vault.read(existingFile)
        : '';
      if (step.action === 'patch' && !(existingFile instanceof TFile)) {
        new Notice(`Codex: skip ${step.path} — file not found.`);
        skipped++;
        continue;
      }
      if (step.action === 'create' && existingFile instanceof TFile) {
        new Notice(`Codex: skip ${step.path} — already exists.`);
        skipped++;
        continue;
      }
      const drafted = await chatMarkdown(
        plugin,
        systemPrompt,
        buildPrompt(step, existing.length > 14_000 ? existing.slice(0, 14_000) + '\n…' : existing),
      );
      if (!drafted.trim() || drafted === existing) {
        skipped++;
        continue;
      }
      drafts.push(buildRecipeDraft(step, existing, drafted));
    }
  } catch (err: unknown) {
    hide();
    const msg = err instanceof Error ? err.message : 'unknown';
    new Notice(`Codex: recipe error — ${msg}`);
    return `Recipe error: ${msg}`;
  }
  hide();

  if (drafts.length === 0) {
    return `No drafts to review. Skipped ${skipped}.`;
  }

  const chosen = await openRecipeReview(plugin, plan.title, drafts);
  if (!chosen) {
    return 'Recipe cancelled.';
  }

  return applyRecipeDrafts(plugin, chosen, skipped);
}

async function ensureFolder(plugin: CodexPlugin, path: string): Promise<void> {
  const slash = path.lastIndexOf('/');
  if (slash <= 0) return;
  const folder = path.slice(0, slash);
  if (!plugin.app.vault.getAbstractFileByPath(folder)) {
    await plugin.app.vault.createFolder(folder);
  }
}

async function applyRecipeDrafts(
  plugin: CodexPlugin,
  drafts: RecipeDraft[],
  alreadySkipped: number,
): Promise<string> {
  const beforeErrors = snapshotErrors(plugin);
  let applied = 0;
  let skipped = alreadySkipped;

  for (const draft of drafts) {
    const { step, newContent } = draft;
    try {
      const existingFile = plugin.app.vault.getAbstractFileByPath(step.path);
      if (step.action === 'create') {
        if (existingFile instanceof TFile) {
          skipped++;
          continue;
        }
        await ensureFolder(plugin, step.path);
        await plugin.app.vault.create(step.path, newContent);
      } else {
        if (!(existingFile instanceof TFile)) {
          skipped++;
          continue;
        }
        await plugin.app.vault.modify(existingFile, newContent);
      }
      applied++;
      await reindexPath(plugin, step.path);

      const afterErrors = snapshotErrors(plugin);
      const introduced = [...afterErrors].filter(k => !beforeErrors.has(k));
      if (introduced.length > 0) {
        plugin.refreshWarningsView();
        plugin.refreshEditorDiagnostics();
        new Notice(`Codex: recipe stopped — ${introduced.length} new lint error(s) after ${step.path}.`);
        void plugin.activateWarningsPanel();
        const leftover = drafts.length - applied;
        return `Recipe stopped — ${introduced.length} new lint error(s) after ${step.path}. Applied ${applied}, left ${leftover} unapplied.`;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      new Notice(`Codex: recipe error — ${msg}`);
      return `Recipe error: ${msg}`;
    }
  }

  plugin.refreshWarningsView();
  plugin.refreshEditorDiagnostics();
  const warnings = plugin.diagnosticEngine.diagnoseAll().filter(d => d.severity === 'warning');
  const warnNote = warnings.length > 0 ? ` ${warnings.length} warning(s) in lint.` : '';
  const summary = `Applied ${applied} file(s), skipped ${skipped}.${warnNote}`;
  new Notice(`Codex: recipe ${summary}`);
  return summary;
}

function confirmPlan(plugin: CodexPlugin, plan: RecipePlan): Promise<RecipeStep[] | null> {
  const modal = new RecipePlanModal(plugin, plan);
  modal.open();
  return modal.result;
}

class RecipePlanModal extends Modal {
  private selected: Set<number>;
  private onResolve: (steps: RecipeStep[] | null) => void = () => {};
  private resolved = false;
  private uninstallResize: (() => void) | null = null;

  readonly result = new Promise<RecipeStep[] | null>(resolve => {
    this.onResolve = resolve;
  });

  constructor(
    plugin: CodexPlugin,
    private plan: RecipePlan,
  ) {
    super(plugin.app);
    this.selected = new Set(plan.steps.map((_, i) => i));
  }

  onOpen(): void {
    this.uninstallResize = installResizableModal(this.modalEl, {
      storageKey: 'codex-recipe-plan-modal-size',
      defaultMaxWidth: 720,
      defaultMaxHeight: 560,
    });
    const { contentEl } = this;
    contentEl.addClass('codex-recipe-modal');
    contentEl.createEl('h3', { text: this.plan.title });
    contentEl.createEl('p', {
      text: 'Uncheck any file you do not want drafted. After drafting, you review every file in one window.',
      cls: 'codex-extract-summary',
    });

    const listEl = contentEl.createDiv({ cls: 'codex-extract-list' });
    this.plan.steps.forEach((step, idx) => {
      const row = listEl.createDiv({ cls: 'codex-extract-row' });
      const checkbox = row.createEl('input', { type: 'checkbox' });
      checkbox.checked = this.selected.has(idx);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) this.selected.add(idx);
        else this.selected.delete(idx);
      });
      const info = row.createDiv({ cls: 'codex-extract-info' });
      const nameRow = info.createDiv({ cls: 'codex-extract-name' });
      nameRow.createSpan({ text: step.path, cls: 'codex-extract-entity-name' });
      nameRow.createSpan({ text: step.action, cls: 'codex-extract-type-badge' });
      info.createDiv({ text: step.summary, cls: 'codex-extract-desc' });
    });

    const actions = contentEl.createDiv({ cls: 'codex-extract-actions' });
    const cancelBtn = actions.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => {
      this.resolved = true;
      this.onResolve(null);
      this.close();
    });
    const applyBtn = actions.createEl('button', { text: 'Draft selected', cls: 'mod-cta' });
    applyBtn.addEventListener('click', () => {
      this.resolved = true;
      this.onResolve(this.plan.steps.filter((_, i) => this.selected.has(i)));
      this.close();
    });
  }

  onClose(): void {
    this.uninstallResize?.();
    this.uninstallResize = null;
    if (!this.resolved) this.onResolve(null);
    this.contentEl.empty();
  }
}

function showSpinner(message: string): () => void {
  const overlay = getActiveDocument().createElement('div');
  overlay.className = 'codex-spinner-overlay';
  const card = getActiveDocument().createElement('div');
  card.className = 'codex-spinner-card';
  const spinner = getActiveDocument().createElement('div');
  spinner.className = 'codex-spinner';
  card.appendChild(spinner);
  const text = getActiveDocument().createElement('div');
  text.className = 'codex-spinner-text';
  text.textContent = message;
  card.appendChild(text);
  overlay.appendChild(card);
  getActiveDocument().body.appendChild(overlay);
  return () => overlay.remove();
}

function fileStem(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.md$/i, '');
}

function resolveWikiLink(plugin: CodexPlugin, name: string): Entity | undefined {
  const hits = plugin.registry.getByName(name);
  const needle = name.toLowerCase();
  return hits.find(e => e.name.toLowerCase() === needle)
    ?? hits.find(e => e.aliases.some(a => a.toLowerCase() === needle))
    ?? hits.find(e => fileStem(e.filePath).toLowerCase() === needle)
    ?? hits[0];
}

function wikiEntitiesOfTypes(plugin: CodexPlugin, message: string, types: Set<string>): Entity[] {
  const out: Entity[] = [];
  const seen = new Set<string>();
  for (const name of extractWikiLinkTargets(message)) {
    const entity = resolveWikiLink(plugin, name);
    if (!entity || !types.has(String(entity.type).toLowerCase())) continue;
    if (seen.has(entity.filePath)) continue;
    seen.add(entity.filePath);
    out.push(entity);
  }
  return out;
}

function npcRoster(plugin: CodexPlugin): string {
  return plugin.registry.getByType('npc')
    .map(e => `- ${e.name} — ${e.filePath}`)
    .sort((a, b) => a.localeCompare(b))
    .join('\n');
}

function locationRoster(plugin: CodexPlugin): string {
  return plugin.registry.getByType('location')
    .map(e => `- ${e.name} — ${e.filePath}`)
    .sort((a, b) => a.localeCompare(b))
    .join('\n');
}

function pathTaken(plugin: CodexPlugin, path: string): boolean {
  if (plugin.app.vault.getAbstractFileByPath(path)) return true;
  const stem = fileStem(path);
  return plugin.registry.getByName(stem).length > 0;
}

function uniqueCreatePath(plugin: CodexPlugin, desired: string): string {
  if (!pathTaken(plugin, desired)) return desired;
  const folder = desired.includes('/') ? desired.slice(0, desired.lastIndexOf('/')) : 'npcs';
  const stem = fileStem(desired);
  for (let i = 2; i < 50; i++) {
    const p = `${folder}/${stem} ${i}.md`;
    if (!pathTaken(plugin, p)) return p;
  }
  return `${folder}/${stem} ${Date.now()}.md`;
}

function activeEntity(plugin: CodexPlugin): Entity | undefined {
  const file = plugin.app.workspace.getActiveFile();
  return file ? plugin.registry.getByPath(file.path) : undefined;
}

function guidanceFromChat(message: string): string {
  return message
    .replace(/@recipe(?::|\s+)[\w-]+/gi, '')
    .replace(/@(npc-at-location|npc-at-this-location|advance-plots|advance-plot|add-arc|add-plot|create-arc|add-location|create-location|add-place)\b/gi, '')
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const RECIPE_CATALOG = `Recipes work like skills in Lore Chat. Invoke one explicitly, or just describe the job.

- \`@npc-at-location\` at [[Location]] into [[Plot A]] and [[Plot B]]
- \`@advance-plots\` from [[Session]] (or last session)
- \`@add-arc\` from [[Session]] involving [[NPC]]
- \`@add-location\` near [[Parent]] from [[Session]]
- \`@recipe npc-at-location\` / \`@recipe advance-plots\` / \`@recipe add-arc\` / \`@recipe add-location\`

You can also say it in plain language: “add a location near [[Blackmoss Landing]] based on [[Session 5]]”.`;

function npcRecipeHelp(
  plugin: CodexPlugin,
  message: string,
  locations: Entity[],
  plots: Entity[],
): string {
  const reasons: string[] = [];
  if (locations.length === 0) {
    reasons.push('no location wiki-link resolved');
  }
  if (plots.length === 0) {
    const links = extractWikiLinkTargets(message);
    const unknown = links.filter(n => !resolveWikiLink(plugin, n));
    const notPlot = links.filter(n => {
      const e = resolveWikiLink(plugin, n);
      return !!e && !PLOT_TYPES.has(String(e.type).toLowerCase());
    });
    if (unknown.length) reasons.push(`not in the index: ${unknown.map(n => `[[${n}]]`).join(', ')}`);
    if (notPlot.length) {
      reasons.push(`not an adventure/quest/arc: ${notPlot.map(n => `[[${n}]]`).join(', ')}`);
    }
    if (!unknown.length && !notPlot.length) reasons.push('no plot wiki-link resolved');
  }
  return `${NPC_RECIPE_HELP}\n\nCould not start — ${reasons.join('; ')}.`;
}

const NPC_RECIPE_HELP = `This is the **NPC at this location** recipe. Wiki-link one location and at least one plot (adventure, quest, or arc).

Example:

\`@npc-at-location\` at [[Blackmoss Landing]] into [[The Lockdown]]
A dockside fence who still has Gilded Company contacts.`;

const ADVANCE_RECIPE_HELP = `This is the **advance plots from last session** recipe. Name a session, or open a session note, or say "last session".

Example:

\`@advance-plots\` from [[Session 5]]`;

const ADD_ARC_HELP = `This is the **add an arc** recipe. Wiki-link a session (or open a session note / say last session). You can also name the NPCs the arc is about.

Example:

\`@add-arc\` from [[Session 5]] involving [[Elara Vance]]`;

const ADD_LOCATION_HELP = `This is the **add a location** recipe. Wiki-link a parent place, a session, a plot, or a faction — or describe the place in the same message.

Example:

\`@add-location\` near [[Blackmoss Landing]] from [[Session 5]]
A smuggler's cellar under the old counting house.`;

async function handleNpcAtLocationChat(plugin: CodexPlugin, message: string): Promise<string> {
  let locations = wikiEntitiesOfTypes(plugin, message, new Set(['location']));
  const active = activeEntity(plugin);
  if (locations.length === 0 && active?.type === 'location') locations = [active];

  const plots = wikiEntitiesOfTypes(plugin, message, PLOT_TYPES);

  if (!locations[0] || plots.length === 0) {
    return npcRecipeHelp(plugin, message, locations, plots);
  }

  const loc = locations[0];
  const guidance = guidanceFromChat(message);
  return runNpcAtLocation(plugin, loc, plots, guidance);
}

async function handleAdvancePlotsChat(plugin: CodexPlugin, message: string): Promise<string> {
  const mentioned = wikiEntitiesOfTypes(plugin, message, new Set(['session']));
  const active = activeEntity(plugin);
  const session = mentioned[0]
    ?? (active?.type === 'session' ? active : undefined)
    ?? mostRecentSession(plugin);
  if (!session) {
    return ADVANCE_RECIPE_HELP;
  }
  return runAdvancePlots(plugin, session);
}

async function handleAddArcChat(plugin: CodexPlugin, message: string): Promise<string> {
  const mentioned = wikiEntitiesOfTypes(plugin, message, new Set(['session']));
  const active = activeEntity(plugin);
  const session = mentioned[0]
    ?? (active?.type === 'session' ? active : undefined)
    ?? (/\blast session\b/i.test(message) ? mostRecentSession(plugin) : undefined)
    ?? mostRecentSession(plugin);
  if (!session) {
    return ADD_ARC_HELP;
  }
  const involved: Entity[] = [];
  const seen = new Set<string>([session.filePath]);
  for (const name of extractWikiLinkTargets(message)) {
    const entity = resolveWikiLink(plugin, name);
    if (!entity || seen.has(entity.filePath)) continue;
    const t = String(entity.type).toLowerCase();
    if (t === 'session') continue;
    seen.add(entity.filePath);
    involved.push(entity);
  }
  return runAddArc(plugin, session, involved, guidanceFromChat(message));
}

const LOCATION_ANCHOR_TYPES = new Set(['session', 'location', 'adventure', 'quest', 'arc', 'faction']);

async function handleAddLocationChat(plugin: CodexPlugin, message: string): Promise<string> {
  const involved: Entity[] = [];
  const seen = new Set<string>();
  for (const name of extractWikiLinkTargets(message)) {
    const entity = resolveWikiLink(plugin, name);
    if (!entity || seen.has(entity.filePath)) continue;
    seen.add(entity.filePath);
    involved.push(entity);
  }
  const active = activeEntity(plugin);
  if (
    involved.length === 0
    && active
    && LOCATION_ANCHOR_TYPES.has(String(active.type).toLowerCase())
  ) {
    involved.push(active);
  }
  if (involved.length === 0 && /\blast session\b/i.test(message)) {
    const session = mostRecentSession(plugin);
    if (session) involved.push(session);
  }
  const guidance = guidanceFromChat(message);
  if (involved.length === 0 && !guidance) {
    return ADD_LOCATION_HELP;
  }
  return runAddLocation(plugin, involved, guidance);
}

async function runAddArc(
  plugin: CodexPlugin,
  session: Entity,
  involved: Entity[],
  guidance: string,
): Promise<string> {
  if (!requireProvider(plugin)) {
    return 'Configure an AI provider in settings first — recipes run through the same BYOK / Cloud path as Lore Chat.';
  }
  const hide = showSpinner('Planning new arc…');
  try {
    const seedPaths = [session.filePath, ...involved.map(e => e.filePath)];
    let ctx = await assembleRecipeContext(
      plugin,
      `${session.name} ${involved.map(e => e.name).join(' ')} ${guidance}`,
      seedPaths,
    );
    const followed = await readFollowedNotes(
      plugin.app,
      ctx.entities,
      seedPaths,
      { excludedFolders: plugin.settings.aiExcludedFolders },
    );
    ctx = { ...ctx, followedNotes: followed };

    const systemPrompt = buildSystemPrompt(ctx, {
      ruleSystem: plugin.settings.aiRuleSystem,
      campaignTone: plugin.settings.aiCampaignTone,
      language: plugin.settings.aiLanguage,
    });
    const arcFolder = ENTITY_FOLDER_MAP.arc ?? 'arcs';
    const suggestedPath = uniqueCreatePath(plugin, `${arcFolder}/New Arc — ${session.name}.md`);
    const existingArcs = plugin.registry.getByType('arc')
      .map(e => `- ${e.name} — ${e.filePath}`)
      .sort((a, b) => a.localeCompare(b))
      .join('\n');
    const involvedLines = involved.length
      ? involved.map(e => `- [[${e.name}]] (${e.filePath}) type ${e.type}`).join('\n')
      : '(none named)';
    const npcPatches = involved
      .filter(e => String(e.type).toLowerCase() === 'npc')
      .slice(0, 2)
      .map(e => `    { "path": "${e.filePath}", "action": "patch", "summary": "wiki-link the new arc" }`)
      .join(',\n');

    const raw = await chatJson(plugin, systemPrompt, `Plan a campaign edit. Do not write file bodies.

Create a NEW arc (type: arc) grounded in this session. Do not rewrite existing arcs.

Session: [[${session.name}]] (${session.filePath})
Involved:
${involvedLines}
${guidance ? `Guidance: ${guidance}` : ''}

Existing arcs — do not reuse these names or paths:
${existingArcs || '(none)'}

Return ONLY JSON:
{
  "title": "short title",
  "steps": [
    { "path": "${suggestedPath}", "action": "create", "summary": "new arc from this session" },
    { "path": "${session.filePath}", "action": "patch", "summary": "wiki-link the new arc from the session" }${npcPatches ? `,\n${npcPatches}` : ''}
  ]
}

Rules:
- First step MUST create a new markdown file under ${arcFolder}/
- The create path must not match any existing arc
- Patch the session; optionally patch named NPCs
- Do not invent extra files
- Summaries are one sentence`);

    const plan = parseRecipePlan(raw);
    for (const step of plan.steps) {
      if (step.action !== 'create') continue;
      const safe = uniqueCreatePath(plugin, step.path);
      if (safe !== step.path) step.path = safe;
    }
    hide();
    const involvedNames = involved.map(e => `[[${e.name}]]`).join(', ');
    const result = await runRecipePlan(plugin, plan, ctx, (step, existing) => {
      if (step.action === 'create') {
        return `Create a complete NEW arc note. Do not wrap YAML in a code fence. Start with --- frontmatter.

Path: ${step.path}
Do not reuse these arc names:
${existingArcs || '(none)'}
Session this arc comes from: [[${session.name}]]
${involvedNames ? `Must involve: ${involvedNames}` : ''}
${guidance ? `Guidance: ${guidance}` : ''}

Frontmatter: type: arc, name, status, themes, adventures, tags
Sections: Overview, Key Events, Involved NPCs & Factions, Adventures, Resolution Conditions, Open Threads
Use [[wiki-links]]. Stay true to FOLLOWED NOTES / CURRENT STATE. Do not invent a different job, status, or faction for named NPCs.
Return ONLY the complete markdown file.`;
      }
      return `Patch this existing note with the smallest wiki-link edit that introduces the new arc.

Step: ${step.summary}
Path: ${step.path}
The new arc is created from [[${session.name}]]${involvedNames ? ` and involves ${involvedNames}` : ''}.
Do not rewrite the session recap. Preserve YAML.
Return the ENTIRE file.

Current file:
${existing}`;
    });
    return `**Recipe: add an arc** — from [[${session.name}]]${involvedNames ? ` involving ${involvedNames}` : ''}.\n\n${result}`;
  } catch (err: unknown) {
    hide();
    const msg = err instanceof Error ? err.message : 'unknown';
    return `Recipe failed: ${msg}`;
  }
}

async function runAddLocation(
  plugin: CodexPlugin,
  involved: Entity[],
  guidance: string,
): Promise<string> {
  if (!requireProvider(plugin)) {
    return 'Configure an AI provider in settings first — recipes run through the same BYOK / Cloud path as Lore Chat.';
  }
  const hide = showSpinner('Planning new location…');
  try {
    const seedPaths = involved.map(e => e.filePath);
    let ctx = await assembleRecipeContext(
      plugin,
      `${involved.map(e => e.name).join(' ')} ${guidance}`,
      seedPaths,
    );
    const followed = await readFollowedNotes(
      plugin.app,
      ctx.entities,
      seedPaths,
      { excludedFolders: plugin.settings.aiExcludedFolders },
    );
    ctx = { ...ctx, followedNotes: followed };

    const systemPrompt = buildSystemPrompt(ctx, {
      ruleSystem: plugin.settings.aiRuleSystem,
      campaignTone: plugin.settings.aiCampaignTone,
      language: plugin.settings.aiLanguage,
    });
    const locFolder = ENTITY_FOLDER_MAP.location ?? 'locations';
    const parent = involved.find(e => String(e.type).toLowerCase() === 'location');
    const session = involved.find(e => String(e.type).toLowerCase() === 'session');
    const stemBase = parent?.name ?? session?.name;
    const suggestedPath = uniqueCreatePath(
      plugin,
      stemBase ? `${locFolder}/New Location — ${stemBase}.md` : `${locFolder}/New Location.md`,
    );
    const reserved = locationRoster(plugin);
    const involvedLines = involved.length
      ? involved.map(e => `- [[${e.name}]] (${e.filePath}) type ${e.type}`).join('\n')
      : '(none named)';
    const patchable = involved.filter(e => LOCATION_ANCHOR_TYPES.has(String(e.type).toLowerCase()));
    const patchSteps = patchable
      .slice(0, 6)
      .map(e => `    { "path": "${e.filePath}", "action": "patch", "summary": "wiki-link the new location from ${e.name}" }`)
      .join(',\n');

    const raw = await chatJson(plugin, systemPrompt, `Plan a campaign edit. Do not write file bodies.

Create a NEW location (type: location). Do not rewrite existing places.

Involved / parent notes:
${involvedLines}
${guidance ? `Guidance: ${guidance}` : ''}

Existing locations — do not reuse these names or paths:
${reserved || '(none)'}

Return ONLY JSON:
{
  "title": "short title",
  "steps": [
    { "path": "${suggestedPath}", "action": "create", "summary": "new location for this campaign" }${patchSteps ? `,\n${patchSteps}` : ''}
  ]
}

Rules:
- First step MUST create a new markdown file under ${locFolder}/
- The create path must not match any existing location
- Patch listed parent/session/plot/faction notes only
- Do not invent extra files
- Do not patch NPC notes (mention them in the new location instead)
- Summaries are one sentence`);

    const plan = parseRecipePlan(raw);
    const allowedPatch = new Set(patchable.map(e => e.filePath));
    plan.steps = plan.steps.filter(s =>
      s.action === 'create' || (s.action === 'patch' && allowedPatch.has(s.path)),
    );
    if (!plan.steps.some(s => s.action === 'create')) {
      plan.steps.unshift({
        path: suggestedPath,
        action: 'create',
        summary: 'new location for this campaign',
      });
    }
    for (const step of plan.steps) {
      if (step.action !== 'create') continue;
      const name = fileStem(step.path);
      const desired = step.path.startsWith(`${locFolder}/`)
        ? step.path
        : `${locFolder}/${name}.md`;
      step.path = uniqueCreatePath(plugin, desired);
    }
    hide();
    const involvedNames = involved.map(e => `[[${e.name}]]`).join(', ');
    const result = await runRecipePlan(plugin, plan, ctx, (step, existing) => {
      if (step.action === 'create') {
        return `Create a complete NEW location note. Do not wrap YAML in a code fence. Start with --- frontmatter.

Path: ${step.path}
Do not reuse these location names:
${reserved || '(none)'}
${involvedNames ? `Ground this place in: ${involvedNames}` : ''}
${parent ? `Parent / nearby: [[${parent.name}]]. Set region to that wiki-link when it is a region or containing site.` : ''}
${guidance ? `Guidance: ${guidance}` : ''}

Frontmatter: type: location, name, region, tags
Sections: Description, Key Features / Rooms, Creatures Present, Treasure, Secrets, Plot Hooks
Use [[wiki-links]]. Stay true to FOLLOWED NOTES / CURRENT STATE. Do not invent a different job, status, or faction for named NPCs.
Return ONLY the complete markdown file.`;
      }
      return `Patch this existing note with the smallest wiki-link edit that introduces the new location.

Step: ${step.summary}
Path: ${step.path}
${involvedNames ? `The new location is grounded in ${involvedNames}.` : ''}
${guidance ? `Guidance: ${guidance}` : ''}
Do not rewrite the note. Preserve YAML. Do not change NPC jobs, status, or faction.
Return the ENTIRE file.

Current file:
${existing}`;
    });
    return `**Recipe: add a location**${involvedNames ? ` — ${involvedNames}` : ''}.\n\n${result}`;
  } catch (err: unknown) {
    hide();
    const msg = err instanceof Error ? err.message : 'unknown';
    return `Recipe failed: ${msg}`;
  }
}

async function runNpcAtLocation(
  plugin: CodexPlugin,
  loc: Entity,
  plots: Entity[],
  guidance: string,
): Promise<string> {
  if (!requireProvider(plugin)) {
    return 'Configure an AI provider in settings first — recipes run through the same BYOK / Cloud path as Lore Chat.';
  }
  const hide = showSpinner('Planning NPC recipe…');
  try {
    const seedPaths = [loc.filePath, ...plots.map(p => p.filePath)];
    const ctx = await assembleRecipeContext(
      plugin,
      `${loc.name} ${plots.map(p => p.name).join(' ')} ${guidance}`,
      seedPaths,
    );
    const systemPrompt = buildSystemPrompt(ctx, {
      ruleSystem: plugin.settings.aiRuleSystem,
      campaignTone: plugin.settings.aiCampaignTone,
      language: plugin.settings.aiLanguage,
    });
    const npcFolder = ENTITY_FOLDER_MAP.npc ?? 'npcs';
    const suggestedPath = uniqueCreatePath(plugin, `${npcFolder}/New NPC — ${loc.name}.md`);
    const reserved = npcRoster(plugin);
    const plotLines = plots.map(p => `- [[${p.name}]] (${p.filePath}) type ${p.type}`).join('\n');
    const plotPatchSteps = plots.map(p =>
      `    { "path": "${p.filePath}", "action": "patch", "summary": "wire the NPC into ${p.name}" }`,
    ).join(',\n');
    const plotNames = plots.map(p => `[[${p.name}]]`).join(' and ');

    const raw = await chatJson(plugin, systemPrompt, `Plan a campaign edit. Do not write file bodies.

Location: [[${loc.name}]] (${loc.filePath})
Plots:
${plotLines}
${guidance ? `Guidance: ${guidance}` : ''}

Existing NPCs — do not reuse these names or paths:
${reserved || '(none)'}

Return ONLY JSON:
{
  "title": "short title",
  "steps": [
    { "path": "${suggestedPath}", "action": "create", "summary": "new NPC grounded at this location" },
    { "path": "${loc.filePath}", "action": "patch", "summary": "wiki-link the NPC into the location" },
${plotPatchSteps}
  ]
}

Rules:
- First step MUST create a NEW NPC markdown under ${npcFolder}/
- The create path must not match any existing NPC name or file
- Remaining steps MUST patch the location and the listed plots
- Do not invent extra files
- Summaries are one sentence`);

    const plan = parseRecipePlan(raw);
    for (const step of plan.steps) {
      if (step.action !== 'create') continue;
      const safe = uniqueCreatePath(plugin, step.path);
      if (safe !== step.path) step.path = safe;
    }
    hide();
    const result = await runRecipePlan(plugin, plan, ctx, (step, existing) => {
      if (step.action === 'create') {
        return `Create a complete NEW NPC note for this campaign. Do not rewrite an existing character.

Path: ${step.path}
File name / frontmatter name must be a new person, not any of:
${reserved || '(none)'}
Summary: ${step.summary}
Location (must set location: "[[${loc.name}]]"): [[${loc.name}]]
Wire them into ${plotNames}.
${guidance ? `Guidance: ${guidance}` : ''}

Frontmatter: type, name, status, location, faction, cr, tags
Sections: Description, Personality, Background, Secrets, Relationships, Plot Hooks
Use [[wiki-links]]. Do not contradict CURRENT STATE / frontmatter of existing entities.
Return ONLY the complete markdown file.`;
      }
      return `Patch this existing note with the smallest wiki-link edit that introduces the new NPC from the plan.

Step: ${step.summary}
Path: ${step.path}
The NPC belongs at [[${loc.name}]] and in ${plotNames}.
Do not rewrite the adventure. Do not change unrelated canon. Preserve YAML.
Return the ENTIRE file.

Current file:
${existing}`;
    });
    return `**Recipe: NPC at this location** — [[${loc.name}]] into ${plotNames}.\n\n${result}`;
  } catch (err: unknown) {
    hide();
    const msg = err instanceof Error ? err.message : 'unknown';
    return `Recipe failed: ${msg}`;
  }
}

async function runAdvancePlots(plugin: CodexPlugin, session: Entity): Promise<string> {
  if (!requireProvider(plugin)) {
    return 'Configure an AI provider in settings first — recipes run through the same BYOK / Cloud path as Lore Chat.';
  }
  const plots = plotsLinkedFrom(plugin, session);
  if (plots.length === 0) {
    return `[[${session.name}]] does not link an adventure, quest, or arc, so there is nothing to advance.`;
  }

  const hide = showSpinner('Planning plot updates…');
  try {
    const seedPaths = [session.filePath, ...plots.map(p => p.filePath)];
    const ctx = await assembleRecipeContext(
      plugin,
      `${session.name} ${plots.map(p => p.name).join(' ')}`,
      seedPaths,
    );
    const systemPrompt = buildSystemPrompt(ctx, {
      ruleSystem: plugin.settings.aiRuleSystem,
      campaignTone: plugin.settings.aiCampaignTone,
      language: plugin.settings.aiLanguage,
    });
    const plotLines = plots.map(p => `- ${p.filePath} ([[${p.name}]], ${p.type})`).join('\n');
    const raw = await chatJson(plugin, systemPrompt, `Plan patches so plot notes match what this session already established. Do not write file bodies.

Session: [[${session.name}]] (${session.filePath})
Linked plots:
${plotLines}

Return ONLY JSON:
{
  "title": "short title",
  "steps": [
    { "path": "adventures/Example.md", "action": "patch", "summary": "what to update" }
  ]
}

Rules:
- Only patch existing linked plot paths listed above (and optionally one NPC whose status the session changed)
- action must be "patch" — do not create files
- Do not mark living NPCs dead, or list dead NPCs as present
- Summaries are one sentence
- Skip a plot if the session did not change it`);

    const plan = parseRecipePlan(raw);
    hide();
    const allowed = new Set(plots.map(p => p.filePath));
    plan.steps = plan.steps.filter(s => s.action === 'patch' && (
      allowed.has(s.path) || plugin.registry.getByPath(s.path)?.type === 'npc'
    ));
    if (plan.steps.length === 0) {
      return 'The plan had no allowed patches for this session.';
    }

    const result = await runRecipePlan(plugin, plan, ctx, (step, existing) => `Patch this note so it matches the session — not stale prep.

Session: [[${session.name}]]
Step: ${step.summary}
Path: ${step.path}

Rules:
- Smallest edit that records what already happened at the table
- Frontmatter status is canon when present; do not resurrect dead NPCs as present
- Preserve YAML and unrelated sections
- Return the ENTIRE file

Current file:
${existing}`);
    return `**Recipe: advance plots** — from [[${session.name}]].\n\n${result}`;
  } catch (err: unknown) {
    hide();
    const msg = err instanceof Error ? err.message : 'unknown';
    return `Recipe failed: ${msg}`;
  }
}
