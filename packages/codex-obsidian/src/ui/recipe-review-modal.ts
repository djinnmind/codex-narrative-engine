import { Modal } from 'obsidian';
import type { RecipeStep } from '@codex-ide/core';
import type CodexPlugin from '../main';
import { diffCounts, renderDiffBody } from './diff-render';
import { installResizableModal } from './resizable-modal';

export interface RecipeDraft {
  step: RecipeStep;
  oldContent: string;
  newContent: string;
  additions: number;
  removals: number;
}

export function buildRecipeDraft(step: RecipeStep, oldContent: string, newContent: string): RecipeDraft {
  const { additions, removals } = diffCounts(oldContent, newContent);
  return { step, oldContent, newContent, additions, removals };
}

/**
 * One window: file list + selected unified diff. Returns checked drafts, or
 * null if the user rejects / closes.
 */
export function openRecipeReview(
  plugin: CodexPlugin,
  title: string,
  drafts: RecipeDraft[],
): Promise<RecipeDraft[] | null> {
  const modal = new RecipeReviewModal(plugin, title, drafts);
  modal.open();
  return modal.result;
}

class RecipeReviewModal extends Modal {
  private selected = 0;
  private checked: Set<number>;
  private resolved = false;
  private onResolve: (drafts: RecipeDraft[] | null) => void = () => {};
  private uninstallResize: (() => void) | null = null;
  private listEl: HTMLElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private applyBtn: HTMLButtonElement | null = null;

  constructor(
    plugin: CodexPlugin,
    private heading: string,
    private drafts: RecipeDraft[],
  ) {
    super(plugin.app);
    this.checked = new Set(drafts.map((_, i) => i));
  }

  readonly result = new Promise<RecipeDraft[] | null>(resolve => {
    this.onResolve = resolve;
  });

  onOpen(): void {
    this.uninstallResize = installResizableModal(this.modalEl, {
      storageKey: 'codex-recipe-review-modal-size',
      defaultMaxWidth: 1100,
      defaultMaxHeight: 780,
    });

    const { contentEl } = this;
    contentEl.addClass('codex-recipe-review');
    contentEl.createEl('h3', { text: this.heading });
    contentEl.createEl('p', {
      text: 'Review every file, then apply the ones still checked.',
      cls: 'codex-extract-summary',
    });

    const split = contentEl.createDiv({ cls: 'codex-recipe-review-split' });
    this.listEl = split.createDiv({ cls: 'codex-recipe-review-list' });
    const main = split.createDiv({ cls: 'codex-recipe-review-main' });
    this.summaryEl = main.createDiv({ cls: 'codex-diff-summary' });
    this.bodyEl = main.createDiv({ cls: 'codex-diff-body' });

    this.renderList();
    this.renderSelected();

    const actions = contentEl.createDiv({ cls: 'codex-diff-actions' });
    actions.createSpan({
      text: 'Drag the bottom-right corner to resize',
      cls: 'codex-diff-resize-hint',
    });
    const rejectBtn = actions.createEl('button', { text: 'Reject all' });
    rejectBtn.addEventListener('click', () => this.finish(null));
    this.applyBtn = actions.createEl('button', { cls: 'mod-cta' });
    this.applyBtn.addEventListener('click', () => {
      this.finish(this.drafts.filter((_, i) => this.checked.has(i)));
    });
    this.updateApplyLabel();
  }

  private renderList(): void {
    if (!this.listEl) return;
    this.listEl.empty();
    this.drafts.forEach((draft, idx) => {
      const row = this.listEl!.createDiv({
        cls: `codex-recipe-review-file${idx === this.selected ? ' is-selected' : ''}`,
      });
      const checkbox = row.createEl('input', { type: 'checkbox' });
      checkbox.checked = this.checked.has(idx);
      checkbox.addEventListener('click', ev => ev.stopPropagation());
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) this.checked.add(idx);
        else this.checked.delete(idx);
        this.updateApplyLabel();
      });
      const info = row.createDiv({ cls: 'codex-recipe-review-file-info' });
      const name = info.createDiv({ cls: 'codex-extract-name' });
      name.createSpan({ text: draft.step.path, cls: 'codex-extract-entity-name' });
      name.createSpan({ text: draft.step.action, cls: 'codex-extract-type-badge' });
      const desc = info.createDiv({ cls: 'codex-extract-desc' });
      desc.createSpan({ text: `+${draft.additions}`, cls: 'codex-diff-stat-add' });
      desc.createSpan({ text: ' / ' });
      desc.createSpan({ text: `−${draft.removals}`, cls: 'codex-diff-stat-remove' });
      desc.createSpan({ text: `  ·  ${draft.step.summary}` });
      row.addEventListener('click', () => {
        this.selected = idx;
        this.renderList();
        this.renderSelected();
      });
    });
  }

  private renderSelected(): void {
    const draft = this.drafts[this.selected];
    if (!draft || !this.summaryEl || !this.bodyEl) return;
    this.summaryEl.empty();
    this.summaryEl.createSpan({ text: `${draft.step.path}  —  ` });
    this.summaryEl.createSpan({ text: `+${draft.additions}`, cls: 'codex-diff-stat-add' });
    this.summaryEl.createSpan({ text: ' / ' });
    this.summaryEl.createSpan({ text: `−${draft.removals}`, cls: 'codex-diff-stat-remove' });
    this.summaryEl.createSpan({ text: ' lines' });
    renderDiffBody(this.bodyEl, draft.oldContent, draft.newContent);
  }

  private updateApplyLabel(): void {
    if (!this.applyBtn) return;
    const n = this.checked.size;
    this.applyBtn.setText(n === 1 ? 'Apply 1 file' : `Apply ${n} files`);
    this.applyBtn.disabled = n === 0;
  }

  private finish(drafts: RecipeDraft[] | null): void {
    if (this.resolved) return;
    this.resolved = true;
    this.onResolve(drafts && drafts.length > 0 ? drafts : null);
    this.close();
  }

  onClose(): void {
    this.uninstallResize?.();
    this.uninstallResize = null;
    if (!this.resolved) this.onResolve(null);
    this.contentEl.empty();
  }
}
