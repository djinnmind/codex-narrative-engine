import { requestUrl } from 'obsidian';
import type {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  ChatChunk,
  ConnectionTestResult,
} from '@codex-ide/core';
import { withRetry } from './retry';

/**
 * Adapter for any OpenAI-compatible API. Covers:
 * - OpenAI (api.openai.com)
 * - Anthropic via OpenAI-compatible proxy
 * - Ollama (localhost:11434/v1)
 * - LM Studio (localhost:1234/v1)
 * - Any other OpenAI-compatible server
 */
export class OpenAIAdapter implements LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly supportsStreaming = false;
  readonly maxContextTokens: number;

  constructor(
    id: string,
    name: string,
    private apiKey: string,
    private model: string,
    private baseUrl: string,
    maxContextTokens: number,
  ) {
    this.id = id;
    this.name = name;
    this.maxContextTokens = maxContextTokens;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return withRetry(() => this.doChat(request), this.name);
  }

  private async doChat(request: ChatRequest): Promise<ChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const messages: { role: string; content: string }[] = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    for (const msg of request.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const payload: Record<string, unknown> = {
      model: this.model,
      messages,
    };
    const maxOut = request.maxTokens ?? 4096;
    if (this.id === 'openai' || usesCompletionTokens(this.model)) {
      payload.max_completion_tokens = maxOut;
    } else {
      payload.max_tokens = maxOut;
    }
    if (!usesCompletionTokens(this.model)) {
      payload.temperature = request.temperature ?? 0.8;
    }
    if (request.jsonMode && this.id === 'openai') {
      payload.response_format = { type: 'json_object' };
    }

    const response = await requestUrl({
      url,
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      throw: false,
    });

    if (response.status !== 200) {
      const errBody = typeof response.text === 'string' ? response.text : JSON.stringify(response.json);
      throw new Error(`${this.name} API error ${response.status}: ${response.json?.error?.message ?? errBody.slice(0, 200)}`);
    }

    const data = response.json;
    const content = extractOpenAIText(data?.choices?.[0]?.message);
    const usage = data?.usage;

    return {
      content,
      usage: usage ? {
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
      } : undefined,
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatChunk> {
    const result = await this.chat(request);
    yield { content: result.content, done: true };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const url = `${this.baseUrl}/models`;
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await requestUrl({ url, method: 'GET', headers });
      const latencyMs = Date.now() - start;

      const models = response.json?.data ?? response.json?.models ?? [];
      const found = Array.isArray(models)
        ? models.find((m: any) => (m.id ?? m.name) === this.model)
        : null;

      return {
        success: true,
        message: found
          ? `Connected — model "${this.model}" available`
          : `Connected (${models.length} models available)`,
        model: this.model,
        latencyMs,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message ?? 'Connection failed',
        latencyMs: Date.now() - start,
      };
    }
  }
}

function usesCompletionTokens(model: string): boolean {
  return /^(gpt-5|o[0-9]|chatgpt-)/i.test(model);
}

function extractOpenAIText(message: {
  content?: unknown;
  refusal?: string;
} | undefined): string {
  if (!message) return '';
  const { content } = message;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p): p is { type?: string; text?: string } => !!p && typeof p === 'object')
      .filter(p => p.type !== 'reasoning' && typeof p.text === 'string')
      .map(p => p.text as string)
      .join('');
  }
  return typeof message.refusal === 'string' ? message.refusal : '';
}
