/** Importing a plugin from a public GitHub repository, and pulling its later changes. */
import {getEditorPlugin, generateEditorPluginId} from '@client/utils/pluginEditorStorage.ts'
import {updateStatus} from './utils'
import {bundlePlugin} from './bundler'
import {applyFullSync} from './externalSync'
import {validEntryPoint} from './entryPoint'
import {foldersOf} from './localFolder'
import {alertDialog, openDialog} from './dialogs'
import {writeToLinkedFolder} from './folderLink'
import {exclusive, isPluginDirty, loadPlugin, reloadPluginList, requestOpenPlugin, saveCurrentPlugin, state} from './session'
import {
  blobsOf,
  describeSource,
  downloadFiles,
  GithubError,
  listFiles,
  parseGithubSource,
  planPull,
  resolveCommit,
  type GithubLink,
  type GithubSource,
} from './githubSource'

const short = (commit: string) => commit.slice(0, 7)

function progress(verb: string) {
  return (done: number, total: number) => updateStatus(`${verb} ${done}/${total} files from GitHub...`, 'normal')
}

function reportError(error: unknown) {
  if (!(error instanceof GithubError)) console.error('[GitHub]', error)
  updateStatus((error as Error).message, 'error')
}

/** Ask for a repository, read the plugin from it, and open it as a new plugin. */
export async function importFromGithub() {
  let input = ''
  let source: GithubSource | null = null
  while (!source) {
    const { button, value } = await openDialog({
      title: 'Import from GitHub',
      message: 'A public repository, optionally a folder in it and a branch or tag: ' +
        'owner/repo, owner/repo/folder@branch, or the github.com address. ' +
        'Pull from GitHub (in the ⋯ menu) takes later changes.',
      input: { value: input, placeholder: 'owner/repo/folder@branch' },
      buttons: [
        { id: 'cancel', label: 'Cancel' },
        { id: 'import', label: 'Import', kind: 'primary' },
      ],
    })
    if (button !== 'import' || !value.trim()) return
    input = value
    source = parseGithubSource(value)
    if (!source) await alertDialog('Not a GitHub repository', `"${value.trim()}" is not owner/repo, owner/repo/folder@branch or a github.com address.`)
  }

  try {
    updateStatus(`Reading ${describeSource(source)}...`, 'normal')
    const commit = await resolveCommit(source)
    const blobs = await listFiles(source, commit)
    const contents = await downloadFiles(source, commit, Object.keys(blobs), fetch, progress('Downloading'))

    const name = source.path.split('/').pop() || source.repo
    const files: Record<string, { content: string }> = {}
    for (const [path, content] of Object.entries(contents)) files[path] = { content }
    const entryPoint = validEntryPoint(undefined, files)!

    updateStatus('Bundling plugin...', 'normal')
    const plugin = await applyFullSync({
      pluginId: generateEditorPluginId(name),
      name,
      entryPoint,
      files,
      folders: foldersOf(Object.keys(files)),
      metadata: { name, version: '1.0.0', author: source.owner, description: `Imported from GitHub: ${describeSource(source)}` },
      github: { ...source, commit, blobs },
    }, bundlePlugin)

    await reloadPluginList()
    await requestOpenPlugin(plugin.id)
    updateStatus(`Imported ${name} from ${describeSource(source)} (${short(commit)})`, 'success')
  } catch (error) {
    reportError(error)
  }
}

/** Take the changes made on GitHub since the last import or pull into the open plugin. */
export async function pullFromGithub() {
  const pluginId = state.currentPluginId
  const link = state.currentPlugin?.github
  if (!pluginId || !state.currentPlugin || !link) return

  if (isPluginDirty()) {
    const { button } = await openDialog({
      title: 'Unsaved changes',
      message: `Save ${state.currentPlugin.name} before pulling? Files you changed are kept unless GitHub changed them too.`,
      buttons: [
        { id: 'cancel', label: 'Cancel' },
        { id: 'save', label: 'Save and pull', kind: 'primary' },
      ],
    })
    if (button !== 'save' || !(await saveCurrentPlugin())) return
    if (state.currentPluginId !== pluginId) return
  }

  try {
    updateStatus(`Checking ${describeSource(link)}...`, 'normal')
    const commit = await resolveCommit(link)
    const stored = await getEditorPlugin(pluginId)
    if (!stored || state.currentPluginId !== pluginId) return
    const remote = commit === link.commit ? link.blobs : await listFiles(link, commit)
    const plan = planPull(link.blobs, await blobsOf(stored.files), remote)

    let takeConflicts = false
    if (plan.conflicts.length) {
      const listed = plan.conflicts.slice(0, 6).join(', ') + (plan.conflicts.length > 6 ? ` and ${plan.conflicts.length - 6} more` : '')
      const { button } = await openDialog({
        title: 'Changed on both sides',
        message: `${listed} changed both here and on GitHub. Keep your versions, or replace them with GitHub's? ` +
          'Other files are updated either way.',
        buttons: [
          { id: 'cancel', label: 'Cancel', start: true },
          { id: 'theirs', label: 'Use GitHub\'s', kind: 'danger' },
          { id: 'mine', label: 'Keep mine', kind: 'primary' },
        ],
      })
      if (button !== 'theirs' && button !== 'mine') return
      takeConflicts = button === 'theirs'
      if (state.currentPluginId !== pluginId) return
    }

    const update = [...plan.update, ...(takeConflicts ? plan.conflicts.filter(path => remote[path]) : [])]
    const remove = [...plan.remove, ...(takeConflicts ? plan.conflicts.filter(path => !remote[path]) : [])]
    const newLink: GithubLink = { ...link, commit, blobs: remote }

    if (!update.length && !remove.length) {
      if (commit !== link.commit) {
        await applyFullSync({ pluginId, entryPoint: stored.entryPoint, files: stored.files, folders: stored.folders, github: newLink }, null)
        await exclusive(() => loadPlugin(pluginId, state.currentFilePath))
      }
      updateStatus(`${stored.name} is up to date with ${describeSource(link)} (${short(commit)})`, 'success')
      return
    }

    const contents = await downloadFiles(link, commit, update, fetch, progress('Downloading'))
    if (state.currentPluginId !== pluginId) return
    const files: Record<string, { content: string }> = {}
    for (const [path, file] of Object.entries(stored.files)) files[path] = { content: file.content }
    for (const path of remove) delete files[path]
    for (const [path, content] of Object.entries(contents)) files[path] = { content }

    updateStatus('Bundling plugin...', 'normal')
    const plugin = await applyFullSync({
      pluginId,
      entryPoint: validEntryPoint(stored.entryPoint, files)!,
      files,
      folders: [...new Set([...(stored.folders ?? []), ...foldersOf(Object.keys(files))])].sort(),
      github: newLink,
    }, bundlePlugin)
    await exclusive(() => loadPlugin(pluginId, plugin.files[state.currentFilePath ?? ''] ? state.currentFilePath : null))
    await writeToLinkedFolder(pluginId, plugin.files)

    const changed = update.length + remove.length
    updateStatus(`Pulled ${changed} file${changed === 1 ? '' : 's'} from ${describeSource(link)} (${short(commit)})`, 'success')
  } catch (error) {
    reportError(error)
  }
}

/** The ⋯ menu offers Pull only for a plugin imported from GitHub. */
export function updateGithubMenu() {
  const item = document.getElementById('github-pull-item')!
  const link = state.currentPlugin?.github
  item.hidden = !link
  item.title = link ? `${describeSource(link)}, last pulled at ${short(link.commit)}` : ''
}
