/** Renaming, creating and deleting files and folders in the open plugin, from the tree and its menus. */
import {createPluginFile} from '@client/utils/pluginEditorStorage.ts'
import {updateStatus} from './utils'
import {clearContextMenuTarget, getContextMenuTarget, hideContextMenu, showRootContextMenu} from './contextMenu'
import {createFileInline, createFolderInline, deleteFile, deleteFolder} from './fileOperations'
import {hideNewFileModal, showNewFileModal} from './modals'
import {alertDialog} from './dialogs'
import {moveFileToDirectoryWrapper, renameFileWrapper, renderCurrentFileTree, sessionHooks, state, switchToFile} from './session'

// Rename UI handling
function startRename(filePath: string) {
  const fileItem = document.querySelector(`.file-item[data-path="${filePath}"]`) as HTMLElement
  if (!fileItem) return

  fileItem.classList.add('renaming')
  const input = fileItem.querySelector('.rename-input') as HTMLInputElement
  if (!input) return

  const parts = filePath.split('/')
  const fileName = parts[parts.length - 1]
  const dir = parts.slice(0, -1).join('/')

  input.value = fileName
  input.focus()

  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex > 0) {
    input.setSelectionRange(0, dotIndex)
  } else {
    input.select()
  }

  const finishRename = async () => {
    const newName = input.value.trim()
    fileItem.classList.remove('renaming')

    if (!newName || newName === fileName) return

    const newPath = dir ? `${dir}/${newName}` : newName

    if (state.currentPlugin && state.currentPlugin.files[newPath]) {
      updateStatus('File already exists', 'error')
      return
    }

    renameFileWrapper(filePath, newPath)
  }

  input.onblur = finishRename
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      input.blur()
    } else if (e.key === 'Escape') {
      fileItem.classList.remove('renaming')
      input.value = fileName
    }
  }
}

// New file creation UI handling
function startNewFileCreation(folderPath: string) {
  if (!state.currentPlugin) return

  // Create a temporary unique marker for the new file
  const tempId = `__new_file_${Date.now()}__`
  const tempPath = folderPath ? `${folderPath}/${tempId}` : tempId

  // Temporarily add to plugin files just for rendering
  state.currentPlugin.files[tempPath] = createPluginFile(tempPath, '')

  renderCurrentFileTree()

  setTimeout(() => {
    const fileItem = document.querySelector(`.file-item[data-path="${tempPath}"]`) as HTMLElement
    if (!fileItem) return

    const input = fileItem.querySelector('.rename-input') as HTMLInputElement
    if (!input) return

    input.focus()

    input.onblur = async () => {
      const newName = input.value.trim()
      fileItem.classList.remove('renaming')

      // Remove the temporary file
      delete state.currentPlugin!.files[tempPath]

      if (!newName) {
        // User cancelled, just re-render
        renderCurrentFileTree()
        return
      }

      const newPath = folderPath ? `${folderPath}/${newName}` : newName

      if (state.currentPlugin!.files[newPath]) {
        updateStatus('File already exists', 'error')
        renderCurrentFileTree()
        return
      }

      // Create the actual file
      state.currentPlugin!.files[newPath] = createPluginFile(newPath, '')
      renderCurrentFileTree()

      // Open the newly created file
      switchToFile(newPath)
      updateStatus(`Created: ${newPath}`, 'success')
    }
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        input.blur()
      } else if (e.key === 'Escape') {
        input.value = ''
        input.blur()
      }
    }
  }, 50)
}

// New folder creation UI handling
function startNewFolderCreation(basePath: string) {
  if (!state.currentPlugin) return

  // Initialize folders array if needed
  if (!state.currentPlugin.folders) {
    state.currentPlugin.folders = []
  }

  // Create a temporary unique marker for the new folder
  const tempId = `__new_folder_${Date.now()}__`
  const tempPath = basePath ? `${basePath}${tempId}` : tempId

  // Temporarily add to folders array
  state.currentPlugin.folders.push(tempPath)

  renderCurrentFileTree()

  setTimeout(() => {
    const folderItem = document.querySelector(`.folder-item[data-path="${tempPath}"]`) as HTMLElement
    if (!folderItem) return

    const input = folderItem.querySelector('.rename-input') as HTMLInputElement
    if (!input) return

    input.focus()

    const finishCreation = async () => {
      const newFolderName = input.value.trim()

      // Remove the temporary folder
      const tempIndex = state.currentPlugin!.folders!.indexOf(tempPath)
      if (tempIndex > -1) {
        state.currentPlugin!.folders!.splice(tempIndex, 1)
      }

      if (!newFolderName) {
        // User cancelled, just re-render
        renderCurrentFileTree()
        return
      }

      const newFolderPath = basePath ? `${basePath}${newFolderName}` : newFolderName

      if (state.currentPlugin!.folders!.includes(newFolderPath)) {
        updateStatus('Folder already exists', 'error')
        renderCurrentFileTree()
        return
      }

      // Create the actual folder
      state.currentPlugin!.folders!.push(newFolderPath)
      renderCurrentFileTree()
      updateStatus(`Created folder: ${newFolderPath}`, 'success')
    }

    input.onblur = finishCreation
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        input.blur()
      } else if (e.key === 'Escape') {
        input.value = ''
        input.blur()
      }
    }
  }, 100)
}

