import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type { ProviderType, ProviderConfig, StatblockFormat } from '@codex-ide/core';
import { DEFAULT_ENTITY_TYPES, PROVIDER_DEFAULTS, PROVIDER_LABELS, PROVIDER_MODELS } from '@codex-ide/core';
import type CodexPlugin from './main';
import { CodexCloudClient } from './cloud/cloud-client';
import { cloudApiBaseUrl } from './cloud/cloud-utils';

export type AiInferenceMode = 'byok' | 'codex-cloud';

export interface CodexSettings {
  enableDeadLinkWarnings: boolean;
  enableStateConflictWarnings: boolean;
  showGutterIcons: boolean;
  ignoredFolders: string;

  /** BYOK vs managed Codex Cloud inference */
  aiInferenceMode: AiInferenceMode;
  cloudApiKey: string;
  /** Codex Cloud API base URL (empty = default local dev URL) */
  cloudBaseUrl: string;
  cloudSyncEnabled: boolean;
  cloudSyncDebounceMs: number;
  /** Merge Cloud RAG hits into Lore Chat context when using Codex Cloud */
  cloudMergeRagInChat: boolean;

  aiProvider: ProviderType;
  aiApiKey: string;
  aiModel: string;
  aiBaseUrl: string;
  aiMaxContextTokens: number;
  aiTemperature: number;
  aiRuleSystem: string;
  aiCampaignTone: string;
  aiLanguage: string;
  aiStatblockFormat: StatblockFormat;
  aiRecentSessions: number;
  aiLinkDepth: number;
  aiIncludeWorld: boolean;
  aiExcludedFolders: string;
  aiReviewMaxSessions: number;
  statblockWidth: number;
  templateFolder: string;
  entityTypes: string[];
}

export const DEFAULT_SETTINGS: CodexSettings = {
  enableDeadLinkWarnings: true,
  enableStateConflictWarnings: true,
  showGutterIcons: true,
  ignoredFolders: '.obsidian, .trash',

  aiInferenceMode: 'byok',
  cloudApiKey: '',
  cloudBaseUrl: '',
  cloudSyncEnabled: true,
  cloudSyncDebounceMs: 8000,
  cloudMergeRagInChat: true,

  aiProvider: 'gemini',
  aiApiKey: '',
  aiModel: PROVIDER_DEFAULTS.gemini.model,
  aiBaseUrl: PROVIDER_DEFAULTS.gemini.baseUrl,
  aiMaxContextTokens: PROVIDER_DEFAULTS.gemini.maxContextTokens,
  aiTemperature: 0.8,
  aiRuleSystem: 'D&D 5e',
  aiCampaignTone: '',
  aiLanguage: 'English',
  aiStatblockFormat: 'fantasy-statblocks',
  aiRecentSessions: 3,
  aiLinkDepth: 1,
  aiIncludeWorld: true,
  aiExcludedFolders: '',
  aiReviewMaxSessions: 20,
  statblockWidth: 600,
  templateFolder: '_codex/templates',
  entityTypes: [...DEFAULT_ENTITY_TYPES],
};

export class CodexSettingTab extends PluginSettingTab {
  plugin: CodexPlugin;

