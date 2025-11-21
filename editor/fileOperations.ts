import * as monaco from 'monaco-editor'
import type { EditorPluginData } from '../src/client/utils/pluginEditorStorage'
import { createPluginFile, getLanguageFromPath } from '@client/utils/pluginEditorStorage.ts'
import type { StatusType } from './types'

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

export function deleteFile(
  filePath: string,
  plugin: EditorPluginData,
  editorModels: Map<string, monaco.editor.ITextModel>,
  currentFilePath: string | null,
  updateStatus: (message: string, type: StatusType) => void,
  switchToFile: (path: string) => void
): boolean {
  const fileCount = Object.keys(plugin.files).length
  if (fileCount <= 1) {
    updateStatus('Cannot delete the last file', 'error')
    return false
  }

  if (!confirm(`Delete file "${filePath}"?`)) return false

  // Delete file
  delete plugin.files[filePath]

  // Dispose model
  const model = editorModels.get(filePath)
  if (model) {
    model.dispose()
    editorModels.delete(filePath)
  }

  // Switch to another file if this was the current file
  if (currentFilePath === filePath) {
    const remainingFiles = Object.keys(plugin.files)
    if (remainingFiles.length > 0) {
      switchToFile(remainingFiles[0])
      if (!plugin.entryPoint || plugin.entryPoint === filePath) {
        plugin.entryPoint = remainingFiles[0]
      }
    }
  }

  updateStatus(`Deleted: ${filePath}`, 'success')
  return true
}

export function deleteFolder(
  folderPath: string,
  plugin: EditorPluginData,
  editorModels: Map<string, monaco.editor.ITextModel>,
  modifiedFiles: Set<string>,
  currentFilePath: string | null,
  updateStatus: (message: string, type: StatusType) => void,
  switchToFile: (path: string) => void
): boolean {
  // Find all files in this folder
  const filesInFolder = Object.keys(plugin.files).filter(filePath =>
    filePath.startsWith(folderPath + '/')
  )

  // Check if deleting would leave us with no files
  const remainingFiles = Object.keys(plugin.files).length - filesInFolder.length
  if (remainingFiles < 1) {
    updateStatus('Cannot delete folder: plugin must have at least one file', 'error')
    return false
  }

  if (!confirm(`Delete folder "${folderPath}" and all its contents (${filesInFolder.length} files)?`)) return false

  // Delete all files in the folder
  for (const filePath of filesInFolder) {
    delete plugin.files[filePath]

    // Dispose model
    const model = editorModels.get(filePath)
    if (model) {
      model.dispose()
      editorModels.delete(filePath)
    }

    // Remove from modified files set
    modifiedFiles.delete(filePath)
  }

  // Remove folder from folders array
  if (plugin.folders) {
    plugin.folders = plugin.folders.filter(folder =>
      folder !== folderPath && !folder.startsWith(folderPath + '/')
    )
  }

  // Switch to another file if current file was deleted
  if (currentFilePath && filesInFolder.includes(currentFilePath)) {
    const remainingFilesList = Object.keys(plugin.files)
    if (remainingFilesList.length > 0) {
      switchToFile(remainingFilesList[0])
      if (!plugin.entryPoint || filesInFolder.includes(plugin.entryPoint)) {
        plugin.entryPoint = remainingFilesList[0]
      }
    }
  }

  updateStatus(`Deleted folder: ${folderPath} (${filesInFolder.length} files)`, 'success')
  return true
}

