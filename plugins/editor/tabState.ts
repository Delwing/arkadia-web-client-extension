/**
 * Which files are open in which editor group, and which one each group
 * shows. Plain data with no DOM or Monaco, so editorGroups.ts can keep it in
 * step with the page and it can be stored per plugin.
 */

export interface GroupTabs {
  tabs: string[]
  active: string | null
}

export interface TabLayout {
  groups: GroupTabs[]
  activeGroup: number
}

/** At most this many groups side by side. */
export const MAX_GROUPS = 2

export function emptyLayout(): TabLayout {
  return { groups: [{ tabs: [], active: null }], activeGroup: 0 }
}

/** Open `path` in a group (just after its active tab when new) and show it. */
export function openTab(group: GroupTabs, path: string, index?: number) {
  if (!group.tabs.includes(path)) {
    const at = index ?? (group.active ? group.tabs.indexOf(group.active) + 1 : group.tabs.length)
    group.tabs.splice(Math.max(0, Math.min(at, group.tabs.length)), 0, path)
  }
  group.active = path
}

/** Close `path` in a group; when it was shown, the tab to its right (else left) takes over. */
export function closeTab(group: GroupTabs, path: string) {
  const index = group.tabs.indexOf(path)
  if (index < 0) return
  group.tabs.splice(index, 1)
  if (group.active === path) {
    group.active = group.tabs[Math.min(index, group.tabs.length - 1)] ?? null
  }
}

/** Move a tab within a group, or into another one, at `index` (the end when left out). */
export function moveTab(layout: TabLayout, from: number, path: string, to: number, index?: number) {
  const source = layout.groups[from]
  const target = layout.groups[to]
  if (!source || !target || !source.tabs.includes(path)) return

  if (from === to) {
    const oldIndex = source.tabs.indexOf(path)
    source.tabs.splice(oldIndex, 1)
    const at = index === undefined ? source.tabs.length : (index > oldIndex ? index - 1 : index)
    source.tabs.splice(Math.max(0, Math.min(at, source.tabs.length)), 0, path)
    source.active = path
  } else {
    closeTab(source, path)
    target.tabs = target.tabs.filter(p => p !== path)
    openTab(target, path, index ?? target.tabs.length)
  }
  layout.activeGroup = to
  dropEmptyGroups(layout)
}

/** Groups left with no tabs go, but the first group always stays. */
export function dropEmptyGroups(layout: TabLayout) {
  const activeGroup = layout.groups[layout.activeGroup]
  const kept = layout.groups.filter((group, index) => index === 0 || group.tabs.length > 0)
  if (kept.length > 1 && kept[0].tabs.length === 0) kept.shift()
  layout.groups = kept
  const activeIndex = activeGroup ? kept.indexOf(activeGroup) : -1
  layout.activeGroup = activeIndex >= 0 ? activeIndex : kept.length - 1
}

/** A file was renamed or moved: its tabs follow it. */
export function renamePath(layout: TabLayout, oldPath: string, newPath: string) {
  for (const group of layout.groups) {
    const index = group.tabs.indexOf(oldPath)
    if (index < 0) continue
    if (group.tabs.includes(newPath)) {
      group.tabs.splice(index, 1)
    } else {
      group.tabs[index] = newPath
    }
    if (group.active === oldPath) group.active = newPath
  }
}

/** Close the tabs of files that are gone. Returns whether anything closed. */
export function retainPaths(layout: TabLayout, exists: (path: string) => boolean): boolean {
  let changed = false
  for (const group of layout.groups) {
    for (const path of [...group.tabs]) {
      if (!exists(path)) {
        closeTab(group, path)
        changed = true
      }
    }
  }
  if (changed) dropEmptyGroups(layout)
  return changed
}

/** A stored layout, made safe: only known files, valid indexes, at most MAX_GROUPS. */
export function sanitizeLayout(raw: unknown, exists: (path: string) => boolean): TabLayout | null {
  if (!raw || typeof raw !== 'object') return null
  const { groups, activeGroup } = raw as Partial<TabLayout>
  if (!Array.isArray(groups)) return null

  const layout: TabLayout = { groups: [], activeGroup: typeof activeGroup === 'number' ? activeGroup : 0 }
  for (const group of groups.slice(0, MAX_GROUPS)) {
    const tabs = Array.isArray(group?.tabs)
      ? [...new Set(group.tabs.filter((p: unknown): p is string => typeof p === 'string' && exists(p)))]
      : []
    const active = typeof group?.active === 'string' && tabs.includes(group.active) ? group.active : (tabs[0] ?? null)
    layout.groups.push({ tabs, active })
  }
  if (layout.groups.length === 0) return null
  if (layout.activeGroup < 0 || layout.activeGroup >= layout.groups.length) layout.activeGroup = 0
  dropEmptyGroups(layout)
  return layout
}
