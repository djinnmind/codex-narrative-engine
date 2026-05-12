import type { App } from 'obsidian';

export function cloudVaultIdFromApp(app: App): string {
  const name = app.vault.getName() || 'vault';
  return name.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 64) || 'vault';
}

export function cloudApiBaseUrl(settingsBase: string): string {
  const d = (settingsBase || '').trim();
  if (d) return d.replace(/\/$/, '');
  return 'http://127.0.0.1:8790';
}