// Folder rename UI handling
function startFolderRename(folderPath: string, currentFolderName: string) {
  const folderItem = document.querySelector(`.folder-item[data-path="${folderPath}"]`) as HTMLElement
  if (!folderItem) return

  const folderNameSpan = folderItem.querySelector('.folder-name') as HTMLElement
  if (!folderNameSpan) return

  const input = document.createElement('input')
  input.type = 'text'
  input.value = currentFolderName
  input.className = 'rename-input'
  input.style.display = 'block'
  input.style.flex = '1'

  folderNameSpan.style.display = 'none'
  folderItem.appendChild(input)
  input.focus()
  input.select()

  const finishRename = async () => {
    const newFolderName = input.value.trim()
    input.remove()
    folderNameSpan.style.display = ''

    // If name hasn't changed, just return without doing anything
    if (newFolderName === currentFolderName) {
      return
    }

    // If empty, remove the folder (this handles newly created folders that were cancelled)
    if (!newFolderName) {
      if (!state.currentPlugin || !state.currentPlugin.folders) return
      const index = state.currentPlugin.folders.indexOf(folderPath)
      if (index > -1) {
        state.currentPlugin.folders.splice(index, 1)
      }
      renderCurrentFileTree()
      return
    }

    if (!state.currentPlugin) return

    const parts = folderPath.split('/')
    const basePath = parts.slice(0, -1).join('/')
    const newFolderPath = basePath ? `${basePath}/${newFolderName}` : newFolderName

    // Update folders array
    if (state.currentPlugin.folders) {
      const index = state.currentPlugin.folders.indexOf(folderPath)
      if (index > -1) {
        state.currentPlugin.folders[index] = newFolderPath
      }

      state.currentPlugin.folders = state.currentPlugin.folders.map(folder => {
        if (folder.startsWith(folderPath + '/')) {
          return folder.replace(folderPath, newFolderPath)
        }
        return folder
      })
    }

    // Rename all files in the folder; their models, typings and open tabs follow.
    const filesToRename = Object.keys(state.currentPlugin.files).filter(path =>
      path.startsWith(folderPath + '/')
    )

    filesToRename.forEach(oldPath => {
      const relativePath = oldPath.substring(folderPath.length + 1)
      renameFileWrapper(oldPath, `${newFolderPath}/${relativePath}`)
    })

    renderCurrentFileTree()
    updateStatus(`Folder renamed to ${newFolderName}`, 'success')
  }

  input.onblur = finishRename
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      input.blur()
    } else if (e.key === 'Escape') {
      input.value = currentFolderName
      input.blur()
    }
  }
}

