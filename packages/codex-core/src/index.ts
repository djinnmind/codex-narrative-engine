export type {
  Entity,
  EntityType,
  LinkReference,
  Diagnostic,
  DiagnosticSeverity,
  EntityQuery,
  StatblockData,
  StatblockFormat,
} from './types';

export { ENTITY_TYPES, DEFAULT_ENTITY_TYPES, isEntityType } from './types';

export { EntityRegistry } from './indexer/entity-registry';

export { parseFrontmatter, bodyPreview } from './parser/frontmatter';
export type { ParsedFrontmatter } from './parser/frontmatter';

export { extractLinks, extractLinksFromValue } from './parser/link-extractor';

export { extractStatblocks } from './parser/statblock-parser';

export { LinkResolver } from './resolver/link-resolver';

export { pluralVariants } from './util/plurals';
export { stripLeadingArticle } from './util/articles';

export type { DiffLine, ChangeRange } from './util/diff';
export { computeLineDiff, diffToChangeRanges } from './util/diff';

export { DiagnosticEngine } from './diagnostics/diagnostic-engine';
export { detectDeadLinks } from './diagnostics/dead-links';
export { detectStateConflicts } from './diagnostics/state-conflicts';

export type {
  LLMProvider,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatChunk,
  TokenUsage,
  ConnectionTestResult,
  EntitySummary,
  VaultContext,
  ProviderType,
  ProviderConfig,
} from './ai/types';
export { PROVIDER_DEFAULTS, PROVIDER_LABELS, PROVIDER_MODELS } from './ai/types';
export { ContextAssembler } from './ai/context-assembler';
export type { ContextAssemblerOptions } from './ai/context-assembler';
export { buildSystemPrompt } from './ai/system-prompt';
export type { SystemPromptOptions } from './ai/system-prompt';