  constructor(app: App, plugin: CodexPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ----- Linting Settings -----
    containerEl.createEl('h2', { text: 'Narrative Linting' });

    new Setting(containerEl)
      .setName('Dead-link warnings')
      .setDesc('Highlight [[links]] that don\'t resolve to any file in the vault.')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.enableDeadLinkWarnings)
          .onChange(async (value) => {
            this.plugin.settings.enableDeadLinkWarnings = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('State conflict warnings')
      .setDesc('Flag contradictions like dead NPCs listed as present in sessions.')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.enableStateConflictWarnings)
          .onChange(async (value) => {
            this.plugin.settings.enableStateConflictWarnings = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Gutter icons')
      .setDesc('Show warning icons in the editor gutter next to problematic lines.')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.showGutterIcons)
          .onChange(async (value) => {
            this.plugin.settings.showGutterIcons = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Ignored folders')
      .setDesc('Comma-separated list of folders to exclude from indexing.')
      .addText(text =>
        text
          .setPlaceholder('.obsidian, .trash')
          .setValue(this.plugin.settings.ignoredFolders)
          .onChange(async (value) => {
            this.plugin.settings.ignoredFolders = value;
            await this.plugin.saveSettings();
          }),
      );

    // ----- Codex Cloud -----
    containerEl.createEl('h2', { text: 'Codex Cloud' });

    new Setting(containerEl)
      .setName('Inference mode')
      .setDesc('Use your own API keys (BYOK) or Codex Cloud managed inference (requires active Cloud subscription / trial).')
      .addDropdown(dropdown =>
        dropdown
          .addOption('byok', 'Bring your own key (BYOK)')
          .addOption('codex-cloud', 'Codex Cloud')
          .setValue(this.plugin.settings.aiInferenceMode)
          .onChange(async (value) => {
            this.plugin.settings.aiInferenceMode = value as AiInferenceMode;
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName('Codex Cloud API key')
      .setDesc('From Stripe checkout redeem or dev issue-key. Stored only in this vault.')
      .addText(text =>
        text
          .setPlaceholder('cxk_…')
          .setValue(this.plugin.settings.cloudApiKey)
          .onChange(async (value) => {
            this.plugin.settings.cloudApiKey = value;
            await this.plugin.saveSettings();
          }),
      )
      .then(setting => {
        const input = setting.controlEl.querySelector('input');
        if (input) input.type = 'password';
      });

    new Setting(containerEl)
      .setName('Codex Cloud API base URL')
      .setDesc('Leave empty for default (http://127.0.0.1:8790). Set to your production Codex Cloud URL.')
      .addText(text =>
        text
          .setPlaceholder('https://cloud.example.com')
          .setValue(this.plugin.settings.cloudBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.cloudBaseUrl = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Background entity sync')
      .setDesc('Upload entity summaries to Codex Cloud for semantic search / RAG (no full note bodies).')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.cloudSyncEnabled)
          .onChange(async (value) => {
            this.plugin.settings.cloudSyncEnabled = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Sync debounce (ms)')
      .setDesc('Wait after vault changes before syncing to Cloud.')
      .addText(text =>
        text
          .setValue(String(this.plugin.settings.cloudSyncDebounceMs))
          .onChange(async (value) => {
            const n = Number.parseInt(value.replace(/\D/g, ''), 10);
            this.plugin.settings.cloudSyncDebounceMs = Number.isFinite(n) ? Math.max(2000, n) : 8000;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Merge Cloud RAG in Lore Chat')
      .setDesc('When using Codex Cloud, prepend semantic search hits to chat context before the local entity graph.')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.cloudMergeRagInChat)
          .onChange(async (value) => {
            this.plugin.settings.cloudMergeRagInChat = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Validate Cloud connection')
      .setDesc('Calls GET /v1/me with your API key.')
      .addButton(button =>
        button
          .setButtonText('Validate')
          .setCta()
          .onClick(async () => {
            button.setButtonText('…');
            button.setDisabled(true);
            try {
              const client = new CodexCloudClient(
                cloudApiBaseUrl(this.plugin.settings.cloudBaseUrl),
                this.plugin.settings.cloudApiKey,
              );
              const me = await client.me();
              new Notice(`Codex Cloud OK — plan: ${me.plan}`);
            } catch (e: any) {
              new Notice(`Codex Cloud: ${e?.message ?? e}`);
            } finally {
              button.setButtonText('Validate');
              button.setDisabled(false);
            }
          }),
      );

    // ----- AI Provider Settings -----
    containerEl.createEl('h2', { text: 'AI Provider' });

    new Setting(containerEl)
      .setName('Provider')
      .setDesc('Select the LLM provider for AI-powered features.')
      .addDropdown(dropdown => {
        for (const [key, label] of Object.entries(PROVIDER_LABELS)) {
          dropdown.addOption(key, label);
        }
        dropdown.setValue(this.plugin.settings.aiProvider);
        dropdown.onChange(async (value) => {
          const providerType = value as ProviderType;
          const defaults = PROVIDER_DEFAULTS[providerType];
          this.plugin.settings.aiProvider = providerType;
          this.plugin.settings.aiModel = defaults.model;
          this.plugin.settings.aiBaseUrl = defaults.baseUrl;
          this.plugin.settings.aiMaxContextTokens = defaults.maxContextTokens;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    const needsApiKey =
      this.plugin.settings.aiInferenceMode === 'byok' &&
      ['gemini', 'openai', 'anthropic', 'openai-compatible'].includes(this.plugin.settings.aiProvider);

    if (needsApiKey) {
      new Setting(containerEl)
        .setName('API key')
        .setDesc('Your API key for the selected provider. Stored locally in this vault only.')
        .addText(text =>
          text
            .setPlaceholder('Enter API key...')
            .setValue(this.plugin.settings.aiApiKey)
            .onChange(async (value) => {
              this.plugin.settings.aiApiKey = value;
              await this.plugin.saveSettings();
            }),
        )
        .then(setting => {
          const input = setting.controlEl.querySelector('input');
          if (input) input.type = 'password';
        });
    }

    const models = PROVIDER_MODELS[this.plugin.settings.aiProvider];
    const modelSetting = new Setting(containerEl)
      .setName('Model')
      .setDesc('Model to use for completions.');

    if (models.length > 0) {
      modelSetting.addDropdown(dropdown => {
        for (const m of models) {
          dropdown.addOption(m.value, m.label);
        }
        const current = this.plugin.settings.aiModel;
        if (models.some(m => m.value === current)) {
          dropdown.setValue(current);
        } else {
          dropdown.setValue(models[0].value);
        }
        dropdown.onChange(async (value) => {
          this.plugin.settings.aiModel = value;
          await this.plugin.saveSettings();
        });
      });
    } else {
      modelSetting.addText(text =>
        text
          .setPlaceholder('Enter model name...')
          .setValue(this.plugin.settings.aiModel)
          .onChange(async (value) => {
            this.plugin.settings.aiModel = value;
            await this.plugin.saveSettings();
          }),
      );
    }

    new Setting(containerEl)
      .setName('Base URL')
      .setDesc('API base URL. Change for custom endpoints or local servers.')
      .addText(text =>
        text
          .setValue(this.plugin.settings.aiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.aiBaseUrl = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Test connection')
      .setDesc('Verify the provider is reachable and the API key is valid.')
      .addButton(button =>
        button
          .setButtonText('Test')
          .setCta()
          .onClick(async () => {
            button.setButtonText('Testing...');
            button.setDisabled(true);
            try {
              const provider = this.plugin.getProvider();
              if (!provider) {
                new Notice(
                  this.plugin.settings.aiInferenceMode === 'codex-cloud'
                    ? 'Configure your Codex Cloud API key first.'
                    : 'Configure an API key first.',
                );
                return;
              }
              const result = await provider.testConnection();
              if (result.success) {
                new Notice(`✓ ${result.message} (${result.latencyMs}ms)`);
              } else {
                new Notice(`✗ ${result.message}`);
              }
            } catch (err: any) {
              new Notice(`✗ ${err?.message ?? 'Unknown error'}`);
            } finally {
              button.setButtonText('Test');
              button.setDisabled(false);
            }
          }),
      );

    // ----- AI Context Settings -----
    containerEl.createEl('h2', { text: 'AI Context' });

    new Setting(containerEl)
      .setName('Recent sessions to include')
      .setDesc('Number of recent session summaries to include in AI context.')
      .addSlider(slider =>
        slider
          .setLimits(0, 10, 1)
          .setValue(this.plugin.settings.aiRecentSessions)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.aiRecentSessions = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Link expansion depth')
      .setDesc('How many link hops to follow when assembling entity context (0–3).')
      .addSlider(slider =>
        slider
          .setLimits(0, 3, 1)
          .setValue(this.plugin.settings.aiLinkDepth)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.aiLinkDepth = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Include world entities')
      .setDesc('Always include world-type entities (cosmology, gods, rules) in AI context.')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.aiIncludeWorld)
          .onChange(async (value) => {
            this.plugin.settings.aiIncludeWorld = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Excluded folders')
      .setDesc('Comma-separated folders to exclude from AI context (e.g. player-secrets).')
      .addText(text =>
        text
          .setPlaceholder('player-secrets, dm-notes')
          .setValue(this.plugin.settings.aiExcludedFolders)
          .onChange(async (value) => {
            this.plugin.settings.aiExcludedFolders = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Max sessions for arc review')
      .setDesc('Maximum number of sessions to include when reviewing an adventure arc (1–50).')
      .addSlider(slider =>
        slider
          .setLimits(1, 50, 1)
          .setValue(this.plugin.settings.aiReviewMaxSessions)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.aiReviewMaxSessions = value;
            await this.plugin.saveSettings();
          }),
      );

    // ----- AI Generation Settings -----
    containerEl.createEl('h2', { text: 'AI Generation' });

    new Setting(containerEl)
      .setName('Rule system')
      .setDesc('The TTRPG rule system for generated content.')
      .addDropdown(dropdown =>
        dropdown
          .addOption('D&D 5e', 'D&D 5e')
          .addOption('D&D 5e (2024)', 'D&D 5e (2024)')
          .addOption('Pathfinder 2e', 'Pathfinder 2e')
          .addOption('Custom', 'Custom / System-Agnostic')
          .setValue(this.plugin.settings.aiRuleSystem)
          .onChange(async (value) => {
            this.plugin.settings.aiRuleSystem = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Campaign tone')
      .setDesc('Describe the tone for AI-generated content (e.g. "dark fantasy", "lighthearted adventure").')
      .addText(text =>
        text
          .setPlaceholder('e.g. dark fantasy, gritty noir')
          .setValue(this.plugin.settings.aiCampaignTone)
          .onChange(async (value) => {
            this.plugin.settings.aiCampaignTone = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Language')
      .setDesc('Language for AI-generated prose, descriptions, and dialogue. Frontmatter keys and wiki-link syntax stay in English.')
      .addDropdown(dropdown => {
        const languages = [
          'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese',
          'Dutch', 'Polish', 'Swedish', 'Norwegian', 'Danish', 'Finnish',
          'Russian', 'Ukrainian', 'Czech', 'Romanian', 'Hungarian',
          'Japanese', 'Korean', 'Chinese (Simplified)', 'Chinese (Traditional)',
          'Turkish', 'Arabic', 'Hebrew', 'Thai', 'Vietnamese', 'Indonesian',
        ];
        for (const lang of languages) {
          dropdown.addOption(lang, lang);
        }
        dropdown.setValue(this.plugin.settings.aiLanguage);
        dropdown.onChange(async (value) => {
          this.plugin.settings.aiLanguage = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Stat block format')
      .setDesc('Format for AI-generated creature stat blocks. Use "Fantasy Statblocks" if you have that plugin installed.')
      .addDropdown(dropdown =>
        dropdown
          .addOption('fantasy-statblocks', 'Fantasy Statblocks (plugin)')
          .addOption('markdown', 'Markdown Tables')
          .setValue(this.plugin.settings.aiStatblockFormat)
          .onChange(async (value) => {
            this.plugin.settings.aiStatblockFormat = value as StatblockFormat;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Stat block width')
      .setDesc('Width of rendered Fantasy Statblock cards in pixels (default 600, plugin default 400).')
      .addSlider(slider =>
        slider
          .setLimits(300, 900, 50)
          .setValue(this.plugin.settings.statblockWidth)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.statblockWidth = value;
            await this.plugin.saveSettings();
            this.plugin.applyStatblockWidth();
          }),
      );

    new Setting(containerEl)
      .setName('Temperature')
      .setDesc('Controls randomness in AI responses (0.1 = focused, 1.0 = creative).')
      .addSlider(slider =>
        slider
          .setLimits(0.1, 1.0, 0.1)
          .setValue(this.plugin.settings.aiTemperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.aiTemperature = value;
            await this.plugin.saveSettings();
          }),
      );

    // ----- Entity Types -----
    containerEl.createEl('h2', { text: 'Entity Types' });

    const typesDesc = containerEl.createEl('p', {
      text: 'Entity types that Codex indexes and offers in generation dialogs. Add custom types or remove built-in ones you don\'t use.',
      cls: 'setting-item-description',
    });
    typesDesc.style.marginBottom = '8px';

    const typesContainer = containerEl.createDiv({ cls: 'codex-entity-types-list' });
    const renderTypes = () => {
      typesContainer.empty();
      for (const t of this.plugin.settings.entityTypes) {
        const row = typesContainer.createDiv({ cls: 'codex-entity-type-row' });
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.marginBottom = '4px';

        const label = row.createSpan({ text: t });
        label.style.flex = '1';

        const isDefault = (DEFAULT_ENTITY_TYPES as readonly string[]).includes(t);
        if (isDefault) {
          const badge = row.createSpan({ text: 'built-in', cls: 'setting-item-description' });
          badge.style.fontSize = 'var(--font-smallest)';
        }

        const removeBtn = row.createEl('button', { text: '×' });
        removeBtn.style.cursor = 'pointer';
        removeBtn.addEventListener('click', async () => {
          this.plugin.settings.entityTypes = this.plugin.settings.entityTypes.filter(x => x !== t);
          await this.plugin.saveSettings();
          this.plugin.syncCustomTypes();
          renderTypes();
        });
      }
    };
    renderTypes();

    const addRow = new Setting(containerEl);
    let newTypeValue = '';
    addRow
      .setName('Add custom type')
      .addText(text =>
        text
          .setPlaceholder('e.g. deity, spell, vehicle')
          .onChange(value => { newTypeValue = value; }),
      )
      .addButton(button =>
        button
          .setButtonText('Add')
          .setCta()
          .onClick(async () => {
            const cleaned = newTypeValue.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
            if (!cleaned) return;
            if (this.plugin.settings.entityTypes.includes(cleaned)) {
              new Notice(`"${cleaned}" is already in the list.`);
              return;
            }
            this.plugin.settings.entityTypes.push(cleaned);
            await this.plugin.saveSettings();
            this.plugin.syncCustomTypes();
            newTypeValue = '';
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName('Reset to defaults')
      .setDesc('Restore the built-in entity type list.')
      .addButton(button =>
        button
          .setButtonText('Reset')
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.entityTypes = [...DEFAULT_ENTITY_TYPES];
            await this.plugin.saveSettings();
            this.plugin.syncCustomTypes();
            this.display();
          }),
      );

    // ----- Entity Templates -----
    containerEl.createEl('h2', { text: 'Entity Templates' });

    new Setting(containerEl)
      .setName('Template folder')
      .setDesc('Vault folder where entity generation templates are stored.')
      .addText(text =>
        text
          .setPlaceholder('_codex/templates')
          .setValue(this.plugin.settings.templateFolder)
          .onChange(async (value) => {
            this.plugin.settings.templateFolder = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Open templates folder')
      .setDesc('Open the templates folder in the file explorer to edit templates.')
      .addButton(button =>
        button
          .setButtonText('Open Folder')
          .onClick(async () => {
            const folder = this.plugin.settings.templateFolder || '_codex/templates';
            await this.plugin.ensureTemplates();
            const abstractFile = this.app.vault.getAbstractFileByPath(folder);
            if (abstractFile) {
              const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
              if (fileExplorer) {
                this.app.workspace.revealLeaf(fileExplorer);
                (fileExplorer.view as any)?.revealInFolder?.(abstractFile);
              }
            }
          }),
      );

    new Setting(containerEl)
      .setName('Reset templates')
      .setDesc('Overwrite all template files with built-in defaults.')
      .addButton(button =>
        button
          .setButtonText('Reset to Defaults')
          .setWarning()
          .onClick(async () => {
            await this.plugin.resetTemplates();
          }),
      );

    // ----- Maintenance -----
    containerEl.createEl('h2', { text: 'Maintenance' });

    new Setting(containerEl)
      .setName('Re-index vault')
      .setDesc('Rebuild the entity index from scratch.')
      .addButton(button =>
        button
          .setButtonText('Re-index')
          .onClick(async () => {
            button.setButtonText('Indexing...');
            button.setDisabled(true);
            this.plugin.registry.clear();
            await this.plugin.vaultAdapter.fullIndex();
            this.plugin.refreshWarningsView();
            new Notice(`Codex: Re-indexed ${this.plugin.registry.size} entities`);
            button.setButtonText('Re-index');
            button.setDisabled(false);
          }),
      );

    new Setting(containerEl)
      .setName('Generate plural aliases')
      .setDesc('Add plural/singular variants as aliases to all entity files.')
      .addButton(button =>
        button
          .setButtonText('Generate Aliases')
          .onClick(async () => {
            button.setButtonText('Generating...');
            button.setDisabled(true);
            await this.plugin.generatePluralAliases();
            button.setButtonText('Generate Aliases');
            button.setDisabled(false);
          }),
      );
  }
}

export function getProviderConfig(settings: CodexSettings): ProviderConfig {
  return {
    type: settings.aiProvider,
    apiKey: settings.aiApiKey,
    model: settings.aiModel,
    baseUrl: settings.aiBaseUrl,
    maxContextTokens: settings.aiMaxContextTokens,
  };
}
