import * as monaco from 'monaco-editor'
import {createHighlighterCore} from 'shiki/core'
import {createOnigurumaEngine} from 'shiki/engine/oniguruma'
import {shikiToMonaco} from '@shikijs/monaco'
import type {IPosition, IRange} from 'monaco-editor'
import type {StatusType} from '../types'
import {registerSnippets} from '../snippets'
import {applyThemeToUI, defineCustomTheme, editorThemes, getEditorPrefs, getSavedTheme} from './themes'
import {setupTypeScriptEnvironment} from './typings'

/** Monaco with the plugin typings, Shiki highlighting, snippets and the file-switching hooks. */
export async function initializeEditor(
  container: HTMLElement,
  updateStatus: (message: string, type: StatusType) => void,
  showFilePickerCallback: () => void,
  switchToFileCallback: (path: string, position?: IPosition | IRange) => void
): Promise<monaco.editor.IStandaloneCodeEditor> {
  // Setup TypeScript environment first
  setupTypeScriptEnvironment()

  // Initialize Shiki for TextMate-based syntax highlighting
  updateStatus('Loading syntax highlighter...', 'normal')
  try {
    const highlighter = await createHighlighterCore({
      themes: editorThemes(),
      langs: [
        import('shiki/langs/typescript.mjs'),
        import('shiki/langs/javascript.mjs'),
        import('shiki/langs/json.mjs'),
      ],
      engine: createOnigurumaEngine(import('shiki/wasm')),
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

  // Register snippets
  registerSnippets()

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
    minimap: { enabled: getEditorPrefs().minimap },
    fontSize: getEditorPrefs().fontSize,
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
    openCodeEditor(_source, resource, position): boolean | Promise<boolean> {

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
        switchToFileCallback(filePath, position)
      }
      return false
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

  // Apply initial theme to UI
  applyThemeToUI(savedTheme)

  updateStatus('Editor initialized', 'success')
  return editor
}
