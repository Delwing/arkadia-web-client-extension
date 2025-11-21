import * as monaco from 'monaco-editor'
import {createHighlighter} from 'shiki'
import {shikiToMonaco} from '@shikijs/monaco'
import pluginApiTypes from './plugin-api.d.ts?raw'
import type {StatusType} from './types'

export function setupTypeScriptEnvironment() {
  // Configure TypeScript compiler options
  monaco.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.typescript.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.typescript.JsxEmit.React,
    allowJs: true,
    typeRoots: ['node_modules/@types'],
    resolveJsonModule: true,
  })

  // Also configure JavaScript defaults with same options
  monaco.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.typescript.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.typescript.JsxEmit.React,
    allowJs: true,
    typeRoots: ['node_modules/@types'],
    checkJs: true,
    resolveJsonModule: true,
  })

  // Enable diagnostics
  monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [],
  })

  monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [],
  })

  // Enable auto-imports
  monaco.typescript.typescriptDefaults.setInlayHintsOptions({
    includeInlayParameterNameHints: 'all',
    includeInlayParameterNameHintsWhenArgumentMatchesName: true,
    includeInlayFunctionParameterTypeHints: true,
    includeInlayVariableTypeHints: true,
    includeInlayPropertyDeclarationTypeHints: true,
    includeInlayFunctionLikeReturnTypeHints: true,
    includeInlayEnumMemberValueHints: true,
  })

  monaco.typescript.javascriptDefaults.setInlayHintsOptions({
    includeInlayParameterNameHints: 'all',
    includeInlayParameterNameHintsWhenArgumentMatchesName: true,
    includeInlayFunctionParameterTypeHints: true,
    includeInlayVariableTypeHints: true,
    includeInlayPropertyDeclarationTypeHints: true,
    includeInlayFunctionLikeReturnTypeHints: true,
    includeInlayEnumMemberValueHints: true,
  })

  // Set eager model sync
  monaco.typescript.typescriptDefaults.setEagerModelSync(true)
  monaco.typescript.javascriptDefaults.setEagerModelSync(true)

  // Enable semantic tokens
  monaco.typescript.typescriptDefaults.setWorkerOptions({
    customWorkerPath: undefined,
  })

  // Add Plugin API type definitions
  monaco.typescript.typescriptDefaults.addExtraLib(
    pluginApiTypes,
    'file:///node_modules/@types/plugin-api/index.d.ts'
  )

  monaco.typescript.javascriptDefaults.addExtraLib(
    pluginApiTypes,
    'file:///node_modules/@types/plugin-api/index.d.ts'
  )

  // Add wildcard module declarations for JSON files
  const jsonModuleDeclaration = `declare module "*.json" {
  const value: any;
  export default value;
}

declare module "*data.json" {
  const value: any;
  export default value;
}`
  monaco.typescript.typescriptDefaults.addExtraLib(
    jsonModuleDeclaration,
    'file:///node_modules/@types/json-module/index.d.ts'
  )

  monaco.typescript.javascriptDefaults.addExtraLib(
    jsonModuleDeclaration,
    'file:///node_modules/@types/json-module/index.d.ts'
  )
}

export function defineCustomTheme() {
  monaco.editor.defineTheme('plugin-theme', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1E1E1E',
      'editor.foreground': '#D4D4D4',
      'editor.lineHighlightBackground': '#2A2A2A',
      'editorCursor.foreground': '#FFFFFF',
      'editor.selectionBackground': '#264F78',
    }
  })
}

/**
 * Get the saved theme preference or default
 */
export function getSavedTheme(): string {
  return localStorage.getItem('editor-theme') || 'dark-plus'
}

/**
 * Change the editor theme
 */
export function changeTheme(themeName: string) {
  monaco.editor.setTheme(themeName)

  // Store theme preference
  localStorage.setItem('editor-theme', themeName)
}

