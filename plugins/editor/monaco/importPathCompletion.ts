/**
 * Completing the path in `import … from "./"`: the files of the plugin in the
 * folder typed so far, without .ts or .js (a .json keeps its extension).
 */
import * as monaco from 'monaco-editor'
import type {PluginFile} from '@client/utils/pluginEditorStorage.ts'

const provider = (pluginId: string, files: Record<string, PluginFile>): monaco.languages.CompletionItemProvider => ({
  triggerCharacters: ['"', "'", '/'],
  provideCompletionItems: (model, position) => {
    const textUntilPosition = model.getValueInRange({
      startLineNumber: position.lineNumber,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    })

    const importMatch = textUntilPosition.match(/(?:import|from)\s+['"]([^'"]*?)$/)
    if (!importMatch) return {suggestions: []}

    const typedPath = importMatch[1]
    const isRelative = typedPath.startsWith('./') || typedPath.startsWith('../')
    const atCursor = {startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column}

    if (!isRelative) {
      // Nothing typed yet: start a relative path
      return typedPath.length === 0
        ? {suggestions: [{label: './', kind: monaco.languages.CompletionItemKind.Folder, insertText: './', range: atCursor}]}
        : {suggestions: []}
    }

    const currentFilePath = model.uri.toString().replace(`file:///${pluginId}/`, '')
    const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))

    // The folder being completed in
    let targetDir = currentDir
    if (typedPath.startsWith('./')) {
      const subPath = typedPath.substring(2)
      const lastSlash = subPath.lastIndexOf('/')
      if (lastSlash > -1) {
        targetDir = currentDir ? `${currentDir}/${subPath.substring(0, lastSlash)}` : subPath.substring(0, lastSlash)
      }
    }

    const suggestions: monaco.languages.CompletionItem[] = []
    for (const filePath of Object.keys(files)) {
      const fileDir = filePath.substring(0, filePath.lastIndexOf('/'))
      const fileName = filePath.substring(filePath.lastIndexOf('/') + 1)
      const inTarget = fileDir === targetDir || (!targetDir && !filePath.includes('/'))
      if (!inTarget || filePath === currentFilePath) continue
      suggestions.push({
        label: fileName,
        kind: monaco.languages.CompletionItemKind.File,
        insertText: fileName.replace(/\.(ts|js)$/, ''),
        detail: filePath,
        range: {...atCursor, startColumn: position.column - typedPath.split('/').pop()!.length},
      })
    }
    return {suggestions}
  },
})

/** Register path completion for the open plugin's TS and JS files. Returns the function that removes it. */
export function registerImportPathCompletion(pluginId: string, files: Record<string, PluginFile>): () => void {
  const disposables = (['typescript', 'javascript'] as const)
    .map(language => monaco.languages.registerCompletionItemProvider(language, provider(pluginId, files)))
  return () => disposables.forEach(d => d.dispose())
}
