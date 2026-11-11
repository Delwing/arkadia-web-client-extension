import * as monaco from 'monaco-editor'
import {createHighlighterCore} from 'shiki/core'
import {createOnigurumaEngine} from 'shiki/engine/oniguruma'
import {shikiToMonaco} from '@shikijs/monaco'
import type {IPosition, IRange} from 'monaco-editor'
import type {StatusType} from '../types'
import {registerSnippets} from '../snippets'
import {applyThemeToUI, defineCustomTheme, editorThemes, getEditorPrefs, getSavedTheme} from './themes'
import {setupTypeScriptEnvironment} from './typings'

/**
 * One-time Monaco setup: the plugin typings, Shiki highlighting, the theme,
 * snippets, and following definitions into other files (`openFile` gets the
 * editor the jump started in).
 */
export async function setupMonaco(
  updateStatus: (message: string, type: StatusType) => void,
  openFile: (path: string, position: IPosition | IRange | undefined, source: monaco.editor.ICodeEditor) => void
): Promise<void> {
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

  monaco.editor.registerEditorOpener({
    openCodeEditor(source, resource, position): boolean | Promise<boolean> {

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
        openFile(filePath, position, source)
      }
      return false
    }
  })

  // Apply initial theme to UI
  applyThemeToUI(getSavedTheme())
  updateStatus('Editor initialized', 'success')
}

/** One code editor (an editor group's), with the editor's options and actions. */
export function createCodeEditor(
  container: HTMLElement,
  actions: { showFilePicker: () => void; splitEditor: () => void; compareWithSaved: () => void }
): monaco.editor.IStandaloneCodeEditor {
  const editor = monaco.editor.create(container, {
    model: null,
    theme: getSavedTheme(),
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

  // Add command to switch between files via command palette
  editor.addAction({
    id: 'switch-file',
    label: 'Go to File...',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP],
    precondition: undefined,
    keybindingContext: undefined,
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.5,
    run: () => actions.showFilePicker(),
  })

  editor.addAction({
    id: 'compare-with-saved',
    label: 'Compare with Saved',
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.6,
    run: () => actions.compareWithSaved(),
  })

  editor.addAction({
    id: 'split-editor',
    label: 'Split Editor Right',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backslash],
    run: () => actions.splitEditor(),
  })

  return editor
}