export async function initializeEditor(
  container: HTMLElement,
  updateStatus: (message: string, type: StatusType) => void,
  showFilePickerCallback: () => void,
  switchToFileCallback: (path: string) => void
): Promise<monaco.editor.IStandaloneCodeEditor> {
  // Setup TypeScript environment first
  setupTypeScriptEnvironment()

  // Initialize Shiki for TextMate-based syntax highlighting
  updateStatus('Loading syntax highlighter...', 'normal')
  try {
    const highlighter = await createHighlighter({
      themes: [
        'dark-plus',
        'light-plus',
        'monokai',
        'github-dark',
        'github-light',
        'one-dark-pro',
        'dracula',
        'nord',
        'solarized-dark',
        'solarized-light',
      ],
      langs: ['typescript', 'javascript', 'json', 'plaintext']
    })

    shikiToMonaco(highlighter, monaco)
    console.log('Shiki TextMate grammars loaded successfully')

    // Store highlighter globally for theme switching
    ;(window as any).__shikiHighlighter = highlighter
  } catch (error) {
    console.error('Failed to initialize Shiki:', error)
    updateStatus('Warning: Syntax highlighter failed to load', 'error')
  }

  // Define custom theme
  defineCustomTheme()

  // Create a model with a proper URI including file extension
  const uri = monaco.Uri.parse('file:///plugin.ts')
  const model = monaco.editor.createModel('', 'typescript', uri)

  updateStatus('Initializing editor...', 'normal')

  // Load saved theme preference
  const savedTheme = getSavedTheme()

  const editor = monaco.editor.create(container, {
    model: model,
    theme: savedTheme,
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
    tabSize: 2,
    fontLigatures: true,
    inlayHints: {
      enabled: 'off'
    },
    quickSuggestions: {
      other: 'on',
      comments: 'off',
      strings: 'off'
    },
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnCommitCharacter: true,
    acceptSuggestionOnEnter: 'on',
    snippetSuggestions: 'inline',
    suggest: {
      showWords: true,
      showMethods: true,
      showFunctions: true,
      showConstructors: true,
      showFields: true,
      showVariables: true,
      showClasses: true,
      showStructs: true,
      showInterfaces: true,
      showModules: true,
      showProperties: true,
      showEvents: true,
      showOperators: true,
      showUnits: true,
      showValues: true,
      showConstants: true,
      showEnums: true,
      showEnumMembers: true,
      showKeywords: true,
      showSnippets: true,
      showColors: true,
      showFiles: true,
      showReferences: true,
      showFolders: true,
      showTypeParameters: true,
      showIssues: true,
      showUsers: true,
    },
    "semanticHighlighting.enabled": true,
  })

  monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource): boolean | Promise<boolean> {
      // Extract file path from URI like: file:///pluginId/path/to/file.ts
      // Remove leading / to get: pluginId/path/to/file.ts
      const fullPath = resource.path.substring(1)
      const parts = fullPath.split('/')
      // Skip the first part (pluginId) and join the rest to get: path/to/file.ts
      let filePath = parts.slice(1).join('/')

      // If the path is a .d.ts file for a JSON module, redirect to the actual .json file
      if (filePath.endsWith('.json.d.ts')) {
        filePath = filePath.replace('.json.d.ts', '.json')
      }

      if (filePath) {
        switchToFileCallback(filePath)
      }
      return true
    }
  })

  // Add command to switch between files via command palette
  editor.addAction({
    id: 'switch-file',
    label: 'Go to File...',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP],
    precondition: undefined,
    keybindingContext: undefined,
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.5,
    run: function() {
      showFilePickerCallback()
    }
  })

  updateStatus('Editor initialized', 'success')
  return editor
}

// Helper to extract exports from a file
function extractExports(content: string, filePath: string): Array<{ name: string, kind: string, isDefault?: boolean }> {
  const exports: Array<{ name: string, kind: string, isDefault?: boolean }> = []

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

// Extract imported symbols from file content
function extractImportedSymbols(content: string): Set<string> {
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

// Find existing import statement for a given path and determine how to add new import
function findExistingImport(content: string, importPath: string): {
  exists: boolean
  lineNumber?: number
  startColumn?: number
  endColumn?: number
  hasDefault?: boolean
  hasNamed?: boolean
  namedImports?: string[]
} {
  const lines = content.split('\n')

  // Normalize the import path for comparison (remove quotes and handle both relative paths)
  const normalizedPath = importPath.replace(/['"]/g, '')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Match import statements with the same path
    const importRegex = /import\s+(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]+)\})?\s+from\s+['"]([^'"]+)['"]/
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
          hasNamed: namedImports.length > 0,
          namedImports
        }
      }
    }
  }

  return { exists: false }
}

