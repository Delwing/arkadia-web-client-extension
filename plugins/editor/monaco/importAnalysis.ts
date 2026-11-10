/**
 * Reading imports and exports out of plugin source, for the auto-import
 * completions. Text only: no TypeScript service involved.
 */
import pluginApiTypes from '../../types/index.d.ts?raw'
import {LEGACY_PLUGIN_TYPES_MODULE, PLUGIN_TYPES_MODULE} from './moduleNames'

/** A name a file exports; `kind` is function, class, interface, type, enum, variable or default. */
export interface FileExport {
  name: string
  kind: string
  isDefault?: boolean
}

/** A name the plugin API typings export, with the first line of its doc comment. */
export interface ApiExport {
  name: string
  kind: string
  documentation?: string
}

/** The names a plugin file exports. */
export function extractExports(content: string, filePath: string): FileExport[] {
  const exports: FileExport[] = []

  // Match export const/let/var
  const constExports = content.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g)
  for (const match of constExports) {
    exports.push({ name: match[1], kind: 'variable' })
  }

  // Match export function
  const functionExports = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)
  for (const match of functionExports) {
    exports.push({ name: match[1], kind: 'function' })
  }

  // Match export class
  const classExports = content.matchAll(/export\s+class\s+(\w+)/g)
  for (const match of classExports) {
    exports.push({ name: match[1], kind: 'class' })
  }

  // Match export interface
  const interfaceExports = content.matchAll(/export\s+interface\s+(\w+)/g)
  for (const match of interfaceExports) {
    exports.push({ name: match[1], kind: 'interface' })
  }

  // Match export type
  const typeExports = content.matchAll(/export\s+type\s+(\w+)/g)
  for (const match of typeExports) {
    exports.push({ name: match[1], kind: 'type' })
  }

  // Match export enum
  const enumExports = content.matchAll(/export\s+enum\s+(\w+)/g)
  for (const match of enumExports) {
    exports.push({ name: match[1], kind: 'enum' })
  }

  // Match export default with various patterns
  // export default function name() {}
  const defaultFunctionMatch = content.match(/export\s+default\s+(?:async\s+)?function\s+(\w+)/)
  if (defaultFunctionMatch) {
    exports.push({ name: defaultFunctionMatch[1], kind: 'function', isDefault: true })
  }
  // export default class name {}
  else {
    const defaultClassMatch = content.match(/export\s+default\s+class\s+(\w+)/)
    if (defaultClassMatch) {
      exports.push({ name: defaultClassMatch[1], kind: 'class', isDefault: true })
    }
    // export default identifier or anonymous
    else if (content.match(/export\s+default\s+/)) {
      // Try to extract the identifier being exported
      const defaultIdentifierMatch = content.match(/export\s+default\s+(\w+)/)
      if (defaultIdentifierMatch) {
        const identifierName = defaultIdentifierMatch[1]

        // Try to infer the kind by looking for the identifier's declaration
        let kind = 'default'

        // Check if it's a function
        if (content.match(new RegExp(`(?:async\\s+)?function\\s+${identifierName}\\s*\\(`))) {
          kind = 'function'
        }
        // Check if it's a class
        else if (content.match(new RegExp(`class\\s+${identifierName}\\s*[{<]`))) {
          kind = 'class'
        }
        // Check if it's a const/let/var
        else if (content.match(new RegExp(`(?:const|let|var)\\s+${identifierName}\\s*[=:]`))) {
          kind = 'variable'
        }

        exports.push({ name: identifierName, kind, isDefault: true })
      } else {
        // Anonymous default export - use filename as suggestion
        const fileName = filePath.substring(filePath.lastIndexOf('/') + 1).replace(/\.(ts|js|json)$/, '')
        exports.push({ name: fileName, kind: 'default', isDefault: true })
      }
    }
  }

  return exports
}

