import {describe, expect, it} from 'vitest'
import {
  closeTab,
  dropEmptyGroups,
  emptyLayout,
  moveTab,
  openTab,
  pinTab,
  renamePath,
  retainPaths,
  sanitizeLayout,
  type TabLayout,
} from '../../../plugins/editor/tabState'

const layoutOf = (...groups: Array<[string[], string | null]>): TabLayout => ({
  groups: groups.map(([tabs, active]) => ({tabs: [...tabs], active})),
  activeGroup: 0,
})

describe('openTab', () => {
  it('opens a new tab just after the shown one', () => {
    const group = {tabs: ['a', 'b', 'c'], active: 'a'}
    openTab(group, 'x')
    expect(group).toEqual({tabs: ['a', 'x', 'b', 'c'], active: 'x'})
  })

  it('only shows a tab that is already open', () => {
    const group = {tabs: ['a', 'b'], active: 'a'}
    openTab(group, 'b')
    expect(group).toEqual({tabs: ['a', 'b'], active: 'b'})
  })
})

describe('closeTab', () => {
  it('shows the tab to the right, else to the left', () => {
    const group = {tabs: ['a', 'b', 'c'], active: 'b'}
    closeTab(group, 'b')
    expect(group).toEqual({tabs: ['a', 'c'], active: 'c'})
    closeTab(group, 'c')
    expect(group).toEqual({tabs: ['a'], active: 'a'})
    closeTab(group, 'a')
    expect(group).toEqual({tabs: [], active: null})
  })

  it('keeps the shown tab when another closes', () => {
    const group = {tabs: ['a', 'b'], active: 'a'}
    closeTab(group, 'b')
    expect(group).toEqual({tabs: ['a'], active: 'a'})
  })
})

describe('moveTab', () => {
  it('reorders within a group', () => {
    const layout = layoutOf([['a', 'b', 'c'], 'a'])
    moveTab(layout, 0, 'c', 0, 0)
    expect(layout.groups[0].tabs).toEqual(['c', 'a', 'b'])
    moveTab(layout, 0, 'c', 0, 3)
    expect(layout.groups[0].tabs).toEqual(['a', 'b', 'c'])
  })

  it('moves into the other group and drops the emptied one', () => {
    const layout = layoutOf([['a'], 'a'], [['b'], 'b'])
    moveTab(layout, 0, 'a', 1)
    expect(layout.groups).toEqual([{tabs: ['b', 'a'], active: 'a'}])
    expect(layout.activeGroup).toBe(0)
  })

  it('does not duplicate a file already open in the target group', () => {
    const layout = layoutOf([['a', 'b'], 'a'], [['a'], 'a'])
    moveTab(layout, 0, 'a', 1)
    expect(layout.groups).toEqual([{tabs: ['b'], active: 'b'}, {tabs: ['a'], active: 'a'}])
  })
})

describe('dropEmptyGroups', () => {
  it('always keeps one group', () => {
    const layout = layoutOf([[], null], [[], null])
    dropEmptyGroups(layout)
    expect(layout).toEqual(emptyLayout())
  })

  it('lets the second group take the first place when the first empties', () => {
    const layout = layoutOf([[], null], [['b'], 'b'])
    layout.activeGroup = 1
    dropEmptyGroups(layout)
    expect(layout).toEqual({groups: [{tabs: ['b'], active: 'b'}], activeGroup: 0})
  })
})

describe('renamePath', () => {
  it('moves tabs with the file', () => {
    const layout = layoutOf([['a', 'b'], 'a'], [['a'], 'a'])
    renamePath(layout, 'a', 'lib/a')
    expect(layout.groups).toEqual([{tabs: ['lib/a', 'b'], active: 'lib/a'}, {tabs: ['lib/a'], active: 'lib/a'}])
  })
})

