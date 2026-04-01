import type { Diagnostic } from '../types';
import type { EntityRegistry } from '../indexer/entity-registry';
import { LinkResolver } from '../resolver/link-resolver';
import { detectDeadLinks } from './dead-links';
import { detectStateConflicts } from './state-conflicts';

export class DiagnosticEngine {
  private resolver: LinkResolver;

  constructor(private registry: EntityRegistry) {
    this.resolver = new LinkResolver(registry);
  }

  /**
   * Run all diagnostic rules and return the combined results.
   */
  diagnoseAll(): Diagnostic[] {
    return [
      ...detectDeadLinks(this.registry, this.resolver),
      ...detectStateConflicts(this.registry, this.resolver),
    ];
  }

  /**
   * Run diagnostics and filter to a specific file.
   */
  diagnoseFile(filePath: string): Diagnostic[] {
    return this.diagnoseAll().filter(d => d.filePath === filePath);
  }

  /**
   * Get the link resolver (used by adapters for resolution checks).
   */
  getResolver(): LinkResolver {
    return this.resolver;
  }
}
