import type { PluginFile } from '@client/utils/pluginEditorStorage.ts'

/**
 * What the open plugin looked like when it was last loaded or saved. Content
 * edits are tracked per file in `modifiedFiles`; the baseline catches the
 * structural ones (new, deleted, renamed and moved files, folder changes)
 * that leave no path behind to mark.
 */
export interface SavedBaseline {
  paths: Set<string>
  folders: Set<string>
}

export function baselineOf(files: Record<string, PluginFile>, folders: string[] = []): SavedBaseline {
  return { paths: new Set(Object.keys(files)), folders: new Set(folders) }
}

export function structureChanged(
  files: Record<string, PluginFile>,
  folders: string[] = [],
  baseline: SavedBaseline | null
): boolean {
  if (!baseline) return false
  const paths = Object.keys(files)
  if (paths.length !== baseline.paths.size || paths.some(p => !baseline.paths.has(p))) return true
  const uniqueFolders = new Set(folders)
  if (uniqueFolders.size !== baseline.folders.size) return true
  for (const folder of uniqueFolders) {
    if (!baseline.folders.has(folder)) return true
  }
  return false
}

/** A copy of the files that later edits to the originals do not reach. */
export function cloneFiles(files: Record<string, PluginFile>): Record<string, PluginFile> {
  const copy: Record<string, PluginFile> = {}
  for (const [path, file] of Object.entries(files)) copy[path] = { ...file }
  return copy
}

/**
 * The modified paths that a save of `saved` really covered: the file still
 * holds what was saved. Edits made while the save was bundling stay modified.
 */
export function pathsCoveredBySave(
  modified: Iterable<string>,
  current: Record<string, PluginFile>,
  saved: Record<string, PluginFile>
): string[] {
  const covered: string[] = []
  for (const path of modified) {
    const now = current[path]
    const then = saved[path]
    if (!now || (then && then.content === now.content)) covered.push(path)
  }
  return covered
}