/** Every local name the file's imports bring in. */
export function extractImportedSymbols(content: string): Set<string> {
  const imported = new Set<string>()

  // Match: import foo from "..."
  const defaultImports = content.matchAll(/import\s+(\w+)\s+from\s+['"]/g)
  for (const match of defaultImports) {
    imported.add(match[1])
  }

  // Match: import { foo, bar } from "..."
  const namedImports = content.matchAll(/import\s+\{([^}]+)}\s+from\s+['"]/g)
  for (const match of namedImports) {
    const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop()!.trim())
    names.forEach(name => imported.add(name))
  }

  // Match: import * as foo from "..."
  const namespaceImports = content.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]/g)
  for (const match of namespaceImports) {
    imported.add(match[1])
  }

  return imported
}

/** An import of the plugin types, under either name, to merge a new one into. */
export function findPluginTypesImport(content: string): ReturnType<typeof findExistingImport> {
  const current = findExistingImport(content, PLUGIN_TYPES_MODULE)
  return current.exists ? current : findExistingImport(content, LEGACY_PLUGIN_TYPES_MODULE)
}

/** The first import of `importPath` in the file, and what it already imports. */
export function findExistingImport(content: string, importPath: string): {
  exists: boolean
  lineNumber?: number
  startColumn?: number
  endColumn?: number
  hasDefault?: boolean
  defaultImportName?: string
  hasNamed?: boolean
  namedImports?: string[]
  isTypeImport?: boolean
  /** The module the import names. */
  path?: string
} {
  const lines = content.split('\n')

  // Normalize the import path for comparison (remove quotes and handle both relative paths)
  const normalizedPath = importPath.replace(/['"]/g, '')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Match import statements with the same path (including type imports)
    const importRegex = /import\s+(?:type\s+)?(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]+)\})?\s+from\s+['"]([^'"]+)['"]/
    const match = line.match(importRegex)

    if (match) {
      const matchedPath = match[3]

      // Check if paths match
      if (matchedPath === normalizedPath) {
        const defaultImport = match[1]
        const namedImportsStr = match[2]
        const namedImports = namedImportsStr
          ? namedImportsStr.split(',').map(n => n.trim())
          : []

        return {
          exists: true,
          lineNumber: i + 1,
          startColumn: 1,
          endColumn: line.length + 1,
          hasDefault: !!defaultImport,
          defaultImportName: defaultImport,
          hasNamed: namedImports.length > 0,
          namedImports,
          isTypeImport: line.includes('import type'),
          path: matchedPath,
        }
      }
    }
  }

  return { exists: false }
}

// Extract exports from plugin API types using proper parsing
let apiExports: ApiExport[] | null = null

/** The plugin API's exported names, read once from its typings. */
export function pluginApiExports(): ApiExport[] {
  apiExports ??= extractPluginApiExports()
  return apiExports
}

