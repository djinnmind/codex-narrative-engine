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
    model: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    maxContextTokens: 128_000,
  },
  anthropic: {
    type: 'anthropic',
    model: 'claude-sonnet-4-20250514',
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
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    { value: 'o3-mini', label: 'o3-mini' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ],
  'openai-compatible': [],
  ollama: [],
  lmstudio: [],
};
