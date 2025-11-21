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
      langs: ['typescript', 'javascript', 'json']
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
      const fullPath = resource.path.substring(1) // Remove leading /
      const parts = fullPath.split('/')
      // Skip the first part (pluginId) and join the rest
      const filePath = parts.slice(1).join('/')
      switchToFileCallback(filePath)
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

export function updateMonacoFileSystem(pluginId: string, files: Record<string, any>) {
  // Get all existing extra libs
  const existingLibs = monaco.typescript.typescriptDefaults.getExtraLibs()

  // Clear all old plugin files by setting them to empty string
  Object.keys(existingLibs).forEach(path => {
    if (path.startsWith('file:///') && !path.includes('plugin-api')) {
      monaco.typescript.typescriptDefaults.addExtraLib('', path)
      monaco.typescript.javascriptDefaults.addExtraLib('', path)
    }
  })

  // Add all current plugin files to Monaco's type system with plugin-specific URIs
  Object.values(files).forEach((file: any) => {
    const uri = `file:///${pluginId}/${file.path}`
    monaco.typescript.typescriptDefaults.addExtraLib(file.content, uri)
    monaco.typescript.javascriptDefaults.addExtraLib(file.content, uri)
  })
}
