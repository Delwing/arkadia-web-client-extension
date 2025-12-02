/**
 * Dynamic Documentation Registry
 *
 * Automatically extracts documentation sections from plugin-types.
 * When new API sections are added to the types, they become automatically available.
 */

import pluginApiTypes from '../../plugin-types/index.d.ts?raw';

export interface DocSection {
  name: string;
  keywords: string[];
  content: string;
}

/**
 * Parse the plugin API types file and extract sections dynamically.
 * Sections are detected by the "// ====" separator comments and interface/type definitions.
 */
function parseDocSections(source: string): Map<string, DocSection> {
  const sections = new Map<string, DocSection>();

  // Split by section headers (// ============ lines)
  const sectionRegex = /\/\/ =+\n\/\/ ([^\n]+)\n\/\/ =+\n([\s\S]*?)(?=\/\/ =+\n|$)/g;
  let match;

  while ((match = sectionRegex.exec(source)) !== null) {
    const sectionTitle = match[1].trim();
    const sectionContent = match[2].trim();
    const sectionKey = sectionTitle.toLowerCase().replace(/\s+/g, '-');

    // Extract keywords from the section (interface names, type names)
    const keywords = extractKeywords(sectionContent, sectionTitle);

    sections.set(sectionKey, {
      name: sectionTitle,
      keywords,
      content: sectionContent
    });
  }

  // Also extract individual API interfaces (TriggersApi, EventsApi, etc.)
  const apiInterfaceRegex = /export interface (\w+Api)\s*\{[\s\S]*?^\}/gm;
  while ((match = apiInterfaceRegex.exec(source)) !== null) {
    const interfaceName = match[1];
    const apiName = interfaceName.replace('Api', '').toLowerCase();

    // Find the full interface with JSDoc comments
    const fullMatch = extractInterfaceWithDocs(source, interfaceName);
    if (fullMatch && !sections.has(apiName + '-api')) {
      sections.set(apiName + '-api', {
        name: interfaceName,
        keywords: [apiName, interfaceName.toLowerCase(), `api.${apiName}`],
        content: fullMatch
      });
    }
  }

  return sections;
}

/**
 * Extract keywords from section content for search matching
 */
function extractKeywords(content: string, sectionTitle: string): string[] {
  const keywords: string[] = [];

  // Add section title words
  sectionTitle.toLowerCase().split(/\s+/).forEach(word => {
    if (word.length > 2) keywords.push(word);
  });

  // Extract interface names
  const interfaceMatches = content.matchAll(/interface\s+(\w+)/g);
  for (const m of interfaceMatches) {
    keywords.push(m[1].toLowerCase());
  }

  // Extract type names
  const typeMatches = content.matchAll(/type\s+(\w+)/g);
  for (const m of typeMatches) {
    keywords.push(m[1].toLowerCase());
  }

  // Extract function names from interfaces
  const funcMatches = content.matchAll(/^\s+(\w+)\s*[(<:]/gm);
  for (const m of funcMatches) {
    if (m[1].length > 2) keywords.push(m[1].toLowerCase());
  }

  return [...new Set(keywords)];
}

/**
 * Extract an interface definition with its preceding JSDoc comment
 */
function extractInterfaceWithDocs(source: string, interfaceName: string): string | null {
  // Match JSDoc + interface definition
  const regex = new RegExp(
    `(\\/\\*\\*[\\s\\S]*?\\*\\/\\s*)?export interface ${interfaceName}\\s*\\{[\\s\\S]*?^\\}`,
    'gm'
  );
  const match = regex.exec(source);
  return match ? match[0] : null;
}

/**
 * The documentation registry - lazily initialized
 */
let _registry: Map<string, DocSection> | null = null;

function getRegistry(): Map<string, DocSection> {
  if (!_registry) {
    _registry = parseDocSections(pluginApiTypes);
  }
  return _registry;
}

/**
 * Get all available documentation topics
 */
export function getAvailableTopics(): string[] {
  return Array.from(getRegistry().keys());
}

/**
 * Get documentation for a specific topic
 */
export function getDocumentation(topic: string): string | null {
  const registry = getRegistry();
  const key = topic.toLowerCase().replace(/\s+/g, '-');

  // Direct match
  if (registry.has(key)) {
    return registry.get(key)!.content;
  }

  // Try with -api suffix
  if (registry.has(key + '-api')) {
    return registry.get(key + '-api')!.content;
  }

  // Search by keywords
  for (const [_, section] of registry) {
    if (section.keywords.some(kw => kw.includes(key) || key.includes(kw))) {
      return section.content;
    }
  }

  return null;
}

/**
 * Search documentation by query - returns relevant sections
 */
export function searchDocs(query: string): string {
  const registry = getRegistry();
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

  const matches: { section: DocSection; score: number }[] = [];

  for (const [_key, section] of registry) {
    let score = 0;

    // Check section name
    if (section.name.toLowerCase().includes(queryLower)) {
      score += 10;
    }

    // Check keywords
    for (const keyword of section.keywords) {
      for (const qWord of queryWords) {
        if (keyword.includes(qWord) || qWord.includes(keyword)) {
          score += 5;
        }
        if (keyword === qWord) {
          score += 10;
        }
      }
    }

    // Check content (lower weight)
    for (const qWord of queryWords) {
      if (section.content.toLowerCase().includes(qWord)) {
        score += 1;
      }
    }

    if (score > 0) {
      matches.push({ section, score });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  // Return top matches (limit to avoid huge responses)
  const topMatches = matches.slice(0, 3);

  if (topMatches.length === 0) {
    return `No documentation found for: "${query}"\n\nAvailable topics: ${getAvailableTopics().join(', ')}`;
  }

  return topMatches
    .map(m => `// === ${m.section.name} ===\n\n${m.section.content}`)
    .join('\n\n---\n\n');
}

/**
 * Get a summary of all available API sections (for AI context)
 */
export function getDocsSummary(): string {
  const registry = getRegistry();
  const topics: string[] = [];

  for (const [key, section] of registry) {
    topics.push(`- ${key}: ${section.name} (keywords: ${section.keywords.slice(0, 5).join(', ')})`);
  }

  return `Available PluginApi documentation topics:\n${topics.join('\n')}`;
}
