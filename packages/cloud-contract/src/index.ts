/** Shared Codex Cloud API types (plugin + server). */

export interface MeResponse {
  ok: true;
  userId: string;
  email: string | null;
  plan: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  monthlyTokenBudget: number;
  monthlyTokensUsed: number;
}

export interface ErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

export interface IndexEntityPayload {
  entityId: string;
  filePath: string;
  name: string;
  type: string;
  summary: string;
}

export interface IndexEntitiesRequest {
  vaultId: string;
  entities: IndexEntityPayload[];
}

export interface IndexEntitiesResponse {
  ok: true;
  indexed: number;
}

export interface SearchRequest {
  vaultId: string;
  query: string;
  topK?: number;
}

export interface SearchHit {
  entityId: string;
  filePath: string;
  name: string;
  type: string;
  summary: string;
  score: number;
}

export interface SearchResponse {
  ok: true;
  hits: SearchHit[];
}

export interface CloudChatRequest {
  vaultId: string;
  systemPrompt: string;
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  temperature?: number;
  maxTokens?: number;
}

export interface CloudChatResponse {
  ok: true;
  content: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface BatchJobRequest {
  vaultId: string;
  kind: 'vault_lint' | 'folder_enhance';
  payload: Record<string, unknown>;
}

export interface BatchJobResponse {
  ok: true;
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
}

export interface BatchJobStatusResponse {
  ok: true;
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

export interface DeleteAccountResponse {
  ok: true;
  deleted: boolean;
}

export interface NarrativeLintRequest {
  vaultId: string;
  /** Optional path scope */
  scope?: 'vault' | 'folder';
  folderPath?: string;
}

export interface NarrativeLintFinding {
  severity: 'info' | 'warning' | 'error';
  message: string;
  filePath?: string;
}

export interface NarrativeLintResponse {
  ok: true;
  findings: NarrativeLintFinding[];
}
