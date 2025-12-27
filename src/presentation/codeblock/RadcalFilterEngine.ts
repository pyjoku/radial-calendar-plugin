/**
 * RadcalFilterEngine - Bases-compatible filter engine for radcal codeblocks
 *
 * Supports:
 * - file.hasTag("tag")
 * - file.inFolder("folder")
 * - file.hasLink("note")
 * - Operators: &&, ||, !
 * - YAML structure: and, or, not
 */

import type { App, TFile, CachedMetadata } from 'obsidian';

/**
 * Filter context for a single file
 */
export interface FilterContext {
  file: TFile;
  metadata: CachedMetadata | null;
  tags: string[];
  folder: string;
  links: string[];
}

/**
 * YAML filter structure (recursive)
 */
export interface YamlFilter {
  and?: (string | YamlFilter)[];
  or?: (string | YamlFilter)[];
  not?: (string | YamlFilter)[];
}

/**
 * Filter type - either string expression or YAML structure
 */
export type FilterExpression = string | YamlFilter;

/**
 * Filter engine for Bases-compatible syntax
 */
export class RadcalFilterEngine {
  constructor(private readonly app: App) {}

  /**
   * Create filter context for a file
   */
  createContext(file: TFile): FilterContext {
    const metadata = this.app.metadataCache.getFileCache(file);

    // Collect all tags (from frontmatter and inline)
    const tags: string[] = [];

    // Frontmatter tags
    if (metadata?.frontmatter?.tags) {
      const fmTags = metadata.frontmatter.tags;
      if (Array.isArray(fmTags)) {
        tags.push(...fmTags.map(t => this.normalizeTag(t)));
      } else if (typeof fmTags === 'string') {
        tags.push(this.normalizeTag(fmTags));
      }
    }

    // Inline tags
    if (metadata?.tags) {
      for (const tagRef of metadata.tags) {
        tags.push(this.normalizeTag(tagRef.tag));
      }
    }

    // Collect links
    const links: string[] = [];
    if (metadata?.links) {
      for (const link of metadata.links) {
        links.push(link.link);
      }
    }
    if (metadata?.frontmatterLinks) {
      for (const link of metadata.frontmatterLinks) {
        links.push(link.link);
      }
    }

    return {
      file,
      metadata,
      tags: [...new Set(tags)], // dedupe
      folder: file.parent?.path ?? '',
      links: [...new Set(links)], // dedupe
    };
  }

  /**
   * Normalize tag (remove # prefix, lowercase)
   */
  private normalizeTag(tag: string): string {
    return tag.replace(/^#/, '').toLowerCase();
  }

  /**
   * Evaluate a filter expression against a context
   */
  evaluate(filter: FilterExpression, context: FilterContext): boolean {
    if (typeof filter === 'string') {
      return this.evaluateString(filter, context);
    }
    return this.evaluateYaml(filter, context);
  }

  /**
   * Evaluate YAML filter structure
   */
  private evaluateYaml(filter: YamlFilter, context: FilterContext): boolean {
    if (filter.and) {
      return filter.and.every(f => this.evaluate(f, context));
    }
    if (filter.or) {
      return filter.or.some(f => this.evaluate(f, context));
    }
    if (filter.not) {
      // 'not' contains items that should ALL be false
      return filter.not.every(f => !this.evaluate(f, context));
    }
    return true;
  }

  /**
   * Evaluate string filter expression
   * Supports: file.hasTag("x"), file.inFolder("x"), file.hasLink("x")
   * Operators: &&, ||, !
   */
  private evaluateString(expr: string, context: FilterContext): boolean {
    const trimmed = expr.trim();

    if (!trimmed) return true;

    // Handle parentheses first
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      return this.evaluateString(trimmed.slice(1, -1), context);
    }

    // Handle || (OR) - lowest precedence
    const orParts = this.splitByOperator(trimmed, '||');
    if (orParts.length > 1) {
      return orParts.some(part => this.evaluateString(part, context));
    }

    // Handle && (AND)
    const andParts = this.splitByOperator(trimmed, '&&');
    if (andParts.length > 1) {
      return andParts.every(part => this.evaluateString(part, context));
    }

    // Handle ! (NOT)
    if (trimmed.startsWith('!')) {
      return !this.evaluateString(trimmed.slice(1), context);
    }

    // Evaluate function call
    return this.evaluateFunction(trimmed, context);
  }

  /**
   * Split expression by operator, respecting parentheses
   */
  private splitByOperator(expr: string, op: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    let i = 0;

    while (i < expr.length) {
      const char = expr[i];

      if (char === '(') {
        depth++;
        current += char;
      } else if (char === ')') {
        depth--;
        current += char;
      } else if (depth === 0 && expr.slice(i, i + op.length) === op) {
        parts.push(current.trim());
        current = '';
        i += op.length;
        continue;
      } else {
        current += char;
      }
      i++;
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts;
  }

  /**
   * Evaluate a function call
   */
  private evaluateFunction(expr: string, context: FilterContext): boolean {
    // file.hasTag("tag")
    const hasTagMatch = expr.match(/^file\.hasTag\s*\(\s*["']([^"']+)["']\s*\)$/);
    if (hasTagMatch) {
      const tag = this.normalizeTag(hasTagMatch[1]);
      return context.tags.some(t => t === tag || t.startsWith(tag + '/'));
    }

    // file.inFolder("folder")
    const inFolderMatch = expr.match(/^file\.inFolder\s*\(\s*["']([^"']+)["']\s*\)$/);
    if (inFolderMatch) {
      const folder = inFolderMatch[1].replace(/^\/|\/$/g, ''); // trim slashes
      const contextFolder = context.folder.replace(/^\/|\/$/g, '');
      return contextFolder === folder || contextFolder.startsWith(folder + '/');
    }

    // file.hasLink("note")
    const hasLinkMatch = expr.match(/^file\.hasLink\s*\(\s*["']([^"']+)["']\s*\)$/);
    if (hasLinkMatch) {
      const link = hasLinkMatch[1].toLowerCase();
      return context.links.some(l => l.toLowerCase() === link || l.toLowerCase().endsWith('/' + link));
    }

    // Unknown function - log warning and return true (don't filter out)
    console.warn(`Radcal: Unknown filter function: ${expr}`);
    return true;
  }
}
