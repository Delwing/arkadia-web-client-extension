/** The side panel showing the open plugin bundled to JavaScript. */
import * as monaco from 'monaco-editor'
import {updateStatus} from './utils'
import {getEditorPrefs, getSavedTheme} from './monaco/themes'
import {bundleOpenPlugin, state} from './session'

let jsPreviewEditor: monaco.editor.IStandaloneCodeEditor | null = null
let jsPreviewVisible = false

/** The preview's editor, once the panel has been opened. */
export function getJsPreviewEditor(): monaco.editor.IStandaloneCodeEditor | null {
  return jsPreviewEditor
}

// JS Preview panel functions
function initJsPreviewEditor() {
  if (jsPreviewEditor) return

  const container = document.getElementById('js-preview-editor')!
  jsPreviewEditor = monaco.editor.create(container, {
    value: '// Compiled JavaScript will appear here\n// Click "Refresh" or edit TypeScript code to see the output',
    language: 'javascript',
    readOnly: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: 'on',
    theme: getSavedTheme(),
    fontSize: getEditorPrefs().fontSize,
    lineNumbers: 'on',
    folding: true,
  })
}

export function toggleJsPreview() {
  const panel = document.getElementById('js-preview-panel')!
  jsPreviewVisible = !jsPreviewVisible

  document.getElementById('toggle-js-preview-btn')!.classList.toggle('active', jsPreviewVisible)

  if (jsPreviewVisible) {
    panel.style.display = 'flex'
    if (!jsPreviewEditor) {
      initJsPreviewEditor()
    }
    refreshJsPreview()
  } else {
    panel.style.display = 'none'
  }
}

export async function refreshJsPreview() {
  if (!jsPreviewEditor || !state.currentPlugin) {
    if (jsPreviewEditor) {
      jsPreviewEditor.setValue('// No plugin loaded')
    }
    return
  }

  try {
    // Bundle the entire plugin to get the compiled output
    const filesRecord: Record<string, import('../../src/client/utils/pluginEditorStorage').PluginFile> = {}
    for (const [path, file] of Object.entries(state.currentPlugin.files)) {
      filesRecord[path] = file
    }

    const compiled = await bundleOpenPlugin(filesRecord, state.currentPlugin.entryPoint)
    jsPreviewEditor.setValue(compiled)
    updateStatus('JS preview updated', 'success')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    jsPreviewEditor.setValue(`// Compilation error:\n// ${errorMessage}`)
    updateStatus('JS preview compilation failed', 'error')
  }
}

export async function copyJsPreview() {
  if (!jsPreviewEditor) return

  const code = jsPreviewEditor.getValue()
  try {
    await navigator.clipboard.writeText(code)
    updateStatus('Copied to clipboard', 'success')
  } catch (error) {
    updateStatus(`Failed to copy to clipboard ${error.message}`, 'error')
  }
}

/** Wire the panel's toggle, close, refresh and copy buttons. */
export function setupJsPreview() {
  // Toggle JS preview panel
  const toggleJsPreviewBtn = document.getElementById('toggle-js-preview-btn')!
  toggleJsPreviewBtn.addEventListener('click', toggleJsPreview)

  const jsPreviewCloseBtn = document.getElementById('js-preview-close-btn')!
  jsPreviewCloseBtn.addEventListener('click', () => {
    jsPreviewVisible = false
    document.getElementById('js-preview-panel')!.style.display = 'none'
    toggleJsPreviewBtn.classList.remove('active')
  })

  const jsPreviewRefreshBtn = document.getElementById('js-preview-refresh-btn')!
  jsPreviewRefreshBtn.addEventListener('click', refreshJsPreview)

  const jsPreviewCopyBtn = document.getElementById('js-preview-copy-btn')!
  jsPreviewCopyBtn.addEventListener('click', copyJsPreview)
}