function extractPluginApiExports(): ApiExport[] {
  const exports: ApiExport[] = []
  const content = pluginApiTypes

  // Helper to extract JSDoc summary from comment text
  function extractDocSummary(commentText: string): string | undefined {
    if (!commentText) return undefined

    // Remove /** and */ markers, and leading * from each line
    const cleaned = commentText
      .replace(/^\/\*\*\s*/, '')
      .replace(/\s*\*\/$/, '')
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .filter(line => line && !line.startsWith('@'))
      .join(' ')
      .trim()

    return cleaned || undefined
  }

  // Parse line by line to extract exports and their JSDoc
  const lines = content.split('\n')
  let currentDoc: string | undefined
  const addedNames = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Check if this line starts a JSDoc comment
    if (line.startsWith('/**')) {
      // Collect the full JSDoc comment
      const docLines: string[] = []
      let j = i

      while (j < lines.length) {
        const docLine = lines[j].trim()
        docLines.push(docLine)

        if (docLine.includes('*/')) {
          break
        }
        j++
      }

      currentDoc = extractDocSummary(docLines.join('\n'))
      i = j
      continue
    }

    // Check if this is an export statement
    if (line.startsWith('export ')) {
      let name: string | undefined
      let kind: string | undefined

      // Match: export interface Name
      const interfaceMatch = line.match(/^export\s+interface\s+(\w+)/)
      if (interfaceMatch) {
        name = interfaceMatch[1]
        kind = 'interface'
      }

      // Match: export type Name
      const typeMatch = line.match(/^export\s+type\s+(\w+)/)
      if (!name && typeMatch) {
        name = typeMatch[1]
        kind = 'type'
      }

      // Match: export declare class Name or export class Name
      const classMatch = line.match(/^export\s+(?:declare\s+)?class\s+(\w+)/)
      if (!name && classMatch) {
        name = classMatch[1]
        kind = 'class'
      }

      // Match: export function name or export declare function name
      const functionMatch = line.match(/^export\s+(?:declare\s+)?function\s+(\w+)/)
      if (!name && functionMatch) {
        name = functionMatch[1]
        kind = 'function'
      }

      // Match: export const/let/var (for exported values)
      const constMatch = line.match(/^export\s+(?:const|let|var)\s+(\w+)/)
      if (!name && constMatch) {
        name = constMatch[1]
        kind = 'const'
      }

      // If we found an export and haven't added it yet
      if (name && kind && !addedNames.has(name)) {
        addedNames.add(name)
        exports.push({
          name,
          kind,
          documentation: currentDoc
        })

        // Reset current doc after using it
        currentDoc = undefined
      }
    } else if (line && !line.startsWith('//')) {
      // Reset doc if we hit a non-comment, non-export line
      currentDoc = undefined
    }
  }

  return exports.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The path to import `toFile` by from `fromFile`, both relative to the
 * plugin's root: always starting with ./ or ../, without a .ts or .js
 * extension (a .json one stays).
 */
export function relativeImportPath(fromFile: string, toFile: string): string {
  const fromDir = fromFile.split('/').slice(0, -1)
  const toParts = toFile.split('/')
  const toDir = toParts.slice(0, -1)
  let common = 0
  while (common < fromDir.length && common < toDir.length && fromDir[common] === toDir[common]) common++
  const up = fromDir.length - common
  const rest = [...toDir.slice(common), toParts[toParts.length - 1]].join('/')
  return ((up === 0 ? './' : '../'.repeat(up)) + rest).replace(/\.(ts|js)$/, '')
}

/**
 * The import line `existing` becomes once `exp` is added to it, for an
 * import of another plugin file at `path`.
 */
export function mergeFileImport(existingLine: string, existing: ReturnType<typeof findExistingImport>, exp: FileExport, path: string): string {
  if (exp.isDefault) {
    // import { foo } from "./bar"  →  import exp, { foo } from "./bar"
    if (existing.hasNamed && !existing.hasDefault) {
      const namedPart = existingLine.match(/\{[^}]+\}/)?.[0] || ''
      return `import ${exp.name}, ${namedPart} from "${path}"`
    }
    return existingLine
  }
  const allNamed = [...(existing.namedImports || []), exp.name].join(', ')
  if (existing.hasDefault) {
    // import foo from "./bar"  →  import foo, { exp } from "./bar"
    const defaultName = existingLine.match(/import\s+(\w+)\s+from/)?.[1]
    return defaultName ? `import ${defaultName}, { ${allNamed} } from "${path}"` : existingLine
  }
  return `import { ${allNamed} } from "${path}"`
}

/**
 * The import line `existing` becomes once `name` is added to it, for an
 * import of the plugin API (by either module name). A default import stays;
 * otherwise TypeScript gets a type-only import.
 */
export function mergeApiImport(existing: ReturnType<typeof findExistingImport>, name: string, typeOnly: boolean): string {
  const allNamed = [...new Set([...(existing.namedImports || []), name])].join(', ')
  if (existing.hasDefault && existing.defaultImportName) {
    return `import ${existing.defaultImportName}, { ${allNamed} } from "${existing.path}"`
  }
  return `import ${typeOnly ? 'type ' : ''}{ ${allNamed} } from "${existing.path}"`
}
