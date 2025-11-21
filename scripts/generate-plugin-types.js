/**
 * Script to generate plugin-api.d.ts from source TypeScript files
 *
 * This extracts type definitions from the actual source code to maintain
 * a single source of truth for Plugin API types.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const pluginApiSource = path.join(rootDir, 'src', 'client', 'PluginApi.ts');
const pluginTypeSource = path.join(rootDir, 'src', 'shared', 'types', 'Plugin.ts');
const triggersSource = path.join(rootDir, 'src', 'client', 'Triggers.ts');
const formatStateSource = path.join(rootDir, 'src', 'client', 'ansi', 'FormatState.ts');
const outputFile = path.join(rootDir, 'editor', 'plugin-api.d.ts');

// Read source files
const pluginApiContent = fs.readFileSync(pluginApiSource, 'utf-8');
const pluginTypeContent = fs.readFileSync(pluginTypeSource, 'utf-8');
const triggersContent = fs.readFileSync(triggersSource, 'utf-8');
const formatStateContent = fs.readFileSync(formatStateSource, 'utf-8');

/**
 * Extract exported interfaces and types from TypeScript source
 */
function extractExports(content) {
  const lines = content.split('\n');
  const exports = [];
  let currentBlock = [];
  let inBlock = false;
  let braceDepth = 0;
  let inComment = false;
  let commentBlock = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track multiline comments (JSDoc)
    if (line.trim().startsWith('/**')) {
      inComment = true;
      commentBlock = [];
    }
    if (inComment) {
      commentBlock.push(line);
      if (line.trim().includes('*/')) {
        inComment = false;
      }
      continue;
    }

    // Check for export statements
    if (line.match(/^export (interface|type|class|const enum)\s+\w+/)) {
      inBlock = true;
      currentBlock = [...commentBlock];
      commentBlock = [];
    }

    if (inBlock) {
      currentBlock.push(line);

      // Track braces to know when interface/type ends
      for (const char of line) {
        if (char === '{') braceDepth++;
        if (char === '}') braceDepth--;
      }

      // End of declaration
      if (braceDepth === 0 && (line.includes('}') || line.includes(';'))) {
        exports.push(currentBlock.join('\n'));
        currentBlock = [];
        inBlock = false;
      }
    }

    // Reset comment if we're past the export
    if (!inComment && !inBlock && commentBlock.length > 0) {
      commentBlock = [];
    }
  }

  return exports;
}

// Extract exports from each source file
const pluginApiExports = extractExports(pluginApiContent);
const pluginTypeExports = extractExports(pluginTypeContent);
const triggersExports = extractExports(triggersContent);
const formatStateExports = extractExports(formatStateContent);

// Filter out exports that have implementation details
const filteredPluginApi = pluginApiExports.filter(exp => {
  // Keep only interfaces and types, skip implementation classes
  // Skip PluginApiImpl as it's an implementation detail
  if (exp.includes('class PluginApiImpl')) return false;

  // Keep interfaces, types, but NOT implementation classes
  return exp.includes('export interface') ||
         exp.includes('export type');
});

const filteredPluginTypes = pluginTypeExports.filter(exp => {
  return exp.includes('export interface') || exp.includes('export type');
});

const filteredTriggers = triggersExports.filter(exp => {
  return exp.includes('export interface') || exp.includes('export type');
});

const filteredFormatState = formatStateExports.filter(exp => {
  return (exp.includes('export interface') || exp.includes('export type')) &&
         exp.includes('FormatState');
});

// Remove 'export' keyword and clean up imports
function cleanExport(text) {
  return text
    .replace(/^export /gm, '')
    .replace(/import.*from.*['"];?\n/g, '')
    .trim();
}

// AnsiAwareBuffer declaration (simplified public API)
const ansiAwareBufferDeclaration = `/**
 * ANSI-aware text buffer for formatted output
 *
 * Used to manipulate text with ANSI formatting (colors, styles).
 * Provides methods to insert, append, color, and transform text segments.
 */
declare class AnsiAwareBuffer {
  /**
   * Create a new buffer
   * @param initial - Initial text or segments
   * @param state - Initial format state
   */
  constructor(initial?: string, state?: FormatStateSnapshot);

  /** Check if buffer is marked as deleted */
  readonly deleted: boolean;

  /** Mark buffer as deleted (for trigger processing) */
  markAsDeleted(): this;

  /** Create a copy of this buffer */
  clone(): AnsiAwareBuffer;

  /** Get raw text content without formatting */
  get text(): string;

  /** Get formatted text with ANSI codes */
  toString(): string;

  /**
   * Prepend text to the buffer
   * @param text - Text to add at the start
   * @param state - Format to apply
   */
  prepend(text: string, state?: FormatStateSnapshot): this;

  /**
   * Append text to the buffer
   * @param text - Text to add at the end
   * @param state - Format to apply
   */
  append(text: string, state?: FormatStateSnapshot): this;

  /**
   * Insert text at a specific position
   * @param text - Text to insert
   * @param charIndex - Position to insert at
   * @param state - Format to apply
   */
  insert(text: string, charIndex: number, state?: FormatStateSnapshot): this;

  /**
   * Apply color/formatting to a text range
   * @param range - [start, end] character indices
   * @param state - Format to apply
   */
  color(range: [number, number], state: FormatStateSnapshot): this;

  /**
   * Remove text in a range
   * @param range - [start, end] character indices
   */
  delete(range: [number, number]): this;

  /**
   * Replace text in a range
   * @param range - [start, end] character indices
   * @param replacement - New text
   * @param state - Format to apply
   */
  replace(range: [number, number], replacement: string, state?: FormatStateSnapshot): this;
}`;

// Generate the output file
const output = `/**
 * Plugin API Type Definitions
 *
 * This file is auto-generated from source TypeScript files.
 * Do not edit directly - run 'node scripts/generate-plugin-types.js' to regenerate.
 *
 * Source files:
 * - src/client/PluginApi.ts
 * - src/shared/types/Plugin.ts
 * - src/client/Triggers.ts
 * - src/client/ansi/FormatState.ts
 */

// ============================================================================
// Plugin Core Types
// ============================================================================

${filteredPluginTypes.map(cleanExport).join('\n\n')}

// ============================================================================
// Trigger Types
// ============================================================================

${filteredTriggers.map(cleanExport).join('\n\n')}

// ============================================================================
// Format State Types
// ============================================================================

${filteredFormatState.map(cleanExport).join('\n\n')}

// ============================================================================
// AnsiAwareBuffer Class
// ============================================================================

${ansiAwareBufferDeclaration}

// ============================================================================
// Plugin API Interfaces
// ============================================================================

${filteredPluginApi.map(cleanExport).join('\n\n')}

// ============================================================================
// Global API Instance
// ============================================================================

/** Global Plugin API instance available to all plugins */
declare const api: PluginApi;
`;

// Write the output file
fs.writeFileSync(outputFile, output, 'utf-8');

console.log(`✓ Generated ${outputFile}`);
console.log(`  - ${filteredPluginTypes.length} plugin core types`);
console.log(`  - ${filteredTriggers.length} trigger types`);
console.log(`  - ${filteredFormatState.length} format state types`);
console.log(`  - ${filteredPluginApi.length} plugin API interfaces`);