// Register completion provider for auto-imports
export function registerAutoImportCompletion(pluginId: string, files: Record<string, any>) {
  const disposeTS = monaco.languages.registerCompletionItemProvider('typescript', {
    provideCompletionItems: (model, position) => {
      // Check if we're inside an import statement
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })

      // Check if we're typing inside an import statement
      const insideImport = /^\s*import\s/.test(textUntilPosition)

      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      const currentUri = model.uri.toString()
      const currentFilePath = currentUri.replace(`file:///${pluginId}/`, '')

      // Get already imported symbols
      const currentContent = model.getValue()
      const alreadyImported = extractImportedSymbols(currentContent)

      const suggestions: any[] = []

      // Scan all files for exports
      Object.entries(files).forEach(([filePath, file]) => {
        // Skip current file - don't suggest imports from the same file
        if (filePath === currentFilePath) return

        let exports: Array<{ name: string, kind: string, isDefault?: boolean }> = []

        if (file.language === 'typescript' || file.language === 'javascript') {
          exports = extractExports(file.content, filePath)
        } else if (file.language === 'json') {
          // JSON files have a default export
          const fileName = filePath.substring(filePath.lastIndexOf('/') + 1).replace(/\.json$/, '')
          exports = [{ name: fileName, kind: 'default', isDefault: true }]
        } else {
          return // Skip other file types
        }

        exports.forEach(exp => {
          // Skip if already imported
          if (alreadyImported.has(exp.name)) {
            return
          }

          // Calculate relative import path
          const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))
          let relativePath: string

          if (currentDir) {
            // Both files are in directories
            const currentParts = currentDir.split('/')
            const targetParts = filePath.substring(0, filePath.lastIndexOf('/')).split('/')

            // Find common ancestor
            let commonLength = 0
            for (let i = 0; i < Math.min(currentParts.length, targetParts.length); i++) {
              if (currentParts[i] === targetParts[i]) {
                commonLength++
              } else {
                break
              }
            }

            const upLevels = currentParts.length - commonLength
            const downPath = targetParts.slice(commonLength)

            if (upLevels === 0 && downPath.length === 0) {
              // Same directory
              relativePath = './' + filePath.substring(filePath.lastIndexOf('/') + 1)
            } else {
              const upPart = '../'.repeat(upLevels)
              const downPart = downPath.length > 0 ? downPath.join('/') + '/' : ''
              relativePath = upPart + downPart + filePath.substring(filePath.lastIndexOf('/') + 1)
            }
          } else {
            // Current file is in root
            if (filePath.includes('/')) {
              relativePath = './' + filePath
            } else {
              relativePath = './' + filePath
            }
          }

          // Remove extension
          // Only strip .ts and .js extensions, keep .json
          relativePath = relativePath.replace(/\.(ts|js)$/, '')

          let importStatement: string
          let insertText: string

          if (exp.isDefault) {
            importStatement = `import ${exp.name} from "${relativePath}"`
            insertText = exp.name
          } else {
            importStatement = `import { ${exp.name} } from "${relativePath}"`
            insertText = exp.name
          }

          // Determine completion item kind
          let kind = monaco.languages.CompletionItemKind.Variable
          switch (exp.kind) {
            case 'function':
              kind = monaco.languages.CompletionItemKind.Function
              break
            case 'class':
              kind = monaco.languages.CompletionItemKind.Class
              break
            case 'interface':
              kind = monaco.languages.CompletionItemKind.Interface
              break
            case 'type':
              kind = monaco.languages.CompletionItemKind.TypeParameter
              break
            case 'enum':
              kind = monaco.languages.CompletionItemKind.Enum
              break
            case 'default':
              kind = monaco.languages.CompletionItemKind.Module
              break
          }

          // If we're inside an import statement, complete the current import with "from" part
          // Otherwise, add the full import at the top
          if (insideImport) {
            // Check if we need to complete the import structure
            // If the line already has "from", just insert the name
            // Otherwise, complete with from "path"
            const needsFromClause = !textUntilPosition.includes(' from ')

            let inlineInsertText = insertText

            if (needsFromClause) {
              // Check if we're in named imports { } or default import
              const inNamedImports = textUntilPosition.includes('{')

              if (inNamedImports) {
                // Add space after { if needed
                const needsSpaceAfterBrace = textUntilPosition.endsWith('{')
                const spacePrefix = needsSpaceAfterBrace ? ' ' : ''
                // Complete with: symbol from "path" (don't add }, Monaco already closed it)
                // Use additionalTextEdits to insert " from "path"" after the auto-closed }
                inlineInsertText = `${spacePrefix}${insertText}`

                // We need to find and move past the closing } and add the from clause
                // Use a command to trigger additional edits after insertion
                const fromClause = ` from "${relativePath}"`

                suggestions.push({
                  label: {
                    label: exp.name,
                    description: filePath,
                  },
                  kind: kind,
                  insertText: inlineInsertText,
                  range: range,
                  detail: `From ${filePath}`,
                  sortText: '0' + exp.name,
                  additionalTextEdits: [{
                    range: {
                      startLineNumber: position.lineNumber,
                      startColumn: position.column + insertText.length + (needsSpaceAfterBrace ? 1 : 0) + 2, // +2 for space and }
                      endLineNumber: position.lineNumber,
                      endColumn: position.column + insertText.length + (needsSpaceAfterBrace ? 1 : 0) + 2,
                    },
                    text: fromClause,
                  }],
                })
                return // Skip the normal push below
              } else {
                // Complete with: symbol from "path"
                inlineInsertText = `${insertText} from "${relativePath}"`
              }
            }

            suggestions.push({
              label: {
                label: exp.name,
                description: filePath,
              },
              kind: kind,
              insertText: inlineInsertText,
              range: range,
              detail: `From ${filePath}`,
              sortText: '0' + exp.name, // Sort higher when inside import
            })
          } else {
            // Check if there's already an import from this file
            const existingImport = findExistingImport(currentContent, relativePath)

            let additionalEdits: any[] = []

            if (existingImport.exists) {
              // Merge with existing import
              const lines = currentContent.split('\n')
              const existingLine = lines[existingImport.lineNumber! - 1]

              let newImportLine: string

              if (exp.isDefault) {
                // Adding a default import to existing named imports
                if (existingImport.hasNamed && !existingImport.hasDefault) {
                  // Replace: import { foo } from "./bar"
                  // With: import exp.name, { foo } from "./bar"
                  const namedPart = existingLine.match(/\{[^}]+\}/)?.[0] || ''
                  newImportLine = `import ${exp.name}, ${namedPart} from "${relativePath}"`
                } else {
                  // Already has default, shouldn't happen since we filter already imported
                  newImportLine = existingLine
                }
              } else {
                // Adding a named import
                if (existingImport.hasDefault) {
                  // Has default: import foo from "./bar"
                  // Add named: import foo, { exp.name } from "./bar"
                  const defaultMatch = existingLine.match(/import\s+(\w+)\s+from/)
                  if (defaultMatch) {
                    const defaultName = defaultMatch[1]
                    const existingNamed = existingImport.namedImports || []
                    const allNamed = [...existingNamed, exp.name].join(', ')
                    newImportLine = `import ${defaultName}, { ${allNamed} } from "${relativePath}"`
                  } else {
                    newImportLine = existingLine
                  }
                } else {
                  // Only has named imports: import { foo } from "./bar"
                  // Add to named: import { foo, exp.name } from "./bar"
                  const existingNamed = existingImport.namedImports || []
                  const allNamed = [...existingNamed, exp.name].join(', ')
                  newImportLine = `import { ${allNamed} } from "${relativePath}"`
                }
              }

              // Replace the existing import line
              additionalEdits = [{
                range: {
                  startLineNumber: existingImport.lineNumber!,
                  startColumn: 1,
                  endLineNumber: existingImport.lineNumber!,
                  endColumn: existingLine.length + 1,
                },
                text: newImportLine,
              }]
            } else {
              // No existing import, add new one
              additionalEdits = [{
                range: {
                  startLineNumber: 1,
                  startColumn: 1,
                  endLineNumber: 1,
                  endColumn: 1,
                },
                text: importStatement + '\n',
              }]
            }

            suggestions.push({
              label: {
                label: exp.name,
                description: filePath,
              },
              kind: kind,
              insertText: insertText,
              range: range,
              detail: `Auto import from ${filePath}`,
              documentation: existingImport.exists
                ? `Will merge with existing import from ${filePath}`
                : `Will add: ${importStatement}`,
              additionalTextEdits: additionalEdits,
              sortText: '1' + exp.name, // Sort auto-imports slightly lower
            })
          }
        })
      })

      return { suggestions }
    }
  })

  const disposeJS = monaco.languages.registerCompletionItemProvider('javascript', {
    provideCompletionItems: (model, position) => {
      // Check if we're inside an import statement
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })

      // Check if we're typing inside an import statement
      const insideImport = /^\s*import\s/.test(textUntilPosition)

      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      const currentUri = model.uri.toString()
      const currentFilePath = currentUri.replace(`file:///${pluginId}/`, '')

      // Get already imported symbols
      const currentContent = model.getValue()
      const alreadyImported = extractImportedSymbols(currentContent)

      const suggestions: any[] = []

      Object.entries(files).forEach(([filePath, file]) => {
        if (filePath === currentFilePath) return

        let exports: Array<{ name: string, kind: string, isDefault?: boolean }> = []

        if (file.language === 'typescript' || file.language === 'javascript') {
          exports = extractExports(file.content, filePath)
        } else if (file.language === 'json') {
          // JSON files have a default export
          const fileName = filePath.substring(filePath.lastIndexOf('/') + 1).replace(/\.json$/, '')
          exports = [{ name: fileName, kind: 'default', isDefault: true }]
        } else {
          return // Skip other file types
        }

        exports.forEach(exp => {
          // Skip if already imported
          if (alreadyImported.has(exp.name)) {
            return
          }

          const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))
          let relativePath: string

          if (currentDir) {
            const currentParts = currentDir.split('/')
            const targetParts = filePath.substring(0, filePath.lastIndexOf('/')).split('/')

            let commonLength = 0
            for (let i = 0; i < Math.min(currentParts.length, targetParts.length); i++) {
              if (currentParts[i] === targetParts[i]) {
                commonLength++
              } else {
                break
              }
            }

            const upLevels = currentParts.length - commonLength
            const downPath = targetParts.slice(commonLength)

            if (upLevels === 0 && downPath.length === 0) {
              relativePath = './' + filePath.substring(filePath.lastIndexOf('/') + 1)
            } else {
              const upPart = '../'.repeat(upLevels)
              const downPart = downPath.length > 0 ? downPath.join('/') + '/' : ''
              relativePath = upPart + downPart + filePath.substring(filePath.lastIndexOf('/') + 1)
            }
          } else {
            if (filePath.includes('/')) {
              relativePath = './' + filePath
            } else {
              relativePath = './' + filePath
            }
          }

          // Only strip .ts and .js extensions, keep .json
          relativePath = relativePath.replace(/\.(ts|js)$/, '')

          let importStatement: string
          let insertText: string

          if (exp.isDefault) {
            importStatement = `import ${exp.name} from "${relativePath}"`
            insertText = exp.name
          } else {
            importStatement = `import { ${exp.name} } from "${relativePath}"`
            insertText = exp.name
          }

          let kind = monaco.languages.CompletionItemKind.Variable
          switch (exp.kind) {
            case 'function':
              kind = monaco.languages.CompletionItemKind.Function
              break
            case 'class':
              kind = monaco.languages.CompletionItemKind.Class
              break
            case 'interface':
              kind = monaco.languages.CompletionItemKind.Interface
              break
            case 'type':
              kind = monaco.languages.CompletionItemKind.TypeParameter
              break
            case 'enum':
              kind = monaco.languages.CompletionItemKind.Enum
              break
            case 'default':
              kind = monaco.languages.CompletionItemKind.Module
              break
          }

          // If we're inside an import statement, complete the current import with "from" part
          // Otherwise, add the full import at the top
          if (insideImport) {
            // Check if we need to complete the import structure
            // If the line already has "from", just insert the name
            // Otherwise, complete with from "path"
            const needsFromClause = !textUntilPosition.includes(' from ')

            let inlineInsertText = insertText

            if (needsFromClause) {
              // Check if we're in named imports { } or default import
              const inNamedImports = textUntilPosition.includes('{')

              if (inNamedImports) {
                // Add space after { if needed
                const needsSpaceAfterBrace = textUntilPosition.endsWith('{')
                const spacePrefix = needsSpaceAfterBrace ? ' ' : ''
                // Complete with: symbol from "path" (don't add }, Monaco already closed it)
                // Use additionalTextEdits to insert " from "path"" after the auto-closed }
                inlineInsertText = `${spacePrefix}${insertText}`

                // We need to find and move past the closing } and add the from clause
                // Use a command to trigger additional edits after insertion
                const fromClause = ` from "${relativePath}"`

                suggestions.push({
                  label: {
                    label: exp.name,
                    description: filePath,
                  },
                  kind: kind,
                  insertText: inlineInsertText,
                  range: range,
                  detail: `From ${filePath}`,
                  sortText: '0' + exp.name,
                  additionalTextEdits: [{
                    range: {
                      startLineNumber: position.lineNumber,
                      startColumn: position.column + insertText.length + (needsSpaceAfterBrace ? 1 : 0) + 2, // +2 for space and }
                      endLineNumber: position.lineNumber,
                      endColumn: position.column + insertText.length + (needsSpaceAfterBrace ? 1 : 0) + 2,
                    },
                    text: fromClause,
                  }],
                })
                return // Skip the normal push below
              } else {
                // Complete with: symbol from "path"
                inlineInsertText = `${insertText} from "${relativePath}"`
              }
            }

            suggestions.push({
              label: {
                label: exp.name,
                description: filePath,
              },
              kind: kind,
              insertText: inlineInsertText,
              range: range,
              detail: `From ${filePath}`,
              sortText: '0' + exp.name, // Sort higher when inside import
            })
          } else {
            // Check if there's already an import from this file
            const existingImport = findExistingImport(currentContent, relativePath)

            let additionalEdits: any[] = []

            if (existingImport.exists) {
              // Merge with existing import
              const lines = currentContent.split('\n')
              const existingLine = lines[existingImport.lineNumber! - 1]

              let newImportLine: string

              if (exp.isDefault) {
                // Adding a default import to existing named imports
                if (existingImport.hasNamed && !existingImport.hasDefault) {
                  // Replace: import { foo } from "./bar"
                  // With: import exp.name, { foo } from "./bar"
                  const namedPart = existingLine.match(/\{[^}]+\}/)?.[0] || ''
                  newImportLine = `import ${exp.name}, ${namedPart} from "${relativePath}"`
                } else {
                  // Already has default, shouldn't happen since we filter already imported
                  newImportLine = existingLine
                }
              } else {
                // Adding a named import
                if (existingImport.hasDefault) {
                  // Has default: import foo from "./bar"
                  // Add named: import foo, { exp.name } from "./bar"
                  const defaultMatch = existingLine.match(/import\s+(\w+)\s+from/)
                  if (defaultMatch) {
                    const defaultName = defaultMatch[1]
                    const existingNamed = existingImport.namedImports || []
                    const allNamed = [...existingNamed, exp.name].join(', ')
                    newImportLine = `import ${defaultName}, { ${allNamed} } from "${relativePath}"`
                  } else {
                    newImportLine = existingLine
                  }
                } else {
                  // Only has named imports: import { foo } from "./bar"
                  // Add to named: import { foo, exp.name } from "./bar"
                  const existingNamed = existingImport.namedImports || []
                  const allNamed = [...existingNamed, exp.name].join(', ')
                  newImportLine = `import { ${allNamed} } from "${relativePath}"`
                }
              }

              // Replace the existing import line
              additionalEdits = [{
                range: {
                  startLineNumber: existingImport.lineNumber!,
                  startColumn: 1,
                  endLineNumber: existingImport.lineNumber!,
                  endColumn: existingLine.length + 1,
                },
                text: newImportLine,
              }]
            } else {
              // No existing import, add new one
              additionalEdits = [{
                range: {
                  startLineNumber: 1,
                  startColumn: 1,
                  endLineNumber: 1,
                  endColumn: 1,
                },
                text: importStatement + '\n',
              }]
            }

            suggestions.push({
              label: {
                label: exp.name,
                description: filePath,
              },
              kind: kind,
              insertText: insertText,
              range: range,
              detail: `Auto import from ${filePath}`,
              documentation: existingImport.exists
                ? `Will merge with existing import from ${filePath}`
                : `Will add: ${importStatement}`,
              additionalTextEdits: additionalEdits,
              sortText: '1' + exp.name,
            })
          }
        })
      })

      return { suggestions }
    }
  })

  return () => {
    disposeTS.dispose()
    disposeJS.dispose()
  }
}

