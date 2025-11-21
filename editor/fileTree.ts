import * as FileIcons from 'file-icons-js'
import type { EditorPluginData, PluginFile } from '../src/client/utils/pluginEditorStorage'
import type { TreeNode } from './types'

export function buildFileTree(files: Record<string, PluginFile>, folders: string[] = []): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    isDirectory: true,
    children: []
  }

  // First, create all folder nodes from the folders array
  folders.forEach(folderPath => {
    const parts = folderPath.split('/')
    let currentNode = root

    parts.forEach((part, index) => {
      const pathSoFar = parts.slice(0, index + 1).join('/')
      let childNode = currentNode.children.find(n => n.name === part)

      if (!childNode) {
        childNode = {
          name: part,
          path: pathSoFar,
          isDirectory: true,
          children: []
        }
        currentNode.children.push(childNode)
      }

      currentNode = childNode
    })
  })

  // Then add files (this will also create parent directories as needed)
  const sortedFiles = Object.values(files).sort((a, b) => a.path.localeCompare(b.path))

  sortedFiles.forEach(file => {
    const parts = file.path.split('/')
    let currentNode = root

    parts.forEach((part, index) => {
      const isLastPart = index === parts.length - 1
      const pathSoFar = parts.slice(0, index + 1).join('/')

      let childNode = currentNode.children.find(n => n.name === part)

      if (!childNode) {
        childNode = {
          name: part,
          path: pathSoFar,
          isDirectory: !isLastPart,
          children: [],
          file: isLastPart ? file : undefined
        }
        currentNode.children.push(childNode)
      }

      currentNode = childNode
    })
  })

  return root
}

