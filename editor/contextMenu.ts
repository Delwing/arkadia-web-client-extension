import type { ContextMenuTarget } from './types'

let contextMenuTarget: ContextMenuTarget | null = null

export function showContextMenu(x: number, y: number, filePath: string, fileName: string) {
  const contextMenu = document.getElementById('context-menu')
  if (!contextMenu) {
    console.error('Context menu element not found in showContextMenu!')
    return
  }

  contextMenuTarget = { path: filePath, name: fileName, isFolder: false }

  // Show all menu items for file context menu
  const renameItem = contextMenu.querySelector('[data-action="rename"]') as HTMLElement
  const deleteItem = contextMenu.querySelector('[data-action="delete"]') as HTMLElement
  const separator = contextMenu.querySelector('.context-menu-separator') as HTMLElement

  if (renameItem) renameItem.style.display = 'block'
  if (deleteItem) deleteItem.style.display = 'block'
  if (separator) separator.style.display = 'block'

  // Position menu
  contextMenu.style.left = `${x}px`
  contextMenu.style.top = `${y}px`
  contextMenu.style.display = 'block'

  // Close menu when clicking outside
  const closeMenu = (e: MouseEvent) => {
    if (!contextMenu.contains(e.target as Node)) {
      contextMenu.style.display = 'none'
      contextMenuTarget = null
      document.removeEventListener('click', closeMenu)
    }
  }

  setTimeout(() => document.addEventListener('click', closeMenu), 0)
}

export function showFolderContextMenu(x: number, y: number, folderPath: string) {
  const contextMenu = document.getElementById('context-menu')!
  contextMenuTarget = { path: folderPath, name: folderPath, isFolder: true }

  // Show all menu items for folder context menu
  const renameItem = contextMenu.querySelector('[data-action="rename"]') as HTMLElement
  const deleteItem = contextMenu.querySelector('[data-action="delete"]') as HTMLElement
  const separator = contextMenu.querySelector('.context-menu-separator') as HTMLElement

  if (renameItem) renameItem.style.display = 'block'
  if (deleteItem) deleteItem.style.display = 'block'
  if (separator) separator.style.display = 'block'

  // Position menu
  contextMenu.style.left = `${x}px`
  contextMenu.style.top = `${y}px`
  contextMenu.style.display = 'block'

  // Close menu when clicking outside
  const closeMenu = (e: MouseEvent) => {
    if (!contextMenu.contains(e.target as Node)) {
      contextMenu.style.display = 'none'
      contextMenuTarget = null
      document.removeEventListener('click', closeMenu)
    }
  }

  setTimeout(() => document.addEventListener('click', closeMenu), 0)
}

export function showRootContextMenu(x: number, y: number) {
  const contextMenu = document.getElementById('context-menu')!
  contextMenuTarget = { path: '', name: '', isFolder: true }

  // Hide rename and delete for root/empty space context menu
  const renameItem = contextMenu.querySelector('[data-action="rename"]') as HTMLElement
  const deleteItem = contextMenu.querySelector('[data-action="delete"]') as HTMLElement
  const separator = contextMenu.querySelector('.context-menu-separator') as HTMLElement

  if (renameItem) renameItem.style.display = 'none'
  if (deleteItem) deleteItem.style.display = 'none'
  if (separator) separator.style.display = 'none'

  // Position menu
  contextMenu.style.left = `${x}px`
  contextMenu.style.top = `${y}px`
  contextMenu.style.display = 'block'

  // Close menu when clicking outside
  const closeMenu = (e: MouseEvent) => {
    if (!contextMenu.contains(e.target as Node)) {
      contextMenu.style.display = 'none'
      contextMenuTarget = null
      document.removeEventListener('click', closeMenu)
    }
  }

  setTimeout(() => document.addEventListener('click', closeMenu), 0)
}

export function getContextMenuTarget(): ContextMenuTarget | null {
  return contextMenuTarget
}

export function clearContextMenuTarget() {
  contextMenuTarget = null
}

export function hideContextMenu() {
  const contextMenu = document.getElementById('context-menu')!
  contextMenu.style.display = 'none'
  contextMenuTarget = null
}