// Register completion provider for import paths
export function registerImportPathCompletion(pluginId: string, files: Record<string, any>) {
  const disposeTS = monaco.languages.registerCompletionItemProvider('typescript', {
    triggerCharacters: ['"', "'", '/'],
    provideCompletionItems: (model, position) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })

      // Check if we're in an import statement
      const importMatch = textUntilPosition.match(/(?:import|from)\s+['"]([^'"]*?)$/)
      if (!importMatch) {
        return { suggestions: [] }
      }

      const typedPath = importMatch[1]
      const isRelative = typedPath.startsWith('./') || typedPath.startsWith('../')

      if (!isRelative && typedPath.length === 0) {
        // Suggest starting with ./
        return {
          suggestions: [{
            label: './',
            kind: monaco.languages.CompletionItemKind.Folder,
            insertText: './',
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            }
          }]
        }
      }

      if (isRelative) {
        // Get current file path to resolve relative imports
        const currentUri = model.uri.toString()
        const currentFilePath = currentUri.replace(`file:///${pluginId}/`, '')
        const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))

        // Resolve the directory we're completing in
        let targetDir = currentDir
        if (typedPath.startsWith('./')) {
          const subPath = typedPath.substring(2)
          const lastSlash = subPath.lastIndexOf('/')
          if (lastSlash > -1) {
            targetDir = currentDir ? `${currentDir}/${subPath.substring(0, lastSlash)}` : subPath.substring(0, lastSlash)
          }
        }

        // Find all files in the target directory
        const suggestions: any[] = []
        Object.keys(files).forEach(filePath => {
          const fileDir = filePath.substring(0, filePath.lastIndexOf('/'))
          const fileName = filePath.substring(filePath.lastIndexOf('/') + 1)

          // Check if file is in target directory
          if (fileDir === targetDir || (!targetDir && !filePath.includes('/'))) {
            // Don't suggest the current file
            if (filePath !== currentFilePath) {
              // Remove extension only for .ts and .js files, keep .json
              const baseName = fileName.replace(/\.(ts|js)$/, '')
              suggestions.push({
                label: fileName,
                kind: monaco.languages.CompletionItemKind.File,
                insertText: baseName,
                detail: filePath,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column - typedPath.split('/').pop()!.length,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                }
              })
            }
          }
        })

        return { suggestions }
      }

      return { suggestions: [] }
    }
  })

  const disposeJS = monaco.languages.registerCompletionItemProvider('javascript', {
    triggerCharacters: ['"', "'", '/'],
    provideCompletionItems: (model, position) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })

      const importMatch = textUntilPosition.match(/(?:import|from)\s+['"]([^'"]*?)$/)
      if (!importMatch) {
        return { suggestions: [] }
      }

      const typedPath = importMatch[1]
      const isRelative = typedPath.startsWith('./') || typedPath.startsWith('../')

      if (!isRelative && typedPath.length === 0) {
        return {
          suggestions: [{
            label: './',
            kind: monaco.languages.CompletionItemKind.Folder,
            insertText: './',
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            }
          }]
        }
      }

      if (isRelative) {
        const currentUri = model.uri.toString()
        const currentFilePath = currentUri.replace(`file:///${pluginId}/`, '')
        const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))

        let targetDir = currentDir
        if (typedPath.startsWith('./')) {
          const subPath = typedPath.substring(2)
          const lastSlash = subPath.lastIndexOf('/')
          if (lastSlash > -1) {
            targetDir = currentDir ? `${currentDir}/${subPath.substring(0, lastSlash)}` : subPath.substring(0, lastSlash)
          }
        }

        const suggestions: any[] = []
        Object.keys(files).forEach(filePath => {
          const fileDir = filePath.substring(0, filePath.lastIndexOf('/'))
          const fileName = filePath.substring(filePath.lastIndexOf('/') + 1)

          if (fileDir === targetDir || (!targetDir && !filePath.includes('/'))) {
            if (filePath !== currentFilePath) {
              // Remove extension only for .ts and .js files, keep .json
              const baseName = fileName.replace(/\.(ts|js)$/, '')
              suggestions.push({
                label: fileName,
                kind: monaco.languages.CompletionItemKind.File,
                insertText: baseName,
                detail: filePath,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column - typedPath.split('/').pop()!.length,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                }
              })
            }
          }
        })

        return { suggestions }
      }

      return { suggestions: [] }
    }
  })

  return () => {
    disposeTS.dispose()
    disposeJS.dispose()
  }
}

