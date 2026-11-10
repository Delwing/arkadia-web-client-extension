/** The open plugin mirrored to a folder on disk, kept in step both ways. */
import {getEditorPlugin} from '@client/utils/pluginEditorStorage.ts'
import type {PluginFile} from '@client/utils/pluginEditorStorage.ts'
import {updateStatus} from './utils'
import {bundlePlugin} from './bundler'
import {applyFileUpdate, applyFullSync} from './externalSync'
import {
  FolderWatcher,
  foldersOf,
  getFolderLink,
  hasFolderAccess,
  isFolderLinkSupported,
  pickFolder,
  removeFolderLink,
  scanFolder,
  storeFolderLink,
  type FolderChanges,
} from './localFolder'
import {alertDialog, openDialog} from './dialogs'
import {exclusive, isPluginDirty, loadPlugin, saveCurrentPlugin, state} from './session'
import {takeExternalUpdate} from './devServerUi'

// Local folder link: the open plugin mirrored to a folder on disk.
let folderWatcher: FolderWatcher | null = null
// Bumped by every attach; an attach that finds a newer one started gives way.
let folderGeneration = 0

type FolderLinkState = 'none' | 'linked' | 'needs-access' | 'error'

function setFolderLinkUI(linkState: FolderLinkState, folderName = '') {
  const chip = document.getElementById('folder-link-status')!
  chip.hidden = linkState === 'none'
  chip.className = linkState
  document.getElementById('folder-link-text')!.textContent = {
    none: '',
    linked: folderName,
    'needs-access': `Reconnect ${folderName}`,
    error: `${folderName} unavailable`,
  }[linkState]
  chip.title = {
    none: '',
    linked: `Mirrored to the local folder ${folderName}`,
    'needs-access': 'The browser needs your permission again to use the linked folder',
    error: 'The linked folder could not be read. Click to link it again',
  }[linkState]
}

/** Stop watching the open plugin's folder and start on this plugin's, if it has one. */
export async function attachFolderLink(pluginId: string | null) {
  const generation = ++folderGeneration
  folderWatcher?.stop()
  folderWatcher = null
  setFolderLinkUI('none')
  if (!pluginId || !isFolderLinkSupported()) return

  const folder = await getFolderLink(pluginId)
  if (generation !== folderGeneration || !folder) return
  if (!(await hasFolderAccess(folder))) {
    if (generation === folderGeneration) setFolderLinkUI('needs-access', folder.name)
    return
  }
  const stored = await getEditorPlugin(pluginId)
  if (generation !== folderGeneration || !stored) return
  await watchFolder(pluginId, folder, stored.files, stored.updatedAt)
}

/** Watch `folder` for the plugin, first reconciling it with `files` (see FolderWatcher.start). */
async function watchFolder(pluginId: string, folder: FileSystemDirectoryHandle, files: Record<string, PluginFile>, savedAt: number) {
  folderWatcher?.stop()
  const watcher = new FolderWatcher(
    pluginId,
    folder,
    changes => takeFolderChanges(pluginId, changes),
    error => {
      console.error('[LocalFolder]', error)
      if (folderWatcher === watcher) setFolderLinkUI('error', folder.name)
    },
  )
  folderWatcher = watcher
  setFolderLinkUI('linked', folder.name)
  try {
    await watcher.start(files, savedAt)
  } catch (error) {
    console.error('[LocalFolder]', error)
    watcher.stop()
    if (folderWatcher === watcher) setFolderLinkUI('error', folder.name)
  }
}

/**
 * Files changed in the folder: store them and fold them into the open
 * plugin like an IDE update. A removal rebuilds the whole file set.
 */
async function takeFolderChanges(pluginId: string, folderChanges: FolderChanges) {
  const stored = await getEditorPlugin(pluginId)
  if (!stored) return
  // A file touched but not changed (or written back as it was) is no news.
  const changed = folderChanges.changed.filter(f => stored.files[f.path]?.content !== f.content)
  const removed = folderChanges.removed.filter(path => path in stored.files)

  if (!removed.length) {
    if (!changed.length) return
    const plugin = await applyFileUpdate(pluginId, changed, bundlePlugin)
    if (plugin) takeExternalUpdate(pluginId, plugin, changed.map(f => f.path))
    return
  }

  const files: Record<string, { content: string }> = {}
  for (const [path, file] of Object.entries(stored.files)) files[path] = { content: file.content }
  for (const path of removed) delete files[path]
  for (const { path, content } of changed) files[path] = { content }
  const plugin = await applyFullSync({
    pluginId,
    entryPoint: stored.entryPoint,
    files,
    folders: foldersOf(Object.keys(files)),
  }, bundlePlugin)
  takeExternalUpdate(pluginId, plugin, 'all')
}

/** A save in the browser goes to the linked folder too. */
export async function writeToLinkedFolder(pluginId: string, files: Record<string, PluginFile>) {
  const watcher = folderWatcher
  if (watcher?.pluginId !== pluginId) return
  try {
    await watcher.writePlugin(files)
  } catch (error) {
    console.error('[LocalFolder]', error)
    updateStatus(`Saved, but writing to ${watcher.folderName} failed: ${(error as Error).message}`, 'error')
  }
}

