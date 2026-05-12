import { requestUrl } from 'obsidian';
import type {
  MeResponse,
  SearchResponse,
  IndexEntitiesRequest,
  IndexEntitiesResponse,
  CloudChatRequest,
  CloudChatResponse,
  BatchJobRequest,
  BatchJobResponse,
  BatchJobStatusResponse,
  DeleteAccountResponse,
  NarrativeLintRequest,
  NarrativeLintResponse,
} from '@codex-ide/cloud-contract';

export class CodexCloudClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private base(): string {
    return this.baseUrl.replace(/\/$/, '');
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async me(): Promise<MeResponse> {
    const r = await requestUrl({
      url: `${this.base()}/v1/me`,
      method: 'GET',
      headers: this.authHeaders(),
    });
    if (r.statusCode !== 200) {
      throw new Error((r.json as { error?: string })?.error ?? r.text ?? `HTTP ${r.statusCode}`);
    }
    return r.json as MeResponse;
  }

  async indexEntities(body: IndexEntitiesRequest): Promise<IndexEntitiesResponse> {
    const r = await requestUrl({
      url: `${this.base()}/v1/index/entities`,
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });
    if (r.statusCode !== 200) {
      throw new Error((r.json as { error?: string })?.error ?? r.text ?? `HTTP ${r.statusCode}`);
    }
    return r.json as IndexEntitiesResponse;
  }

  async search(vaultId: string, query: string, topK = 12): Promise<SearchResponse> {
    const r = await requestUrl({
      url: `${this.base()}/v1/search`,
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ vaultId, query, topK }),
    });
    if (r.statusCode !== 200) {
      throw new Error((r.json as { error?: string })?.error ?? r.text ?? `HTTP ${r.statusCode}`);
    }
    return r.json as SearchResponse;
  }

  async chat(body: CloudChatRequest): Promise<CloudChatResponse> {
    const r = await requestUrl({
      url: `${this.base()}/v1/chat`,
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });
    if (r.statusCode !== 200) {
      throw new Error((r.json as { error?: string })?.error ?? r.text ?? `HTTP ${r.statusCode}`);
    }
    return r.json as CloudChatResponse;
  }

  async startBatch(body: BatchJobRequest): Promise<BatchJobResponse> {
    const r = await requestUrl({
      url: `${this.base()}/v1/batch`,
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });
    if (r.statusCode !== 200) {
      throw new Error((r.json as { error?: string })?.error ?? r.text ?? `HTTP ${r.statusCode}`);
    }
    return r.json as BatchJobResponse;
  }

  async batchStatus(jobId: string): Promise<BatchJobStatusResponse> {
    const r = await requestUrl({
      url: `${this.base()}/v1/batch/${encodeURIComponent(jobId)}`,
      method: 'GET',
      headers: this.authHeaders(),
    });
    if (r.statusCode !== 200) {
      throw new Error((r.json as { error?: string })?.error ?? r.text ?? `HTTP ${r.statusCode}`);
    }
    return r.json as BatchJobStatusResponse;
  }

  async narrativeLint(body: NarrativeLintRequest): Promise<NarrativeLintResponse> {
    const r = await requestUrl({
      url: `${this.base()}/v1/narrative/lint`,
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });
    if (r.statusCode !== 200) {
      throw new Error((r.json as { error?: string })?.error ?? r.text ?? `HTTP ${r.statusCode}`);
    }
    return r.json as NarrativeLintResponse;
  }

  async deleteAccount(): Promise<DeleteAccountResponse> {
    const r = await requestUrl({
      url: `${this.base()}/v1/account`,
      method: 'DELETE',
      headers: this.authHeaders(),
    });
    if (r.statusCode !== 200) {
      throw new Error((r.json as { error?: string })?.error ?? r.text ?? `HTTP ${r.statusCode}`);
    }
    return r.json as DeleteAccountResponse;
  }
}