export function updateMonacoFileSystem(pluginId: string, files: Record<string, any>) {
  // Get all existing extra libs
  const existingLibs = monaco.typescript.typescriptDefaults.getExtraLibs()

  // Clear all old plugin files by setting them to empty string
  Object.keys(existingLibs).forEach(path => {
    if (path.startsWith('file:///') && !path.includes('plugin-api') && !path.includes('json-module')) {
      monaco.typescript.typescriptDefaults.addExtraLib('', path)
      monaco.typescript.javascriptDefaults.addExtraLib('', path)
    }
  })

  // Add JS/TS/JSON files to Monaco's type system with plugin-specific URIs
  Object.values(files).forEach((file: any) => {
    const uri = `file:///${pluginId}/${file.path}`

    if (file.language === 'typescript' || file.language === 'javascript') {
      // Add the actual file content for TS/JS files
      monaco.typescript.typescriptDefaults.addExtraLib(file.content, uri)
      monaco.typescript.javascriptDefaults.addExtraLib(file.content, uri)
    } else if (file.language === 'json') {
      // For JSON files, we need to:
      // 1. Create a virtual .d.ts file that declares the JSON module
      // 2. This makes TypeScript recognize the JSON file as a module
      // 3. Use a different URI (.d.ts) so TypeScript doesn't try to validate the actual JSON content

      const dtsUri = uri.replace('.json', '.json.d.ts')

      try {
        const jsonContent = JSON.parse(file.content || '{}')
        const inferredType = inferJsonType(jsonContent)

        // Create a TypeScript declaration module
        const tsModuleContent = `declare const value: ${inferredType};
export default value;`

        // Add this as a TypeScript module declaration
        monaco.typescript.typescriptDefaults.addExtraLib(tsModuleContent, dtsUri)
        monaco.typescript.javascriptDefaults.addExtraLib(tsModuleContent, dtsUri)
      } catch {
        // If JSON is invalid, create a module with any type
        const tsModuleContent = `declare const value: any;
export default value;`

        monaco.typescript.typescriptDefaults.addExtraLib(tsModuleContent, dtsUri)
        monaco.typescript.javascriptDefaults.addExtraLib(tsModuleContent, dtsUri)
      }
    }
  })

  // Don't create Monaco models here - they're created in loadPlugin
  // This function only manages the TypeScript virtual file system
}

// Helper function to infer TypeScript type from JSON value
function inferJsonType(value: any): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (value.length === 0) return 'any[]'
    const itemTypes = value.map(item => inferJsonType(item))
    const uniqueTypes = [...new Set(itemTypes)]
    return uniqueTypes.length === 1 ? `${uniqueTypes[0]}[]` : '(' + uniqueTypes.join(' | ') + ')[]'
  }
  if (typeof value === 'object') {
    const props = Object.entries(value)
      .map(([key, val]) => `  ${JSON.stringify(key)}: ${inferJsonType(val)}`)
      .join(';\n')
    return `{\n${props}\n}`
  }
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'any'
}