/** Pick a folder for the open plugin and decide which side's files win. */
export async function linkCurrentPluginToFolder() {
  const plugin = state.currentPlugin
  const pluginId = state.currentPluginId
  if (!plugin || !pluginId) return

  let folder: FileSystemDirectoryHandle | null
  try {
    folder = await pickFolder()
  } catch (error) {
    updateStatus(`Could not open the folder: ${(error as Error).message}`, 'error')
    return
  }
  if (!folder || state.currentPluginId !== pluginId) return

  const scanned = await scanFolder(folder)
  if (scanned.size > 300) {
    await alertDialog('Folder too large', `${folder.name} holds ${scanned.size} source files. Pick a folder of its own for this plugin.`)
    return
  }

  let useFolder = false
  if (scanned.size > 0) {
    const { button } = await openDialog({
      title: 'Folder is not empty',
      message: `${folder.name} already has ${scanned.size === 1 ? '1 file' : `${scanned.size} files`}. ` +
        `Use them as the plugin's files, replacing what ${plugin.name} has here` +
        (isPluginDirty() ? ' (including unsaved changes)' : '') +
        `, or overwrite the folder with ${plugin.name}, deleting files the plugin does not have?`,
      buttons: [
        { id: 'cancel', label: 'Cancel', start: true },
        { id: 'overwrite', label: 'Overwrite folder', kind: 'danger' },
        { id: 'folder', label: 'Use folder files', kind: 'primary' },
      ],
    })
    if (button !== 'folder' && button !== 'overwrite') return
    useFolder = button === 'folder'
  }
  if (state.currentPluginId !== pluginId) return

  if (useFolder) {
    const entryPoint = [plugin.entryPoint, 'index.ts', 'index.js', 'main.ts', 'main.js'].find(path => scanned.has(path))
    if (!entryPoint) {
      await alertDialog('No entry file', `${folder.name} has no ${plugin.entryPoint}, index.ts or index.js to start the plugin from.`)
      return
    }
    const files: Record<string, { content: string }> = {}
    for (const [path, entry] of scanned) files[path] = { content: await entry.file.text() }
    await applyFullSync({ pluginId, entryPoint, files, folders: foldersOf(scanned.keys()) }, bundlePlugin)
    await exclusive(() => loadPlugin(pluginId, state.currentFilePath))
  } else if (isPluginDirty() && !(await saveCurrentPlugin())) {
    return
  }

  await storeFolderLink(pluginId, folder)
  ++folderGeneration
  const stored = await getEditorPlugin(pluginId)
  if (!stored || state.currentPluginId !== pluginId) return
  // The plugin side wins everywhere: after "Use folder files" both hold the same.
  await watchFolder(pluginId, folder, stored.files, Infinity)
  if (folderWatcher?.pluginId === pluginId) updateStatus(`Linked to the local folder ${folder.name}`, 'success')
}

/** The status-bar chip: reconnect, relink, or show the link with an unlink option. */
async function onFolderLinkChipClick() {
  const pluginId = state.currentPluginId
  if (!pluginId) return
  const folder = await getFolderLink(pluginId)
  if (!folder) return

  const chip = document.getElementById('folder-link-status')!
  if (chip.classList.contains('needs-access')) {
    if (await hasFolderAccess(folder, true)) await attachFolderLink(pluginId)
    return
  }
  if (chip.classList.contains('error')) {
    await linkCurrentPluginToFolder()
    return
  }

  const { button } = await openDialog({
    title: 'Local folder',
    message: `${state.currentPlugin?.name ?? 'This plugin'} is mirrored to the folder ${folder.name}. ` +
      'Files your IDE saves there show up here, and saving here writes them to the folder.',
    buttons: [
      { id: 'unlink', label: 'Unlink', kind: 'danger', start: true },
      { id: 'change', label: 'Change folder…' },
      { id: 'close', label: 'Close', kind: 'primary' },
    ],
  })
  if (state.currentPluginId !== pluginId) return
  if (button === 'change') {
    await linkCurrentPluginToFolder()
  } else if (button === 'unlink') {
    await removeFolderLink(pluginId)
    await attachFolderLink(pluginId)
    updateStatus(`Unlinked from ${folder.name}; the files stay on disk`, 'success')
  }
}

export function setupFolderLink() {
  document.getElementById('link-folder-item')!.hidden = !isFolderLinkSupported()
  document.getElementById('folder-link-status')!.addEventListener('click', () => { void onFolderLinkChipClick() })
  // Coming back from the IDE: pick up its saves at once.
  window.addEventListener('focus', () => { void folderWatcher?.poll() })
}

/** Follow the open plugin: watch its linked folder, or none once it is closed. */
export function followOpenPlugin(pluginId: string | null) {
  if (pluginId === null || folderWatcher?.pluginId !== pluginId) void attachFolderLink(pluginId)
}
