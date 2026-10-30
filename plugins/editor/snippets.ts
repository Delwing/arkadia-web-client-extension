import * as monaco from 'monaco-editor'

interface Snippet {
  label: string
  description: string
  insertText: string
  documentation?: string
}

const snippets: Snippet[] = [
  {
    label: 'alias',
    description: 'Create an alias pattern',
    insertText: `api.aliases.register(/^\${1:pattern}$/, (matches) => {
  \${2:// Your code here}
})`,
    documentation: 'Adds a new alias that triggers on matching pattern'
  },
  {
    label: 'trigger',
    description: 'Create a trigger',
    insertText: `api.triggers.register(/^\${1:pattern}$/, (line, matches, type, originalLine) => {
  \${2:// Your code here}
})`,
    documentation: 'Adds a new trigger that fires on matching text'
  },
  {
    label: 'eventListener',
    description: 'Add an event listener',
    insertText: `api.events.on('\${1:eventName}', (payload) => {
  \${2:// Your code here}
})`,
    documentation: 'Adds an event listener for a specific event'
  },
  {
    label: 'fBind',
    description: 'Create a functional key binding',
    insertText: `api.bind.set('\${1:printable}', () => {
  \${2:// Your code here}
})`,
    documentation: 'Adds a function key binding'
  }
]

export function registerSnippets() {
  const providers: monaco.IDisposable[] = []

  // Register for TypeScript
  providers.push(
    monaco.languages.registerCompletionItemProvider('typescript', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        const suggestions = snippets.map(snippet => ({
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: snippet.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: snippet.documentation || snippet.description,
          detail: snippet.description,
          range: range,
          sortText: '0_' + snippet.label, // Sort snippets higher
        }))

        return { suggestions }
      }
    })
  )

  // Register for JavaScript
  providers.push(
    monaco.languages.registerCompletionItemProvider('javascript', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        const suggestions = snippets.map(snippet => ({
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: snippet.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: snippet.documentation || snippet.description,
          detail: snippet.description,
          range: range,
          sortText: '0_' + snippet.label,
        }))

        return { suggestions }
      }
    })
  )

  return () => {
    providers.forEach(p => p.dispose())
  }
}
