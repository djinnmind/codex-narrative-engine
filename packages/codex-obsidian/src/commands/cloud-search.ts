import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { CodexCloudClient } from '../cloud/cloud-client.js';
import { cloudApiBaseUrl, cloudVaultIdFromApp } from '../cloud/cloud-utils.js';
import type CodexPlugin from '../main';

export function registerCloudSearchCommand(plugin: CodexPlugin): void {
  plugin.addCommand({
    id: 'codex-cloud-semantic-search',
    name: 'Codex Cloud: semantic vault search',
    callback: () => {
      const s = plugin.settings;
      if (!s.cloudApiKey?.trim()) {
        new Notice('Codex Cloud: add your API key in settings first.');
        return;
      }
      new CloudSearchModal(plugin.app, plugin).open();
    },
  });
}

class CloudSearchModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: CodexPlugin,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Semantic vault search' });
    let q = '';
    new Setting(contentEl)
      .setName('Query')
      .addText(text =>
        text.setPlaceholder('Ask your vault…').onChange(v => { q = v; }),
      );
    new Setting(contentEl).addButton(btn =>
      btn
        .setButtonText('Search')
        .setCta()
        .onClick(async () => {
          if (!q.trim()) {
            new Notice('Enter a query.');
            return;
          }
          const s = this.plugin.settings;
          const client = new CodexCloudClient(cloudApiBaseUrl(s.cloudBaseUrl), s.cloudApiKey);
          const vaultId = cloudVaultIdFromApp(this.app);
          try {
            const res = await client.search(vaultId, q.trim(), 15);
            this.renderResults(contentEl, res.hits);
          } catch (e: any) {
            new Notice(e?.message ?? 'Search failed');
          }
        }),
    );
  }

  private renderResults(
    root: HTMLElement,
    hits: { name: string; filePath: string; summary: string; score: number }[],
  ): void {
    let box = root.querySelector('.codex-cloud-search-results') as HTMLElement | null;
    if (!box) {
      box = root.createDiv({ cls: 'codex-cloud-search-results' });
    }
    box.empty();
    if (hits.length === 0) {
      box.createEl('p', { text: 'No results.' });
      return;
    }
    for (const h of hits) {
      const row = box.createDiv({ cls: 'codex-cloud-hit' });
      row.createEl('strong', { text: h.name });
      row.createEl('div', { text: h.summary.slice(0, 280) + (h.summary.length > 280 ? '…' : ''), cls: 'search-result-file-matches' });
      const path = h.filePath;
      row.createEl('button', { text: 'Open note' }).addEventListener('click', () => {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (f instanceof TFile) void this.app.workspace.getLeaf(false).openFile(f);
        else new Notice(`File not found: ${path}`);
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
