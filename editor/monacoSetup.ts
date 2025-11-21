import * as monaco from 'monaco-editor'
import { createHighlighter } from 'shiki'
import { shikiToMonaco } from '@shikijs/monaco'
import pluginApiTypes from './plugin-api.d.ts?raw'
import type { StatusType } from './types'

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

  // Add wildcard module declaration for JSON files
  const jsonModuleDeclaration = `declare module "*.json" {
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
      themes: ['dark-plus'],
      langs: ['typescript', 'javascript', 'json', 'plaintext']
    })

    shikiToMonaco(highlighter, monaco)
    console.log('Shiki TextMate grammars loaded successfully')
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

  const editor = monaco.editor.create(container, {
    model: model,
    theme: 'dark-plus',
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
    tabSize: 2,
    fontLigatures: true,
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    "semanticHighlighting.enabled": true,
  })

  monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource): boolean | Promise<boolean> {
      // Extract file path from URI like: file:///pluginId/path/to/file.ts
      // Remove leading / to get: pluginId/path/to/file.ts
      const fullPath = resource.path.substring(1)
      const parts = fullPath.split('/')
      // Skip the first part (pluginId) and join the rest to get: path/to/file.ts
      const filePath = parts.slice(1).join('/')
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
              // Remove extension for the suggestion
              const baseName = fileName.replace(/\.(ts|js|json)$/, '')
              const displayName = fileName

              suggestions.push({
                label: displayName,
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
              const baseName = fileName.replace(/\.(ts|js|json)$/, '')
              const displayName = fileName

              suggestions.push({
                label: displayName,
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
      // 1. Create a virtual .ts file that exports the JSON as a typed constant
      // 2. This makes TypeScript recognize the JSON file as a module

      try {
        const jsonContent = JSON.parse(file.content || '{}')
        const inferredType = inferJsonType(jsonContent)

        // Create a TypeScript module that exports the JSON value
        const tsModuleContent = `const value: ${inferredType} = ${file.content || '{}'};
export default value;`

        // Add this as a TypeScript module
        monaco.typescript.typescriptDefaults.addExtraLib(tsModuleContent, uri)
        monaco.typescript.javascriptDefaults.addExtraLib(tsModuleContent, uri)
      } catch {
        // If JSON is invalid, create a module with any type
        const tsModuleContent = `const value: any = {};
export default value;`

        monaco.typescript.typescriptDefaults.addExtraLib(tsModuleContent, uri)
        monaco.typescript.javascriptDefaults.addExtraLib(tsModuleContent, uri)
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
