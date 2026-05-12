import { Notice } from 'obsidian';
import type { Entity } from '@codex-ide/core';
import type { IndexEntityPayload } from '@codex-ide/cloud-contract';
import { CodexCloudClient } from './cloud-client.js';
import { cloudApiBaseUrl, cloudVaultIdFromApp } from './cloud-utils.js';
import type CodexPlugin from '../main';

function stableEntityId(filePath: string): string {
  if (filePath.length <= 220) return filePath;
  let h = 0;
  for (let i = 0; i < filePath.length; i++) {
    h = ((h << 5) - h + filePath.charCodeAt(i)) | 0;
  }
  return `h${Math.abs(h).toString(16)}_${filePath.length}`;
}

function entityToPayload(e: Entity): IndexEntityPayload {
  const links = e.links.map(l => l.target).slice(0, 40);
  const summary = [
    `type:${e.type}`,
    `name:${e.name}`,
    e.bodyPreview.slice(0, 1200),
    links.length ? `links:${links.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    entityId: stableEntityId(e.filePath),
    filePath: e.filePath,
    name: e.name,
    type: e.type,
    summary,
  };
}

export class CodexCloudSync {
  private debounceTimer: number | undefined;
  private syncing = false;
  private listenersRegistered = false;

  constructor(private readonly plugin: CodexPlugin) {}

  reloadConfig(): void {
    this.cancelDebounce();
  }

  cancelDebounce(): void {
    if (this.debounceTimer !== undefined) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  register(registerEvent: (ref: unknown) => void): void {
    if (this.listenersRegistered) return;
    this.listenersRegistered = true;
    registerEvent(
      this.plugin.app.vault.on('modify', () => this.schedule()),
    );
    registerEvent(
      this.plugin.app.vault.on('create', () => this.schedule()),
    );
    registerEvent(
      this.plugin.app.vault.on('delete', () => this.schedule()),
    );
    registerEvent(
      this.plugin.app.vault.on('rename', () => this.schedule()),
    );
  }

  schedule(): void {
    const s = this.plugin.settings;
    if (s.aiInferenceMode !== 'codex-cloud' || !s.cloudSyncEnabled || !s.cloudApiKey?.trim()) {
      return;
    }
    this.cancelDebounce();
    const ms = Math.max(2000, s.cloudSyncDebounceMs ?? 8000);
    this.debounceTimer = window.setTimeout(() => void this.runSync(), ms);
  }

  async runSyncNow(): Promise<void> {
    this.cancelDebounce();
    await this.runSync();
  }

  private async runSync(): Promise<void> {
    const s = this.plugin.settings;
    if (s.aiInferenceMode !== 'codex-cloud' || !s.cloudSyncEnabled || !s.cloudApiKey?.trim()) {
      return;
    }
    if (this.syncing) return;
    this.syncing = true;
    try {
      const base = cloudApiBaseUrl(s.cloudBaseUrl);
      const client = new CodexCloudClient(base, s.cloudApiKey);
      const vaultId = cloudVaultIdFromApp(this.plugin.app);
      const entities = this.plugin.registry
        .getAllEntities()
        .map(entityToPayload);
      if (entities.length === 0) return;
      const res = await client.indexEntities({ vaultId, entities });
      console.debug(`Codex Cloud: indexed ${res.indexed} entities`);
    } catch (e: any) {
      console.error('Codex Cloud sync failed', e);
      new Notice(`Codex Cloud sync failed: ${e?.message ?? e}`);
    } finally {
      this.syncing = false;
    }
  }
}
