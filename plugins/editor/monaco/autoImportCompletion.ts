/**
 * Completions that import what they complete: names the plugin API exports,
 * and names other files of the plugin export.
 *
 * Inside an import statement a completion finishes that statement (adding
 * its `from` clause when missing). Elsewhere it adds an import at the top of
 * the file, or merges into an existing import of the same module.
 */
import * as monaco from 'monaco-editor'
import type {PluginFile} from '@client/utils/pluginEditorStorage.ts'
import {
  extractExports,
  extractImportedSymbols,
  findExistingImport,
  findPluginTypesImport,
  mergeApiImport,
  mergeFileImport,
  pluginApiExports,
  relativeImportPath,
  type FileExport,
} from './importAnalysis'
import {PLUGIN_TYPES_MODULE} from './moduleNames'

const Kind = monaco.languages.CompletionItemKind
type Suggestion = monaco.languages.CompletionItem

const API_KINDS: Record<string, monaco.languages.CompletionItemKind> = {
  function: Kind.Function,
  class: Kind.Class,
  interface: Kind.Interface,
  type: Kind.TypeParameter,
}

const FILE_KINDS: Record<string, monaco.languages.CompletionItemKind> = {
  ...API_KINDS,
  enum: Kind.Enum,
  default: Kind.Module,
}

/** Where the cursor is, and what the file already imports. */
interface Context {
  model: monaco.editor.ITextModel
  position: monaco.Position
  range: monaco.IRange
  textUntilPosition: string
  insideImport: boolean
  content: string
}

/**
 * A completion inside an import statement: the name, plus ` from "module"`
 * when the line has no `from` clause yet. In named imports Monaco has already
 * closed the brace, so the clause goes after it as an additional edit.
 */
function inlineImport(ctx: Context, name: string, module: string, base: Omit<Suggestion, 'insertText' | 'range'>): Suggestion {
  const {position, textUntilPosition} = ctx
  const needsFromClause = !ctx.model.getLineContent(position.lineNumber).includes(' from ')
  if (!needsFromClause) return {...base, insertText: name, range: ctx.range}

  if (!textUntilPosition.includes('{')) return {...base, insertText: `${name} from "${module}"`, range: ctx.range}

  const needsSpaceAfterBrace = textUntilPosition.endsWith('{')
  // +2: past the space and the closing brace
  const column = position.column + name.length + (needsSpaceAfterBrace ? 1 : 0) + 2
  return {
    ...base,
    insertText: `${needsSpaceAfterBrace ? ' ' : ''}${name}`,
    range: ctx.range,
    additionalTextEdits: [{
      range: {startLineNumber: position.lineNumber, startColumn: column, endLineNumber: position.lineNumber, endColumn: column},
      text: ` from "${module}"`,
    }],
  }
}

/** An edit that replaces line `lineNumber` of the file, or adds a line at the top. */
function importEdit(ctx: Context, line: string, lineNumber?: number): monaco.languages.TextEdit {
  if (lineNumber === undefined) {
    return {range: {startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1}, text: line + '\n'}
  }
  const existingLine = ctx.content.split('\n')[lineNumber - 1]
  return {range: {startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: existingLine.length + 1}, text: line}
}

