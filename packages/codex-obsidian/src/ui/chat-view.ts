import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer, TFile, Menu } from 'obsidian';
import type CodexPlugin from '../main';
import type { ChatMessage } from '@codex-ide/core';
import { buildSystemPrompt } from '@codex-ide/core';
import { extractMarkdown, extractNameFromContent, extractTypeFromContent, hasFrontmatter, ENTITY_FOLDER_MAP } from '../util/ai-helpers';
import { proposeEdit } from './diff-review-modal';

export const CHAT_VIEW_TYPE = 'codex-lore-chat';

const CHAT_FOLDER = '_codex/chats';

/** Strip YAML frontmatter for display so MarkdownRenderer doesn't render it as Properties. */
function stripFrontmatterForDisplay(content: string): string {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) return content;
  const endIdx = trimmed.indexOf('\n---', 3);
  if (endIdx < 0) return content;
  return trimmed.slice(endIdx + 4).trimStart();
}

/**
 * Detect informal frontmatter-like headers at the top of AI responses and
 * convert them to proper YAML frontmatter. Handles both bare lines and lines
 * inside a leading code fence:
 *
 *   Entity Name: The Lockdown        ```yaml
 *   Type: Adventure                   Entity Name: The Lockdown
 *   Tags: urban, stealth             Type: Adventure
 *                                     ```
 */
const INFORMAL_FIELD_MAP: Record<string, string> = {
  'entity name': 'name',
  'name': 'name',
  'type': 'type',
  'tags': 'tags',
  'status': 'status',
  'location': 'location',
  'faction': 'faction',
  'level range': 'level_range',
  'level_range': 'level_range',
  'cr': 'cr',
  'party': 'party',
  'setting': 'setting',
};

function tryParseInformalFields(lines: string[]): { fields: Record<string, string>; consumed: number } {
  const fields: Record<string, string> = {};
  let consumed = 0;

  for (const line of lines) {
    if (line.trim() === '') { consumed++; continue; }
    const match = line.match(/^([A-Za-z][A-Za-z _]*?)\s*:\s*(.+)$/);
    if (!match) break;

    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    const mapped = INFORMAL_FIELD_MAP[key];
    if (!mapped) break;

    fields[mapped] = value;
    consumed++;
  }

  return { fields, consumed };
}

function buildYamlFrontmatter(fields: Record<string, string>): string {
  const yamlLines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'tags') {
      const tags = v.split(',').map(t => t.trim()).filter(Boolean);
      yamlLines.push(`${k}: [${tags.join(', ')}]`);
    } else if (v.includes(':') || v.includes('"') || v.includes("'")) {
      yamlLines.push(`${k}: "${v.replace(/"/g, '\\"')}"`);
    } else {
      yamlLines.push(`${k}: "${v}"`);
    }
  }
  yamlLines.push('---');
  return yamlLines.join('\n');
}

function normalizeInformalFrontmatter(content: string): string {
  if (hasFrontmatter(content)) return content;

  const lines = content.split('\n');

  // Case 1: leading code fence wrapping informal fields (```yaml ... ```)
  const fenceMatch = lines[0]?.match(/^```\w*\s*$/);
  if (fenceMatch) {
    const fenceEndIdx = lines.indexOf('```', 1);
    if (fenceEndIdx > 0) {
      const innerLines = lines.slice(1, fenceEndIdx);
      const { fields } = tryParseInformalFields(innerLines);
      if (fields['type'] && Object.keys(fields).length >= 2) {
        const remainder = lines.slice(fenceEndIdx + 1).join('\n').trimStart();
        return buildYamlFrontmatter(fields) + '\n\n' + remainder;
      }
    }
  }

  // Case 2: bare informal fields at top of content
  const { fields, consumed } = tryParseInformalFields(lines);
  if (fields['type'] && Object.keys(fields).length >= 2) {
    const remainder = lines.slice(consumed).join('\n').trimStart();
    return buildYamlFrontmatter(fields) + '\n\n' + remainder;
  }

  return content;
}