export function renderTreeNode(
  node: TreeNode,
  container: HTMLElement,
  totalFiles: number,
  currentFilePath: string | null,
  modifiedFiles: Set<string>,
  callbacks: {
    onFileClick: (path: string) => void
    onFileDelete: (path: string) => void
    onFolderContextMenu: (x: number, y: number, path: string) => void
    onFileContextMenu: (x: number, y: number, path: string, name: string) => void
    onFileDrop: (sourcePath: string, targetDirectory: string) => void
  }
) {
  if (node.isDirectory) {
    // Render folder
    const folderDiv = document.createElement('div')
    folderDiv.className = 'file-tree-item'

    const folderItem = document.createElement('div')
    folderItem.className = 'folder-item'
    folderItem.dataset.path = node.path

    const hasChildren = node.children.length > 0

    // Show toggle arrow only if folder has children, otherwise show spacer
    const toggle = document.createElement('span')
    if (hasChildren) {
      toggle.className = 'folder-toggle expanded'
      toggle.textContent = '▶'
    } else {
      toggle.className = 'folder-toggle-spacer'
    }

    const folderIcon = document.createElement('span')
    folderIcon.className = 'folder-icon'
    folderIcon.textContent = '📁'

    const folderName = document.createElement('span')
    folderName.className = 'folder-name'
    folderName.textContent = node.name

    folderItem.appendChild(toggle)
    folderItem.appendChild(folderIcon)
    folderItem.appendChild(folderName)

    const childrenContainer = document.createElement('div')
    childrenContainer.className = 'folder-children expanded'

    // Toggle folder on click (only if it has children)
    folderItem.onclick = (e) => {
      e.stopPropagation()
      if (hasChildren) {
        const isExpanded = childrenContainer.classList.toggle('expanded')
        toggle.classList.toggle('expanded', isExpanded)
      }
    }

    // Context menu for folders
    folderItem.oncontextmenu = (e) => {
      e.preventDefault()
      e.stopPropagation()
      callbacks.onFolderContextMenu(e.clientX, e.clientY, node.path)
    }

    // Drop zone for folders
    folderItem.ondragover = (e) => {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'
      folderItem.classList.add('drag-over')
    }

    folderItem.ondragleave = () => {
      folderItem.classList.remove('drag-over')
    }

    folderItem.ondrop = (e) => {
      e.preventDefault()
      e.stopPropagation()
      folderItem.classList.remove('drag-over')

      const sourceFilePath = e.dataTransfer!.getData('text/plain')
      if (sourceFilePath && sourceFilePath !== node.path) {
        callbacks.onFileDrop(sourceFilePath, node.path)
      }
    }

    folderDiv.appendChild(folderItem)
    folderDiv.appendChild(childrenContainer)
    container.appendChild(folderDiv)

    // Render children
    node.children.forEach(child => renderTreeNode(child, childrenContainer, totalFiles, currentFilePath, modifiedFiles, callbacks))
  } else {
    // Render file
    const fileItem = document.createElement('div')
    fileItem.className = 'file-item'
    fileItem.dataset.path = node.path
    fileItem.draggable = true
    if (node.path === currentFilePath) {
      fileItem.classList.add('active')
    }

    // Add spacer to align with folders that have toggle arrows
    const toggleSpacer = document.createElement('span')
    toggleSpacer.className = 'folder-toggle-spacer'

    const icon = document.createElement('span')
    icon.className = `file-icon ${FileIcons.getClassWithColor(node.name)}`
    icon.style.fontSize = '14px'

    const fileName = document.createElement('span')
    fileName.className = 'file-name'
    fileName.textContent = node.name

    const renameInput = document.createElement('input')
    renameInput.className = 'rename-input'
    renameInput.type = 'text'
    renameInput.value = node.name

    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'file-delete'
    deleteBtn.textContent = '×'
    deleteBtn.title = 'Delete file'
    deleteBtn.onclick = (e) => {
      e.stopPropagation()
      callbacks.onFileDelete(node.path)
    }

    // Add modified indicator
    const modifiedIndicator = document.createElement('span')
    modifiedIndicator.className = 'file-modified-indicator'
    modifiedIndicator.textContent = '●'
    modifiedIndicator.style.display = modifiedFiles.has(node.path) ? 'inline' : 'none'

    fileItem.appendChild(toggleSpacer)
    fileItem.appendChild(icon)
    fileItem.appendChild(fileName)
    fileItem.appendChild(modifiedIndicator)
    fileItem.appendChild(renameInput)
    if (totalFiles > 1) {
      fileItem.appendChild(deleteBtn)
    }

    let isDragging = false

    fileItem.onclick = () => {
      // Don't open file if it was just dragged
      if (!isDragging) {
        callbacks.onFileClick(node.path)
      }
    }

    // Drag and drop support
    fileItem.ondragstart = (e) => {
      e.dataTransfer!.effectAllowed = 'move'
      e.dataTransfer!.setData('text/plain', node.path)
      fileItem.classList.add('dragging')
      isDragging = true
    }

    fileItem.ondragend = () => {
      fileItem.classList.remove('dragging')
      // Reset isDragging after a short delay to allow click to be skipped
      setTimeout(() => {
        isDragging = false
      }, 100)
    }

    // Context menu support
    fileItem.oncontextmenu = (e) => {
      e.preventDefault()
      e.stopPropagation()
      callbacks.onFileContextMenu(e.clientX, e.clientY, node.path, node.name)
      return false
    }

    container.appendChild(fileItem)
  }
}

export function renderFileTree(
  plugin: EditorPluginData,
  currentFilePath: string | null,
  modifiedFiles: Set<string>,
  callbacks: {
    onFileClick: (path: string) => void
    onFileDelete: (path: string) => void
    onFolderContextMenu: (x: number, y: number, path: string) => void
    onFileContextMenu: (x: number, y: number, path: string, name: string) => void
    onFileDrop: (sourcePath: string, targetDirectory: string) => void
  }
) {
  const fileList = document.getElementById('file-list')!
  fileList.innerHTML = ''

  const totalFiles = Object.keys(plugin.files).length
  const tree = buildFileTree(plugin.files, plugin.folders || [])

  // Render root's children directly (skip root node itself)
  tree.children.forEach(child => renderTreeNode(child, fileList, totalFiles, currentFilePath, modifiedFiles, callbacks))
}