// Context menu action handler
export async function handleContextMenuAction(action: string) {
  const target = getContextMenuTarget()
  if (!target || !state.currentPlugin) return

  hideContextMenu()

  switch (action) {
    case 'rename':
      if (target.isFolder) {
        const parts = target.path.split('/')
        const folderName = parts[parts.length - 1]
        startFolderRename(target.path, folderName)
      } else {
        startRename(target.path)
      }
      break
    case 'delete':
      if (target.isFolder) {
        const success = await deleteFolder(
          target.path,
          state.currentPlugin,
          state.editorModels,
          state.modifiedFiles,
          updateStatus
        )
        if (success) renderCurrentFileTree()
      } else {
        const success = await deleteFile(
          target.path,
          state.currentPlugin,
          state.editorModels,
          updateStatus
        )
        if (success) renderCurrentFileTree()
      }
      break
    case 'open-side':
      if (!target.isFolder) switchToFile(target.path, undefined, 'side')
      break
    case 'compare':
      if (!target.isFolder) sessionHooks.compareFile(target.path, 'saved')
      break
    case 'history':
      if (!target.isFolder) sessionHooks.compareFile(target.path, 'previous')
      break
    case 'new-file':
      if (target.isFolder || target.path === '') {
        createFileInline(target.path, state.currentPlugin, updateStatus, renderCurrentFileTree, startNewFileCreation)
      } else {
        const parts = target.path.split('/')
        const dir = parts.slice(0, -1).join('/')
        createFileInline(dir, state.currentPlugin, updateStatus, renderCurrentFileTree, startNewFileCreation)
      }
      break
    case 'new-folder':
      let folderBase = ''
      if (target.isFolder || target.path === '') {
        folderBase = target.path ? target.path + '/' : ''
      } else {
        const parts = target.path.split('/')
        const dir = parts.slice(0, -1).join('/')
        folderBase = dir ? dir + '/' : ''
      }
      createFolderInline(folderBase, state.currentPlugin, updateStatus, renderCurrentFileTree, startNewFolderCreation)
      break
  }

  clearContextMenuTarget()
}

// New file modal handling
export async function createNewFile() {
  if (!state.currentPlugin) return

  const pathInput = document.getElementById('new-file-path') as HTMLInputElement
  const filePath = pathInput.value.trim()

  if (!filePath) {
    await alertDialog('New file', 'Please enter a file path')
    return
  }

  if (state.currentPlugin.files && state.currentPlugin.files[filePath]) {
    await alertDialog('New file', 'File already exists')
    return
  }

  state.currentPlugin.files[filePath] = createPluginFile(filePath, '')

  renderCurrentFileTree()
  switchToFile(filePath)
  hideNewFileModal()
  updateStatus(`Created: ${filePath}`, 'success')
}

/** Wire the new-file modal, the tree's empty space (menu, drop) and the context menu. */
export function setupFileTreeActions() {
  // New file modal
  const addFileBtn = document.getElementById('add-file-btn')!
  addFileBtn.addEventListener('click', () => {
    if (!state.currentPlugin) {
      updateStatus('No plugin loaded', 'error')
      return
    }
    showNewFileModal()
  })

  const newFileCancel = document.getElementById('new-file-cancel')!
  newFileCancel.addEventListener('click', hideNewFileModal)

  const newFileCreate = document.getElementById('new-file-create')!
  newFileCreate.addEventListener('click', createNewFile)

  const newFilePath = document.getElementById('new-file-path') as HTMLInputElement
  newFilePath.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      createNewFile()
    }
  })

  // File list context menu for empty space
  const fileList = document.getElementById('file-list')!
  fileList.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement
    const isFileItem = target.closest('.file-item, .folder-item')

    if (!isFileItem) {
      e.preventDefault()
      e.stopPropagation()
      showRootContextMenu(e.clientX, e.clientY)
    }
  })

  // File list drag and drop support
  fileList.addEventListener('dragover', (e) => {
    const target = e.target as HTMLElement
    if (target.id === 'file-list' || (!target.closest('.file-item') && !target.closest('.folder-item'))) {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'
      fileList.classList.add('drag-over-root')
    }
  })

  fileList.addEventListener('dragleave', (e) => {
    const target = e.target as HTMLElement
    if (target.id === 'file-list') {
      fileList.classList.remove('drag-over-root')
    }
  })

  fileList.addEventListener('drop', (e) => {
    const target = e.target as HTMLElement
    if (target.id === 'file-list' || (!target.closest('.file-item') && !target.closest('.folder-item'))) {
      e.preventDefault()
      e.stopPropagation()
      fileList.classList.remove('drag-over-root')

      const sourceFilePath = e.dataTransfer!.getData('text/plain')
      if (sourceFilePath) {
        moveFileToDirectoryWrapper(sourceFilePath, '')
      }
    }
  })

  // Context menu event handlers
  const contextMenu = document.getElementById('context-menu')
  if (!contextMenu) {
    console.error('Context menu element not found!')
    return
  }

  contextMenu.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('context-menu-item')) {
      const action = target.dataset.action
      if (action) {
        void handleContextMenuAction(action)
      }
    }
  })

  // Close context menu on outside click
  document.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return
    }

    const menu = document.getElementById('context-menu')!
    if (menu.style.display === 'block') {
      menu.style.display = 'none'
    }
  })
}
