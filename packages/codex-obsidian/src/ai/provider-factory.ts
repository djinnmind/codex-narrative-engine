import type { LLMProvider, ProviderConfig } from '@codex-ide/core';
import { GeminiAdapter } from './gemini-adapter';
import { OpenAIAdapter } from './openai-adapter';
import { AnthropicAdapter } from './anthropic-adapter';

export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.type) {
    case 'gemini':
      return new GeminiAdapter(
        config.apiKey,
        config.model,
        config.baseUrl,
        config.maxContextTokens,
      );

    case 'anthropic':
      return new AnthropicAdapter(
        config.apiKey,
        config.model,
        config.baseUrl,
        config.maxContextTokens,
      );

    case 'openai':
      return new OpenAIAdapter(
        'openai', 'OpenAI',
        config.apiKey,
        config.model,
        config.baseUrl,
        config.maxContextTokens,
      );

    case 'ollama':
      return new OpenAIAdapter(
        'ollama', 'Ollama (Local)',
        '',
        config.model,
        `${config.baseUrl}/v1`,
        config.maxContextTokens,
      );

    case 'lmstudio':
      return new OpenAIAdapter(
        'lmstudio', 'LM Studio (Local)',
        '',
        config.model,
        config.baseUrl,
        config.maxContextTokens,
      );

    case 'openai-compatible':
      return new OpenAIAdapter(
        'openai-compatible', 'OpenAI-Compatible',
        config.apiKey,
        config.model,
        config.baseUrl,
        config.maxContextTokens,
      );

    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}
