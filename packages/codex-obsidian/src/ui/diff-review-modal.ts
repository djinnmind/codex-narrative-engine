import { Modal, Notice, TFile } from 'obsidian';
import { computeLineDiff } from '@codex-ide/core';
import type CodexPlugin from '../main';
import { renderDiffBody } from './diff-render';
import { installResizableModal } from './resizable-modal';

// ---------------------------------------------------------------------------
// Diff Review Modal
// ---------------------------------------------------------------------------

class DiffReviewModal extends Modal {
  private resolved = false;
  private onResolve: (accepted: boolean) => void = () => {};
  private uninstallResize: (() => void) | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private plugin: CodexPlugin,
    private displayName: string,
    private oldContent: string,
    private newContent: string,
    private label: string,
  ) {
    super(plugin.app);
  }

  readonly result = new Promise<boolean>(resolve => {
    this.onResolve = resolve;
  });

  onOpen(): void {
    this.uninstallResize = installResizableModal(this.modalEl, {
      storageKey: 'codex-diff-modal-size',
    });

    const { contentEl } = this;
    contentEl.addClass('codex-diff-modal');

    const rawDiff = computeLineDiff(this.oldContent, this.newContent);
    const additions = rawDiff.filter(l => l.type === 'add').length;
    const removals = rawDiff.filter(l => l.type === 'remove').length;

    contentEl.createEl('h3', { text: `Review: ${this.label}` });
    const summary = contentEl.createEl('p', { cls: 'codex-diff-summary' });
    summary.createSpan({ text: `${this.displayName}  —  ` });
    summary.createSpan({ text: `+${additions}`, cls: 'codex-diff-stat-add' });
    summary.createSpan({ text: ' / ' });
    summary.createSpan({ text: `−${removals}`, cls: 'codex-diff-stat-remove' });
    summary.createSpan({ text: ' lines' });

    const body = contentEl.createDiv({ cls: 'codex-diff-body' });
    renderDiffBody(body, this.oldContent, this.newContent);

    const actions = contentEl.createDiv({ cls: 'codex-diff-actions' });

    const hint = actions.createSpan({
      text: 'Drag the bottom-right corner to resize',
      cls: 'codex-diff-resize-hint',
    });
    hint.setAttr('aria-hidden', 'true');

    const rejectBtn = actions.createEl('button', { text: 'Reject' });
    rejectBtn.addEventListener('click', () => this.finish(false));

    const acceptBtn = actions.createEl('button', { text: 'Accept', cls: 'mod-cta' });
    acceptBtn.setAttr('title', 'Enter');
    acceptBtn.addEventListener('click', () => this.finish(true));

    this.onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
      e.preventDefault();
      this.finish(true);
    };
    this.modalEl.addEventListener('keydown', this.onKey);
  }

  private finish(accepted: boolean): void {
    if (this.resolved) return;
    this.resolved = true;
    this.onResolve(accepted);
    this.close();
  }

  onClose(): void {
    if (this.onKey) {
      this.modalEl.removeEventListener('keydown', this.onKey);
      this.onKey = null;
    }
    this.uninstallResize?.();
    this.uninstallResize = null;
    if (!this.resolved) {
      this.onResolve(false);
    }
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ProposeEditOptions {
  /** When false, skip the Applied/Rejected notices (recipe runner reports a summary). */
  notices?: boolean;
  /** When false, refuse instead of overwriting an existing file. */
  allowOverwrite?: boolean;
}

/**
 * Show a diff review modal for an AI-proposed edit.
 * Returns true if the user accepted the changes (file already written),
 * false if rejected.
 */
export async function proposeEdit(
  plugin: CodexPlugin,
  file: TFile,
  newContent: string,
  label: string,
  opts: ProposeEditOptions = {},
): Promise<boolean> {
  const notices = opts.notices !== false;
  const oldContent = await plugin.app.vault.read(file);

  if (oldContent === newContent) {
    if (notices) new Notice('Codex: No changes to suggest.');
    return false;
  }

  const accepted = await openDiffReview(plugin, file.basename, oldContent, newContent, label);
  if (accepted) {
    await plugin.app.vault.modify(file, newContent);
    if (notices) new Notice(`Codex: Applied changes to ${file.basename}`);
  } else if (notices) {
    new Notice('Codex: Changes rejected.');
  }
  return accepted;
}

/**
 * Review a new file as a diff against empty, then create it.
 */
export async function proposeCreate(
  plugin: CodexPlugin,
  path: string,
  newContent: string,
  label: string,
  opts: ProposeEditOptions = {},
): Promise<boolean> {
  const notices = opts.notices !== false;
  const existing = plugin.app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    if (opts.allowOverwrite === false) {
      if (notices) new Notice(`Codex: ${path} already exists — skipped create.`);
      return false;
    }
    return proposeEdit(plugin, existing, newContent, label, opts);
  }

  const accepted = await openDiffReview(
    plugin,
    path.split('/').pop() ?? path,
    '',
    newContent,
    label,
  );
  if (!accepted) {
    if (notices) new Notice('Codex: Changes rejected.');
    return false;
  }

  const slash = path.lastIndexOf('/');
  if (slash > 0) {
    const folder = path.slice(0, slash);
    if (!plugin.app.vault.getAbstractFileByPath(folder)) {
      await plugin.app.vault.createFolder(folder);
    }
  }
  await plugin.app.vault.create(path, newContent);
  if (notices) new Notice(`Codex: Created ${path}`);
  return true;
}

function openDiffReview(
  plugin: CodexPlugin,
  displayName: string,
  oldContent: string,
  newContent: string,
  label: string,
): Promise<boolean> {
  const modal = new DiffReviewModal(plugin, displayName, oldContent, newContent, label);
  modal.open();
  return modal.result;
}