// ---------------------------------------------------------------------------
// Thread model
// ---------------------------------------------------------------------------

interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  created: number;
  updated: number;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function threadFileName(thread: ChatThread): string {
  return `${CHAT_FOLDER}/${thread.id}.json`;
}

function autoTitle(messages: ChatMessage[]): string {
  const first = messages.find(m => m.role === 'user');
  if (!first) return 'New Chat';
  const text = first.content.trim();
  if (text.length <= 40) return text;
  return text.slice(0, 37) + '…';
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export class LoreChatView extends ItemView {
  private plugin: CodexPlugin;
  private threads: ChatThread[] = [];
  private activeThreadId: string | null = null;
  private messages: ChatMessage[] = [];
  private inputEl!: HTMLTextAreaElement;
  private messagesEl!: HTMLElement;
  private sendBtn!: HTMLButtonElement;
  private threadListEl!: HTMLElement;
  private threadTitleEl!: HTMLElement;
  private threadDrawerOpen = false;
  private isGenerating = false;

  constructor(leaf: WorkspaceLeaf, plugin: CodexPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return CHAT_VIEW_TYPE; }
  getDisplayText(): string { return 'Lore chat'; }
  getIcon(): string { return 'message-square'; }

  async onOpen(): Promise<void> {
    await this.migrateOldHistory();
    await this.loadThreads();
    if (this.threads.length > 0) {
      await this.switchThread(this.threads[0].id);
    }
    this.buildUI();
    this.renderMessages();
    this.renderThreadList();
  }

  async onClose(): Promise<void> {
    await this.saveCurrentThread();
    this.contentEl.empty();
  }

  // -----------------------------------------------------------------------
  // Thread persistence — stored as JSON files in _codex/chats/
  // -----------------------------------------------------------------------

  private async ensureChatFolder(): Promise<void> {
    if (!this.app.vault.getAbstractFileByPath(CHAT_FOLDER)) {
      await this.app.vault.createFolder(CHAT_FOLDER);
    }
  }

  private async loadThreads(): Promise<void> {
    this.threads = [];
    const folder = this.app.vault.getAbstractFileByPath(CHAT_FOLDER);
    if (!folder || !('children' in folder)) return;

    for (const child of (folder as { children: TFile[] }).children) {
      if (!(child instanceof TFile) || child.extension !== 'json') continue;
      try {
        const raw = await this.app.vault.read(child);
        const data = JSON.parse(raw) as ChatThread;
        if (data.id && data.messages) {
          this.threads.push(data);
        }
      } catch { /* skip corrupt files */ }
    }

    this.threads.sort((a, b) => b.updated - a.updated);
  }

  private async saveThread(thread: ChatThread): Promise<void> {
    await this.ensureChatFolder();
    const path = threadFileName(thread);
    const content = JSON.stringify(thread, null, 2);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }
  }

  private async deleteThread(thread: ChatThread): Promise<void> {
    const path = threadFileName(thread);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.vault.delete(file);
    }
  }

  private async saveCurrentThread(): Promise<void> {
    const thread = this.getActiveThread();
    if (!thread) return;
    thread.messages = this.messages;
    thread.updated = Date.now();
    if (thread.title === 'New Chat') {
      thread.title = autoTitle(this.messages);
    }
    await this.saveThread(thread);
  }

  private getActiveThread(): ChatThread | undefined {
    return this.threads.find(t => t.id === this.activeThreadId);
  }

  private async switchThread(id: string): Promise<void> {
    await this.saveCurrentThread();
    this.activeThreadId = id;
    const thread = this.getActiveThread();
    this.messages = thread ? [...thread.messages] : [];
  }

  private async migrateOldHistory(): Promise<void> {
    try {
      const data = await this.plugin.loadData();
      const chat = data?.chatHistory as { messages?: ChatMessage[] } | undefined;
      if (chat?.messages && chat.messages.length > 0) {
        await this.ensureChatFolder();
        const thread: ChatThread = {
          id: generateId(),
          title: autoTitle(chat.messages),
          messages: chat.messages,
          created: Date.now(),
          updated: Date.now(),
        };
        await this.saveThread(thread);
        delete data.chatHistory;
        await this.plugin.saveData(data);
      }
    } catch { /* ignore migration errors */ }
  }

  // -----------------------------------------------------------------------
  // UI
  // -----------------------------------------------------------------------

  private buildUI(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass('codex-chat-panel');

    const header = container.createDiv({ cls: 'codex-chat-header' });

    const leftGroup = header.createDiv({ cls: 'codex-chat-header-left' });

    const drawerToggle = leftGroup.createEl('button', {
      cls: 'codex-chat-drawer-toggle',
      attr: { 'aria-label': 'Toggle chat list' },
    });
    drawerToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>';
    drawerToggle.addEventListener('click', () => this.toggleDrawer());

    this.threadTitleEl = leftGroup.createSpan({ cls: 'codex-chat-title' });
    this.updateThreadTitleDisplay();

    const headerActions = header.createDiv({ cls: 'codex-chat-header-actions' });

    const newBtn = headerActions.createEl('button', {
      cls: 'codex-chat-header-btn',
      attr: { 'aria-label': 'New chat' },
    });
    newBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    newBtn.addEventListener('click', () => { void this.createNewThread(); });

    this.threadListEl = container.createDiv({ cls: 'codex-chat-thread-list' });

    this.messagesEl = container.createDiv({ cls: 'codex-chat-messages' });

    const inputArea = container.createDiv({ cls: 'codex-chat-input-area' });

    this.inputEl = inputArea.createEl('textarea', {
      cls: 'codex-chat-input',
      attr: { placeholder: 'Ask about your world...', rows: '3' },
    });

    this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.handleSend();
      }
    });

    const inputFooter = inputArea.createDiv({ cls: 'codex-chat-input-footer' });

    const contextHint = inputFooter.createSpan({ cls: 'codex-chat-context-hint' });
    const entityCount = this.plugin.registry.size;
    contextHint.setText(`${entityCount} entities indexed`);

    this.sendBtn = inputFooter.createEl('button', {
      cls: 'codex-chat-send-btn',
      text: 'Send',
    });
    this.sendBtn.addEventListener('click', () => { void this.handleSend(); });
  }

  private updateThreadTitleDisplay(): void {
    if (!this.threadTitleEl) return;
    const thread = this.getActiveThread();
    this.threadTitleEl.setText(thread?.title ?? 'Lore Chat');
  }

  // -----------------------------------------------------------------------
  // Thread drawer
  // -----------------------------------------------------------------------

  private toggleDrawer(): void {
    this.threadDrawerOpen = !this.threadDrawerOpen;
    this.threadListEl.toggleClass('codex-chat-thread-list-open', this.threadDrawerOpen);
    if (this.threadDrawerOpen) {
      this.renderThreadList();
    }
  }

  private renderThreadList(): void {
    this.threadListEl.empty();
    if (!this.threadDrawerOpen) return;

    for (const thread of this.threads) {
      const row = this.threadListEl.createDiv({
        cls: `codex-chat-thread-item ${thread.id === this.activeThreadId ? 'codex-chat-thread-active' : ''}`,
      });

      const titleSpan = row.createSpan({
        cls: 'codex-chat-thread-item-title',
        text: thread.title,
      });
      titleSpan.addEventListener('click', () => {
        void this.handleThreadSwitch(thread.id);
      });

      const msgCount = thread.messages.filter(m => m.role !== 'system').length;
      row.createSpan({
        cls: 'codex-chat-thread-item-count',
        text: `${msgCount}`,
      });

      const menuBtn = row.createEl('button', {
        cls: 'codex-chat-thread-menu-btn',
        attr: { 'aria-label': 'Thread options' },
      });
      menuBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>';
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showThreadMenu(thread, menuBtn);
      });
    }
  }

  private showThreadMenu(thread: ChatThread, anchor: HTMLElement): void {
    const menu = new Menu();

    menu.addItem((item) =>
      item.setTitle('Rename').setIcon('pencil').onClick(() => {
        void this.renameThread(thread);
      }),
    );

    menu.addItem((item) =>
      item.setTitle('Delete').setIcon('trash').onClick(() => {
        void this.handleDeleteThread(thread);
      }),
    );

    const rect = anchor.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom });
  }

  private async handleThreadSwitch(id: string): Promise<void> {
    if (id === this.activeThreadId) return;
    await this.switchThread(id);
    this.renderMessages();
    this.renderThreadList();
    this.updateThreadTitleDisplay();
    this.scrollToBottom();
  }

  private async createNewThread(): Promise<void> {
    await this.saveCurrentThread();

    const thread: ChatThread = {
      id: generateId(),
      title: 'New Chat',
      messages: [],
      created: Date.now(),
      updated: Date.now(),
    };
    this.threads.unshift(thread);
    await this.saveThread(thread);

    this.activeThreadId = thread.id;
    this.messages = [];
    this.renderMessages();
    this.renderThreadList();
    this.updateThreadTitleDisplay();
    this.inputEl.focus();
  }

  private async renameThread(thread: ChatThread): Promise<void> {
    const newTitle = prompt('Rename chat thread:', thread.title);
    if (!newTitle || newTitle.trim() === '' || newTitle === thread.title) return;
    thread.title = newTitle.trim();
    thread.updated = Date.now();
    await this.saveThread(thread);
    this.renderThreadList();
    this.updateThreadTitleDisplay();
  }

  private async handleDeleteThread(thread: ChatThread): Promise<void> {
    if (!confirm(`Delete "${thread.title}"? This cannot be undone.`)) return;

    await this.deleteThread(thread);
    this.threads = this.threads.filter(t => t.id !== thread.id);

    if (thread.id === this.activeThreadId) {
      if (this.threads.length > 0) {
        await this.switchThread(this.threads[0].id);
      } else {
        await this.createNewThread();
        return;
      }
    }

    this.renderMessages();
    this.renderThreadList();
    this.updateThreadTitleDisplay();
  }

  // -----------------------------------------------------------------------
  // Sending
  // -----------------------------------------------------------------------

  private async handleSend(isRegenerate = false): Promise<void> {
    if (!isRegenerate) {
      const text = this.inputEl.value.trim();
      if (!text || this.isGenerating) return;

      if (!this.activeThreadId) {
        await this.createNewThread();
      }

      this.messages.push({ role: 'user', content: text });
      this.inputEl.value = '';
      this.renderMessages();
      this.scrollToBottom();
    }

    if (this.isGenerating) return;

    const lastUserMsg = [...this.messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    const provider = this.plugin.getProvider();
    if (!provider) {
      new Notice('Codex: configure an AI provider in settings first.');
      return;
    }

    this.isGenerating = true;
    this.sendBtn.disabled = true;
    this.sendBtn.setText('...');

    const thinkingEl = this.messagesEl.createDiv({ cls: 'codex-chat-message codex-chat-assistant' });
    thinkingEl.createDiv({ cls: 'codex-chat-thinking', text: 'Thinking...' });
    this.scrollToBottom();

    try {
      console.debug('Codex Chat: assembling context...');
      const context = this.plugin.contextAssembler.assemble(lastUserMsg.content);
      console.debug(`Codex Chat: context has ${context.entities.length} entities`);

      const systemPrompt = buildSystemPrompt(context, {
        ruleSystem: this.plugin.settings.aiRuleSystem,
        campaignTone: this.plugin.settings.aiCampaignTone,
        language: this.plugin.settings.aiLanguage,
      });
      console.debug(`Codex Chat: system prompt is ${systemPrompt.length} chars`);

      const msgs = this.messages.filter(m => m.role !== 'system');
      console.debug(`Codex Chat: sending ${msgs.length} messages to provider...`);

      const response = await provider.chat({
        systemPrompt,
        messages: msgs,
        context,
        temperature: this.plugin.settings.aiTemperature,
      });

      console.debug(`Codex Chat: got response (${response.content.length} chars)`);
      thinkingEl.remove();

      this.messages.push({ role: 'assistant', content: response.content });

      const thread = this.getActiveThread();
      if (thread && thread.title === 'New Chat') {
        thread.title = autoTitle(this.messages);
        this.updateThreadTitleDisplay();
        this.renderThreadList();
      }

      this.renderMessages();
      this.scrollToBottom();
      await this.saveCurrentThread();
    } catch (err: unknown) {
      console.error('Codex Chat: error', err);
      thinkingEl.remove();
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      new Notice(`Codex AI error: ${errMsg}`);

      this.messages.push({
        role: 'assistant',
        content: `*Error: ${errMsg}*`,
      });
      this.renderMessages();
    } finally {
      this.isGenerating = false;
      this.sendBtn.disabled = false;
      this.sendBtn.setText('Send');
    }
  }

  // -----------------------------------------------------------------------
  // Message rendering
  // -----------------------------------------------------------------------

  private renderMessages(): void {
    this.messagesEl.empty();

    if (this.messages.length === 0) {
      const empty = this.messagesEl.createDiv({ cls: 'codex-chat-empty' });
      empty.createEl('div', { text: '\u{1F3B2}', cls: 'codex-chat-empty-icon' });
      empty.createEl('p', { text: 'Ask anything about your world.' });
      empty.createEl('p', {
        text: 'Your vault\'s entities, sessions, and lore are used as context.',
        cls: 'codex-chat-empty-hint',
      });

      const examples = empty.createDiv({ cls: 'codex-chat-examples' });
      const exampleQueries = [
        'What does my party know about the cult?',
        'Generate a shopkeeper NPC for the market district',
        'Summarize last session\'s key events',
        'What plot hooks are still unresolved?',
      ];
      for (const q of exampleQueries) {
        const ex = examples.createDiv({ cls: 'codex-chat-example', text: q });
        ex.addEventListener('click', () => {
          this.inputEl.value = q;
          this.inputEl.focus();
        });
      }
      return;
    }

    const visibleMessages = this.messages.filter(m => m.role !== 'system');

    for (let i = 0; i < visibleMessages.length; i++) {
      const msg = visibleMessages[i];
      const msgIdx = this.messages.indexOf(msg);

      const msgEl = this.messagesEl.createDiv({
        cls: `codex-chat-message codex-chat-${msg.role}`,
      });

      const roleLabel = msg.role === 'user' ? 'You' : 'Codex';
      msgEl.createDiv({ cls: 'codex-chat-role', text: roleLabel });

      const contentEl = msgEl.createDiv({ cls: 'codex-chat-content' });

      if (msg.role === 'assistant') {
        const displayContent = stripFrontmatterForDisplay(
          normalizeInformalFrontmatter(msg.content),
        );
        void MarkdownRenderer.render(
          this.app,
          displayContent,
          contentEl,
          '',
          this,
        );
        const isLastAssistant = i === visibleMessages.length - 1;
        this.addActionBar(msgEl, msg.content, isLastAssistant ? msgIdx : -1);
      } else {
        contentEl.setText(msg.content);
        this.addUserActionBar(msgEl, msg.content, msgIdx);
      }
    }
  }

  private addActionBar(msgEl: HTMLElement, rawContent: string, regenerateIdx: number): void {
    const md = normalizeInformalFrontmatter(extractMarkdown(rawContent));
    const hasNote = hasFrontmatter(md);
    const activeFile = this.app.workspace.getActiveFile();
    const isSubstantial = rawContent.trim().length > 100;

    const bar = msgEl.createDiv({ cls: 'codex-chat-actions' });

    if (regenerateIdx >= 0) {
      const regenBtn = bar.createEl('button', {
        cls: 'codex-chat-action-btn',
        text: '\u21BB Regenerate',
        attr: { 'aria-label': 'Generate a different response' },
      });
      regenBtn.addEventListener('click', () => {
        this.messages.splice(regenerateIdx, 1);
        void this.saveCurrentThread();
        this.renderMessages();
        void this.handleSend(true);
      });
    }

    if (hasNote) {
      const name = extractNameFromContent(md);
      const saveBtn = bar.createEl('button', {
        cls: 'codex-chat-action-btn',
        text: name ? `Save "${name}"` : 'Save as Note',
        attr: { 'aria-label': 'Create a new note from this response' },
      });
      saveBtn.addEventListener('click', () => { void this.handleSaveAsNote(md); });
    } else if (isSubstantial) {
      const saveBtn = bar.createEl('button', {
        cls: 'codex-chat-action-btn',
        text: 'Save as Note',
        attr: { 'aria-label': 'Save this response as a new note' },
      });
      saveBtn.addEventListener('click', () => { void this.handleSaveAsNote(md); });
    }

    if (hasNote && activeFile) {
      const applyBtn = bar.createEl('button', {
        cls: 'codex-chat-action-btn',
        text: `Apply to ${activeFile.basename}`,
        attr: { 'aria-label': 'Apply changes to the currently open note' },
      });
      applyBtn.addEventListener('click', () => { void this.handleApplyToNote(md, activeFile); });
    }

    const copyBtn = bar.createEl('button', {
      cls: 'codex-chat-action-btn codex-chat-action-copy',
      text: 'Copy',
      attr: { 'aria-label': 'Copy response to clipboard' },
    });
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard.writeText(rawContent).then(() => {
        copyBtn.setText('Copied!');
        setTimeout(() => copyBtn.setText('Copy'), 1500);
      });
    });
  }

  private addUserActionBar(msgEl: HTMLElement, content: string, msgIdx: number): void {
    const bar = msgEl.createDiv({ cls: 'codex-chat-actions' });

    const editBtn = bar.createEl('button', {
      cls: 'codex-chat-action-btn',
      text: '\u270E Edit',
      attr: { 'aria-label': 'Edit this message and re-send' },
    });
    editBtn.addEventListener('click', () => {
      this.messages.splice(msgIdx);
      this.inputEl.value = content;
      this.inputEl.focus();
      void this.saveCurrentThread();
      this.renderMessages();
    });
  }

  // -----------------------------------------------------------------------
  // Note actions
  // -----------------------------------------------------------------------

  private async handleSaveAsNote(content: string): Promise<void> {
    const normalized = normalizeInformalFrontmatter(content);
    let name = extractNameFromContent(normalized);
    if (!name) {
      const firstHeading = content.match(/^##?\s+(.+)$/m);
      name = firstHeading?.[1]?.trim() ?? null;
    }
    if (!name) {
      const input = prompt('Note name:', 'New Note');
      if (!input || input.trim() === '') return;
      name = input.trim();
    }
    const safeName = name.replace(/[\\/:*?"<>|]/g, '');
    const type = extractTypeFromContent(normalized);
    const folder = (type && ENTITY_FOLDER_MAP[type]) || '';

    if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }

    let filePath = folder ? `${folder}/${safeName}.md` : `${safeName}.md`;
    if (this.app.vault.getAbstractFileByPath(filePath)) {
      filePath = folder
        ? `${folder}/${safeName} ${Date.now()}.md`
        : `${safeName} ${Date.now()}.md`;
    }

    const newFile = await this.app.vault.create(filePath, normalized);
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(newFile);
    new Notice(`Codex: Created ${safeName}`);

    this.plugin.registry.clear();
    await this.plugin.vaultAdapter.fullIndex();
    this.plugin.refreshWarningsView();
  }

  private async handleApplyToNote(content: string, file: TFile): Promise<void> {
    const accepted = await proposeEdit(this.plugin, file, content, 'Lore Chat');
    if (accepted) {
      this.plugin.registry.clear();
      await this.plugin.vaultAdapter.fullIndex();
      this.plugin.refreshWarningsView();
    }
  }

  private scrollToBottom(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}
