import type { App } from 'obsidian';
import type {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  ChatChunk,
  ConnectionTestResult,
} from '@codex-ide/core';
import type { CloudChatRequest } from '@codex-ide/cloud-contract';
import { CodexCloudClient } from '../cloud/cloud-client';
import { cloudApiBaseUrl, cloudVaultIdFromApp } from '../cloud/cloud-utils';
import type { CodexSettings } from '../settings.js';

export class CloudLLMProvider implements LLMProvider {
  readonly id = 'codex-cloud';
  readonly name = 'Codex Cloud';
  readonly supportsStreaming = false;
  readonly maxContextTokens = 128_000;

  constructor(
    private readonly getSettings: () => CodexSettings,
    private readonly app: App,
  ) {}

  private client(): CodexCloudClient {
    const s = this.getSettings();
    const base = cloudApiBaseUrl(s.cloudBaseUrl);
    return new CodexCloudClient(base, s.cloudApiKey);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const vaultId = cloudVaultIdFromApp(this.app);
    const res = await this.client().chat({
      vaultId,
      systemPrompt: request.systemPrompt,
      messages: request.messages.filter(m => m.role !== 'system') as CloudChatRequest['messages'],
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    });
    return {
      content: res.content,
      usage: res.usage,
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatChunk> {
    const single = await this.chat(request);
    yield { content: single.content, done: true };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const t0 = Date.now();
    try {
      const me = await this.client().me();
      return {
        success: true,
        message: `Codex Cloud connected (${me.plan})`,
        latencyMs: Date.now() - t0,
      };
    } catch (e: any) {
      return {
        success: false,
        message: e?.message ?? 'Connection failed',
        latencyMs: Date.now() - t0,
      };
    }
  }
}
