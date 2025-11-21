import * as monaco from 'monaco-editor'
import type { EditorPluginData } from '../src/client/utils/pluginEditorStorage'
import { createPluginFile, getLanguageFromPath } from '@client/utils/pluginEditorStorage.ts'
import type { StatusType } from './types'

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

  // Create new file with new path
  plugin.files[newPath] = {
    ...file,
    path: newPath,
    language: getLanguageFromPath(newPath)
  }

  // Delete old file
  delete plugin.files[oldPath]

  // Handle editor model
  const model = editorModels.get(oldPath)
  if (model) {
    model.dispose()
    editorModels.delete(oldPath)
  }

  // Update Monaco virtual file system
  monaco.typescript.typescriptDefaults.addExtraLib('', `file:///${oldPath}`)
  monaco.typescript.javascriptDefaults.addExtraLib('', `file:///${oldPath}`)
  monaco.typescript.typescriptDefaults.addExtraLib(file.content, `file:///${newPath}`)
  monaco.typescript.javascriptDefaults.addExtraLib(file.content, `file:///${newPath}`)

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
  startRename: (path: string) => void
) {
  // Create a temporary file entry for inline editing
  const tempPath = folderPath ? `${folderPath}/newFile.ts` : 'newFile.ts'

  // Check if already exists
  if (plugin.files[tempPath]) {
    updateStatus('File already exists', 'error')
    return
  }

  // Create the file
  plugin.files[tempPath] = createPluginFile(tempPath, '')

  // Render tree
  renderFileTree()

  // Start rename immediately to let user type the name
  setTimeout(() => {
    startRename(tempPath)
  }, 50)
}

export function createFolderInline(
  basePath: string = '',
  plugin: EditorPluginData,
  updateStatus: (message: string, type: StatusType) => void,
  renderFileTree: () => void,
  startFolderRename: (folderPath: string, folderName: string) => void
) {
  // Initialize folders array if it doesn't exist
  if (!plugin.folders) {
    plugin.folders = []
  }

  const folderName = 'newFolder'
  const folderPath = basePath ? `${basePath}${folderName}` : folderName

  // Check if folder already exists
  if (plugin.folders.includes(folderPath)) {
    updateStatus('Folder already exists', 'error')
    return
  }

  // Add the folder to the folders array
  plugin.folders.push(folderPath)

  // Render tree to show the folder
  renderFileTree()

  // Rename the folder
  setTimeout(() => {
    startFolderRename(folderPath, folderName)
  }, 100)
}
