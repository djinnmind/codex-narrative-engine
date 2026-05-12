import type { Entity, EntityType } from '@codex-ide/core';
import type { EntityRegistry } from '@codex-ide/core';

const TYPE_ICONS: Record<string, string> = {
  npc: '\u{1F464}',
  creature: '\u{1F409}',
  location: '\u{1F3F0}',
  faction: '\u2694\uFE0F',
  item: '\u{1F5E1}\uFE0F',
  session: '\u{1F4DC}',
  quest: '\u2757',
  arc: '\u{1F4D6}',
  adventure: '\u{1F5FA}\uFE0F',
  event: '\u26A1',
  world: '\u{1F30D}',
  rules: '\u{1F4CF}',
  handout: '\u{1F4E8}',
  custom: '\u{1F4C4}',
};

const MAX_ITEMS = 8;

interface TriggerState {
  type: '@' | '[[';
  start: number;
  query: string;
}

export class ChatSuggest {
  private textarea: HTMLTextAreaElement;
  private registry: EntityRegistry;
  private dropdownEl: HTMLDivElement | null = null;
  private items: Entity[] = [];
  private selectedIndex = 0;
  private trigger: TriggerState | null = null;

  private handleInput: () => void;
  private handleKeydown: (e: KeyboardEvent) => void;
  private handleBlur: () => void;

  constructor(textarea: HTMLTextAreaElement, registry: EntityRegistry) {
    this.textarea = textarea;
    this.registry = registry;

    this.handleInput = () => this.onInput();
    this.handleKeydown = (e: KeyboardEvent) => this.onKeydown(e);
    this.handleBlur = () => {
      setTimeout(() => this.dismiss(), 150);
    };

    this.textarea.addEventListener('input', this.handleInput);
    this.textarea.addEventListener('keydown', this.handleKeydown);
    this.textarea.addEventListener('blur', this.handleBlur);
  }

  get isOpen(): boolean {
    return this.dropdownEl !== null;
  }

  destroy(): void {
    this.textarea.removeEventListener('input', this.handleInput);
    this.textarea.removeEventListener('keydown', this.handleKeydown);
    this.textarea.removeEventListener('blur', this.handleBlur);
    this.dismiss();
  }

  private onInput(): void {
    const cursorPos = this.textarea.selectionStart;
    const text = this.textarea.value.slice(0, cursorPos);

    const trigger = this.detectTrigger(text);
    if (!trigger) {
      this.dismiss();
      return;
    }

    this.trigger = trigger;

    let query = trigger.query;
    let typeFilter: EntityType | undefined;
    if (query.includes(':')) {
      const colonIdx = query.indexOf(':');
      const possibleType = query.slice(0, colonIdx).toLowerCase();
      const testResults = this.registry.suggest('', possibleType as EntityType);
      if (testResults.length > 0 || possibleType === 'npc') {
        typeFilter = possibleType as EntityType;
        query = query.slice(colonIdx + 1);
      }
    }

    this.items = this.registry.suggest(query, typeFilter).slice(0, MAX_ITEMS);
    this.selectedIndex = 0;

    if (this.items.length === 0) {
      this.dismiss();
      return;
    }

    this.showDropdown();
  }

  private detectTrigger(textBeforeCursor: string): TriggerState | null {
    const lastAt = textBeforeCursor.lastIndexOf('@');
    const lastBrackets = textBeforeCursor.lastIndexOf('[[');

    if (lastAt === -1 && lastBrackets === -1) return null;

    if (lastBrackets > lastAt) {
      const query = textBeforeCursor.slice(lastBrackets + 2);
      if (query.includes(']]') || query.includes('\n')) return null;
      return { type: '[[', start: lastBrackets, query };
    }

    if (lastAt >= 0) {
      if (lastAt > 0 && /\w/.test(textBeforeCursor[lastAt - 1])) return null;
      const query = textBeforeCursor.slice(lastAt + 1);
      if (query.includes(' ') && query.split(' ').length > 4) return null;
      if (query.includes('\n')) return null;
      return { type: '@', start: lastAt, query };
    }

    return null;
  }

  private showDropdown(): void {
    if (!this.dropdownEl) {
      this.dropdownEl = document.createElement('div');
      this.dropdownEl.classList.add('codex-chat-suggest');
      this.textarea.parentElement!.appendChild(this.dropdownEl);
    }

    this.dropdownEl.empty();

    for (let i = 0; i < this.items.length; i++) {
      const entity = this.items[i];
      const row = this.dropdownEl.createDiv({
        cls: `codex-chat-suggest-item${i === this.selectedIndex ? ' is-selected' : ''}`,
      });

      row.createSpan({
        cls: 'codex-chat-suggest-icon',
        text: TYPE_ICONS[entity.type] ?? '\u{1F4C4}',
      });

      const info = row.createDiv({ cls: 'codex-chat-suggest-info' });
      info.createSpan({ cls: 'codex-chat-suggest-name', text: entity.name });
      info.createSpan({ cls: 'codex-chat-suggest-type', text: entity.type });

      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.selectedIndex = i;
        this.acceptSelection();
      });

      row.addEventListener('mouseenter', () => {
        this.selectedIndex = i;
        this.updateSelection();
      });
    }
  }

  private updateSelection(): void {
    if (!this.dropdownEl) return;
    const rows = this.dropdownEl.querySelectorAll('.codex-chat-suggest-item');
    rows.forEach((row, i) => {
      row.classList.toggle('is-selected', i === this.selectedIndex);
    });
  }

  private onKeydown(e: KeyboardEvent): void {
    if (!this.isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
        this.updateSelection();
        this.scrollToSelected();
        break;

      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
        this.updateSelection();
        this.scrollToSelected();
        break;

      case 'Enter':
      case 'Tab':
        e.preventDefault();
        e.stopPropagation();
        this.acceptSelection();
        break;

      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.dismiss();
        break;
    }
  }

  private scrollToSelected(): void {
    if (!this.dropdownEl) return;
    const rows = this.dropdownEl.querySelectorAll('.codex-chat-suggest-item');
    const selected = rows[this.selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }

  private acceptSelection(): void {
    if (!this.trigger || this.items.length === 0) return;

    const entity = this.items[this.selectedIndex];
    const value = this.textarea.value;
    const cursorPos = this.textarea.selectionStart;

    let insertText: string;
    let replaceStart: number;

    if (this.trigger.type === '[[') {
      insertText = `[[${entity.name}]]`;
      replaceStart = this.trigger.start;
    } else {
      insertText = entity.name;
      replaceStart = this.trigger.start;
    }

    const before = value.slice(0, replaceStart);
    const after = value.slice(cursorPos);
    const newValue = before + insertText + ' ' + after;
    const newCursor = before.length + insertText.length + 1;

    this.textarea.value = newValue;
    this.textarea.selectionStart = newCursor;
    this.textarea.selectionEnd = newCursor;
    this.textarea.focus();

    this.dismiss();
    this.textarea.dispatchEvent(new Event('input'));
  }

  dismiss(): void {
    if (this.dropdownEl) {
      this.dropdownEl.remove();
      this.dropdownEl = null;
    }
    this.trigger = null;
    this.items = [];
    this.selectedIndex = 0;
  }
}
