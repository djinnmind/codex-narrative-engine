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

export { parseFrontmatter, bodyPreview, bodyExcerpt, AI_EXCERPT_MAX_LINES, AI_EXCERPT_MAX_CHARS } from './parser/frontmatter';
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
  FollowedNote,
  ProviderType,
  ProviderConfig,
} from './ai/types';
export { PROVIDER_DEFAULTS, PROVIDER_LABELS, PROVIDER_MODELS } from './ai/types';
export { ContextAssembler, groundUserMessageWithMentions, messagesForLookupTurn, mentionPinsFromEntities } from './ai/context-assembler';
export type { ContextAssemblerOptions, MentionPin } from './ai/context-assembler';
export { parseAtMentions, pickFollowTargets, collapseRelatedNames, plotsLinkedFromSessions, primaryNameToken, FOLLOW_MAX_NOTES, FOLLOW_MAX_CHARS_EACH, FOLLOW_MAX_CHARS_TOTAL } from './ai/at-mentions';
export type { ParsedAtMentions, FollowTarget } from './ai/at-mentions';
export { mergeVaultContextWithCloudHits } from './ai/merge-vault-context';
export { buildSystemPrompt } from './ai/system-prompt';
export type { SystemPromptOptions } from './ai/system-prompt';
export { parseRecipePlan, sanitizeRecipePath, RECIPE_MAX_STEPS, errorKey } from './ai/recipe-plan';
export type { RecipePlan, RecipeStep, RecipeAction } from './ai/recipe-plan';
export { matchRecipeIntent, canonicalRecipeId, extractWikiLinkTargets, RECIPE_SCOPE_TOKENS } from './ai/recipe-intent';
export type { RecipeId, RecipeMatch } from './ai/recipe-intent';
