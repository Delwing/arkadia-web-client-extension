import * as monaco from 'monaco-editor'
import type { EditorPluginData } from '@client/utils/pluginEditorStorage.ts'
import { getLanguageFromPath } from '@client/utils/pluginEditorStorage.ts'
import type { StatusType } from './types'
import { confirmDialog } from './dialogs'
import { registerPluginFileLib, unregisterPluginFileLib } from './monaco/typings'
import { validEntryPoint } from './entryPoint'

/**
 * Delete a file after asking. Its open tabs close when the tree redraws; the
 * entry point moves to another file when it was this one.
 */
export async function deleteFile(
  filePath: string,
  plugin: EditorPluginData,
  editorModels: Map<string, monaco.editor.ITextModel>,
  updateStatus: (message: string, type: StatusType) => void
): Promise<boolean> {
  const fileCount = Object.keys(plugin.files).length
  if (fileCount <= 1) {
    updateStatus('Cannot delete the last file', 'error')
    return false
  }

  if (!await confirmDialog('Delete file', `Delete file "${filePath}"?`, 'Delete')) return false

  // Delete file
  delete plugin.files[filePath]

  // Dispose model
  const model = editorModels.get(filePath)
  if (model) {
    model.dispose()
    editorModels.delete(filePath)
  }

  plugin.entryPoint = validEntryPoint(plugin.entryPoint, plugin.files) ?? plugin.entryPoint

  updateStatus(`Deleted: ${filePath}`, 'success')
  return true
}

/** Delete a folder and its files after asking; see deleteFile. */
export async function deleteFolder(
  folderPath: string,
  plugin: EditorPluginData,
  editorModels: Map<string, monaco.editor.ITextModel>,
  modifiedFiles: Set<string>,
  updateStatus: (message: string, type: StatusType) => void
): Promise<boolean> {
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

  if (!await confirmDialog('Delete folder', `Delete folder "${folderPath}" and all its contents (${filesInFolder.length} files)?`, 'Delete')) return false

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

  plugin.entryPoint = validEntryPoint(plugin.entryPoint, plugin.files) ?? plugin.entryPoint

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

  // Move the file in Monaco's TypeScript view of the plugin, so imports of it resolve
  unregisterPluginFileLib(pluginId, oldPath)
  registerPluginFileLib(pluginId, newPath, plugin.files[newPath])

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
  _pluginId: string,
  _editorModels: Map<string, monaco.editor.ITextModel>,
  _currentFilePath: string | null,
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
  _plugin: EditorPluginData,
  _updateStatus: (message: string, type: StatusType) => void,
  _renderFileTree: () => void,
  startNewFileCreation: (folderPath: string) => void
) {
  // Don't create the file yet, just start the creation UI
  startNewFileCreation(folderPath)
}

export function createFolderInline(
  basePath: string = '',
  _plugin: EditorPluginData,
  _updateStatus: (message: string, type: StatusType) => void,
  _renderFileTree: () => void,
  startNewFolderCreation: (basePath: string) => void
) {
  // Don't create the folder yet, just start the creation UI
  startNewFolderCreation(basePath)
}
