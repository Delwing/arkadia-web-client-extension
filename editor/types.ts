import type * as monaco from 'monaco-editor'
import type { EditorPluginData, PluginFile } from '@client/utils/pluginEditorStorage.ts'

export interface TreeNode {
  name: string
  path: string
  isDirectory: boolean
  children: TreeNode[]
  file?: PluginFile
}

export interface EditorState {
  editor: monaco.editor.IStandaloneCodeEditor | null
  currentPluginId: string | null
  currentFilePath: string | null
  currentPlugin: EditorPluginData | null
  editorModels: Map<string, monaco.editor.ITextModel>
  modifiedFiles: Set<string>
  esbuildInitialized: boolean
}

export interface ContextMenuTarget {
  path: string
  name: string
  isFolder?: boolean
}

export type StatusType = 'normal' | 'success' | 'error'
