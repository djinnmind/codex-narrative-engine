import type { EntityType } from '../types';

// ---------------------------------------------------------------------------
// Provider interface — all LLM adapters implement this
// ---------------------------------------------------------------------------

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly supportsStreaming: boolean;
  readonly maxContextTokens: number;

  chat(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterable<ChatChunk>;
  testConnection(): Promise<ConnectionTestResult>;
}

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  systemPrompt: string;
  messages: ChatMessage[];
  context?: VaultContext;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  content: string;
  usage?: TokenUsage;
}

export interface ChatChunk {
  content: string;
  done: boolean;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  model?: string;
  latencyMs?: number;
}

// ---------------------------------------------------------------------------
// Vault context — assembled from the entity index for prompt injection
// ---------------------------------------------------------------------------

export interface EntitySummary {
  name: string;
  type: EntityType;
  filePath: string;
  frontmatter: Record<string, unknown>;
  bodyPreview: string;
  linkedEntityNames: string[];
  statblockRaw?: string;
}

export interface VaultContext {
  entities: EntitySummary[];
  recentSessions: string[];
  worldRules: string[];
  totalEntityCount: number;
}

// ---------------------------------------------------------------------------
// Provider configuration — stored in plugin settings
// ---------------------------------------------------------------------------

export type ProviderType =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'openai-compatible'
  | 'ollama'
  | 'lmstudio';

export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  model: string;
  baseUrl: string;
  maxContextTokens: number;
}

export const PROVIDER_DEFAULTS: Record<ProviderType, Omit<ProviderConfig, 'apiKey'>> = {
  gemini: {
    type: 'gemini',
    model: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com',
    maxContextTokens: 1_000_000,
  },
  openai: {
    type: 'openai',
    model: 'gpt-5.4-mini',
    baseUrl: 'https://api.openai.com/v1',
    maxContextTokens: 128_000,
  },
  anthropic: {
    type: 'anthropic',
    model: 'claude-sonnet-4-6',
    baseUrl: 'https://api.anthropic.com/v1',
    maxContextTokens: 200_000,
  },
  'openai-compatible': {
    type: 'openai-compatible',
    model: '',
    baseUrl: 'http://localhost:8080/v1',
    maxContextTokens: 32_000,
  },
  ollama: {
    type: 'ollama',
    model: 'llama3',
    baseUrl: 'http://localhost:11434',
    maxContextTokens: 32_000,
  },
  lmstudio: {
    type: 'lmstudio',
    model: '',
    baseUrl: 'http://localhost:1234/v1',
    maxContextTokens: 32_000,
  },
};

export const PROVIDER_LABELS: Record<ProviderType, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  'openai-compatible': 'OpenAI-Compatible',
  ollama: 'Ollama (Local)',
  lmstudio: 'LM Studio (Local)',
};

export const PROVIDER_MODELS: Record<ProviderType, { value: string; label: string }[]> = {
  gemini: [
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite (Preview)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  ],
  openai: [
    { value: 'gpt-5.4', label: 'GPT-5.4' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
    { value: 'o4-mini', label: 'o4-mini' },
    { value: 'o3', label: 'o3' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ],
  anthropic: [
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5' },
    { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  ],
  'openai-compatible': [],
  ollama: [],
  lmstudio: [],
};