function apiSuggestions(ctx: Context, imported: Set<string>, typeOnly: boolean): Suggestion[] {
  return pluginApiExports().filter(exp => !imported.has(exp.name)).map(exp => {
    const kind = API_KINDS[exp.kind] ?? Kind.Variable
    const label = {label: exp.name, description: PLUGIN_TYPES_MODULE}
    if (ctx.insideImport) {
      return inlineImport(ctx, exp.name, PLUGIN_TYPES_MODULE, {
        label,
        kind,
        detail: `(${exp.kind}) from ${PLUGIN_TYPES_MODULE}`,
        documentation: exp.documentation ? {value: exp.documentation} : undefined,
        sortText: '0' + exp.name,
      })
    }

    const importStatement = `import ${typeOnly ? 'type ' : ''}{ ${exp.name} } from "${PLUGIN_TYPES_MODULE}"`
    const existing = findPluginTypesImport(ctx.content)
    const note = existing.exists ? `Will merge with existing import from ${PLUGIN_TYPES_MODULE}` : null
    return {
      label,
      kind,
      insertText: exp.name,
      range: ctx.range,
      detail: `(${exp.kind}) Auto import from ${PLUGIN_TYPES_MODULE}`,
      documentation: exp.documentation
        ? {value: `${exp.documentation}\n\n---\n\n${note ?? `Will add: \`${importStatement}\``}`}
        : note ?? `Will add: ${importStatement}`,
      additionalTextEdits: [existing.exists
        ? importEdit(ctx, mergeApiImport(existing, exp.name, typeOnly), existing.lineNumber)
        : importEdit(ctx, importStatement)],
      sortText: '0' + exp.name,
    }
  })
}

/** What another file of the plugin exports; a JSON file exports itself by its name. */
function exportsOf(filePath: string, file: PluginFile): FileExport[] {
  if (file.language === 'typescript' || file.language === 'javascript') return extractExports(file.content, filePath)
  if (file.language === 'json') {
    const fileName = filePath.substring(filePath.lastIndexOf('/') + 1).replace(/\.json$/, '')
    return [{name: fileName, kind: 'default', isDefault: true}]
  }
  return []
}

function fileSuggestions(ctx: Context, imported: Set<string>, currentFilePath: string, files: Record<string, PluginFile>): Suggestion[] {
  const suggestions: Suggestion[] = []
  for (const [filePath, file] of Object.entries(files)) {
    if (filePath === currentFilePath) continue
    for (const exp of exportsOf(filePath, file)) {
      if (imported.has(exp.name)) continue
      const path = relativeImportPath(currentFilePath, filePath)
      const kind = FILE_KINDS[exp.kind] ?? Kind.Variable
      const label = {label: exp.name, description: filePath}

      if (ctx.insideImport) {
        suggestions.push(inlineImport(ctx, exp.name, path, {label, kind, detail: `From ${filePath}`, sortText: '0' + exp.name}))
        continue
      }

      const importStatement = exp.isDefault ? `import ${exp.name} from "${path}"` : `import { ${exp.name} } from "${path}"`
      const existing = findExistingImport(ctx.content, path)
      const edit = existing.exists
        ? importEdit(ctx, mergeFileImport(ctx.content.split('\n')[existing.lineNumber! - 1], existing, exp, path), existing.lineNumber)
        : importEdit(ctx, importStatement)
      suggestions.push({
        label,
        kind,
        insertText: exp.name,
        range: ctx.range,
        detail: `Auto import from ${filePath}`,
        documentation: existing.exists ? `Will merge with existing import from ${filePath}` : `Will add: ${importStatement}`,
        additionalTextEdits: [edit],
        sortText: '1' + exp.name, // below names already in reach
      })
    }
  }
  return suggestions
}

/**
 * Register the completions for the open plugin, in TypeScript and
 * JavaScript files alike (JavaScript imports API names as values, since it
 * has no `import type`). Returns the function that removes them.
 */
export function registerAutoImportCompletion(pluginId: string, files: Record<string, PluginFile>): () => void {
  const disposables = (['typescript', 'javascript'] as const).map(language =>
    monaco.languages.registerCompletionItemProvider(language, {
      provideCompletionItems: (model, position) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        })
        const word = model.getWordUntilPosition(position)
        const ctx: Context = {
          model,
          position,
          range: {startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn},
          textUntilPosition,
          insideImport: /^\s*import\s/.test(textUntilPosition),
          content: model.getValue(),
        }
        const currentFilePath = model.uri.toString().replace(`file:///${pluginId}/`, '')
        const imported = extractImportedSymbols(ctx.content)
        return {
          suggestions: [
            ...apiSuggestions(ctx, imported, language === 'typescript'),
            ...fileSuggestions(ctx, imported, currentFilePath, files),
          ],
        }
      },
    }),
  )
  return () => disposables.forEach(d => d.dispose())
}