describe('retainPaths', () => {
  it('closes tabs of files that are gone', () => {
    const layout = layoutOf([['a', 'b'], 'b'], [['b'], 'b'])
    expect(retainPaths(layout, p => p !== 'b')).toBe(true)
    expect(layout.groups).toEqual([{tabs: ['a'], active: 'a'}])
    expect(retainPaths(layout, () => true)).toBe(false)
  })
})

describe('sanitizeLayout', () => {
  const exists = (p: string) => ['a', 'b', 'c'].includes(p)

  it('keeps known files only, without duplicates', () => {
    expect(sanitizeLayout({groups: [{tabs: ['a', 'gone', 'a', 'b'], active: 'gone'}], activeGroup: 0}, exists))
      .toEqual({groups: [{tabs: ['a', 'b'], active: 'a'}], activeGroup: 0})
  })

  it('rejects what is not a layout', () => {
    expect(sanitizeLayout(null, exists)).toBeNull()
    expect(sanitizeLayout({groups: 'x'}, exists)).toBeNull()
    expect(sanitizeLayout({groups: []}, exists)).toBeNull()
  })

  it('caps the groups and fixes a bad active group', () => {
    const layout = sanitizeLayout({
      groups: [{tabs: ['a'], active: 'a'}, {tabs: ['b'], active: 'b'}, {tabs: ['c'], active: 'c'}],
      activeGroup: 7,
    }, exists)
    expect(layout).toEqual({groups: [{tabs: ['a'], active: 'a'}, {tabs: ['b'], active: 'b'}], activeGroup: 0})
  })
})

describe('preview tabs', () => {
  it('a preview takes the place of the last preview', () => {
    const group = {tabs: ['a'], active: 'a', preview: null as string | null}
    openTab(group, 'b', undefined, true)
    expect(group).toEqual({tabs: ['a', 'b'], active: 'b', preview: 'b'})
    openTab(group, 'c', undefined, true)
    expect(group).toEqual({tabs: ['a', 'c'], active: 'c', preview: 'c'})
  })

  it('previewing an open file only shows it', () => {
    const group = {tabs: ['a', 'b'], active: 'b', preview: 'b'}
    openTab(group, 'a', undefined, true)
    expect(group).toEqual({tabs: ['a', 'b'], active: 'a', preview: 'b'})
  })

  it('opening the previewed file for good keeps it', () => {
    const group = {tabs: ['a', 'b'], active: 'a', preview: 'b'}
    openTab(group, 'b')
    expect(group).toEqual({tabs: ['a', 'b'], active: 'b', preview: null})
    openTab(group, 'c', undefined, true)
    expect(group.tabs).toEqual(['a', 'b', 'c'])
  })

  it('pinning ends the preview', () => {
    const layout: TabLayout = {groups: [{tabs: ['a'], active: 'a', preview: 'a'}], activeGroup: 0}
    expect(pinTab(layout, 'a')).toBe(true)
    expect(layout.groups[0].preview).toBeNull()
    expect(pinTab(layout, 'a')).toBe(false)
  })

  it('closing, renaming and moving follow the preview', () => {
    const group = {tabs: ['a', 'b'], active: 'b', preview: 'b'}
    closeTab(group, 'b')
    expect(group.preview).toBeNull()

    const layout: TabLayout = {groups: [{tabs: ['a', 'b'], active: 'b', preview: 'b'}, {tabs: ['c'], active: 'c'}], activeGroup: 0}
    renamePath(layout, 'b', 'lib/b')
    expect(layout.groups[0].preview).toBe('lib/b')
    moveTab(layout, 0, 'lib/b', 1)
    expect(layout.groups[0].preview).toBeNull()
    expect(layout.groups[1].preview).toBeUndefined()
  })

  it('a stored preview survives only when its tab does', () => {
    const exists = () => true
    expect(sanitizeLayout({groups: [{tabs: ['a', 'b'], active: 'a', preview: 'b'}]}, exists)?.groups[0].preview).toBe('b')
    expect(sanitizeLayout({groups: [{tabs: ['a'], active: 'a', preview: 'x'}]}, exists)?.groups[0].preview).toBeUndefined()
  })
})