export function renameFile(
  oldPath: string,
  newPath: string,
  plugin: EditorPluginData,
  pluginId: string,
  editorModels: Map<string, monaco.editor.ITextModel>,
  currentFilePath: string | null,
  updateStatus: (message: string, type: StatusType) => void,
  switchToFile: (path: string) => void
): boolean {
  const file = plugin.files[oldPath]
  if (!file) {
    updateStatus(`File not found: ${oldPath}`, 'error')
    return false
  }

  // Get the current content from the model if it exists, otherwise use stored content
  const model = editorModels.get(oldPath)
  const currentContent = model ? model.getValue() : file.content

  // Create new file with new path and current content
  plugin.files[newPath] = {
    ...file,
    path: newPath,
    language: getLanguageFromPath(newPath),
    content: currentContent
  }

  // Delete old file
  delete plugin.files[oldPath]

  // Handle editor model - dispose old model
  if (model) {
    model.dispose()
    editorModels.delete(oldPath)
  }

  // Also check if Monaco has a model with the old URI and dispose it
  const oldUri = monaco.Uri.parse(`file:///${pluginId}/${oldPath}`)
  const oldMonacoModel = monaco.editor.getModel(oldUri)
  if (oldMonacoModel && oldMonacoModel !== model) {
    oldMonacoModel.dispose()
  }

  // Update Monaco virtual file system (for JS/TS/JSON files)
  const newLanguage = getLanguageFromPath(newPath)
  if (newLanguage === 'typescript' || newLanguage === 'javascript') {
    // Clear old path
    monaco.typescript.typescriptDefaults.addExtraLib('', `file:///${pluginId}/${oldPath}`)
    monaco.typescript.javascriptDefaults.addExtraLib('', `file:///${pluginId}/${oldPath}`)

    // Add new path
    monaco.typescript.typescriptDefaults.addExtraLib(currentContent, `file:///${pluginId}/${newPath}`)
    monaco.typescript.javascriptDefaults.addExtraLib(currentContent, `file:///${pluginId}/${newPath}`)
  } else if (newLanguage === 'json') {
    // For JSON files, clear old module and create new one using .d.ts extension
    const oldDtsUri = `file:///${pluginId}/${oldPath}`.replace('.json', '.json.d.ts')
    monaco.typescript.typescriptDefaults.addExtraLib('', oldDtsUri)
    monaco.typescript.javascriptDefaults.addExtraLib('', oldDtsUri)

    const dtsUri = `file:///${pluginId}/${newPath}`.replace('.json', '.json.d.ts')
    try {
      const jsonContent = JSON.parse(currentContent || '{}')
      const inferredType = inferJsonType(jsonContent)
      const tsModuleContent = `declare const value: ${inferredType};
export default value;`
      monaco.typescript.typescriptDefaults.addExtraLib(tsModuleContent, dtsUri)
      monaco.typescript.javascriptDefaults.addExtraLib(tsModuleContent, dtsUri)
    } catch {
      const tsModuleContent = `declare const value: any;
export default value;`
      monaco.typescript.typescriptDefaults.addExtraLib(tsModuleContent, dtsUri)
      monaco.typescript.javascriptDefaults.addExtraLib(tsModuleContent, dtsUri)
    }
  }

  // Update entry point if necessary
  if (plugin.entryPoint === oldPath) {
    plugin.entryPoint = newPath
  }

  // Switch to new file if it was the current file
  if (currentFilePath === oldPath) {
    switchToFile(newPath)
  }

  updateStatus(`Renamed: ${oldPath} → ${newPath}`, 'success')
  return true
}

export function moveFileToDirectory(
  filePath: string,
  targetDirectory: string,
  plugin: EditorPluginData,
  pluginId: string,
  editorModels: Map<string, monaco.editor.ITextModel>,
  currentFilePath: string | null,
  updateStatus: (message: string, type: StatusType) => void,
  renameFileFunc: (oldPath: string, newPath: string) => boolean
): boolean {
  const file = plugin.files[filePath]
  if (!file) {
    updateStatus(`File not found: ${filePath}`, 'error')
    return false
  }

  // Get the file name from the path
  const parts = filePath.split('/')
  const fileName = parts[parts.length - 1]

  // Check if already in target directory
  const currentDir = parts.slice(0, -1).join('/')
  if (currentDir === targetDirectory) {
    return false
  }

  // Calculate new path
  const newPath = targetDirectory ? `${targetDirectory}/${fileName}` : fileName

  // Check if file already exists in target directory
  if (plugin.files[newPath]) {
    updateStatus('File already exists in target directory', 'error')
    return false
  }

  // Perform the move
  const success = renameFileFunc(filePath, newPath)
  if (success) {
    updateStatus(`Moved: ${filePath} → ${newPath}`, 'success')
  }
  return success
}

export function createFileInline(
  folderPath: string = '',
  plugin: EditorPluginData,
  updateStatus: (message: string, type: StatusType) => void,
  renderFileTree: () => void,
  startNewFileCreation: (folderPath: string) => void
) {
  // Don't create the file yet, just start the creation UI
  startNewFileCreation(folderPath)
}

export function createFolderInline(
  basePath: string = '',
  plugin: EditorPluginData,
  updateStatus: (message: string, type: StatusType) => void,
  renderFileTree: () => void,
  startNewFolderCreation: (basePath: string) => void
) {
  // Don't create the folder yet, just start the creation UI
  startNewFolderCreation(basePath)
}
