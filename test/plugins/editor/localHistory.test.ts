import {beforeEach, describe, expect, it} from 'vitest'
import {
  deletePluginHistory,
  listVersions,
  moveFileHistory,
  pruneHistory,
  recordVersions,
} from '../../../plugins/editor/localHistory'

const DAY = 24 * 60 * 60 * 1000
const limits = {maxVersions: 3, maxDays: 30}
const files = (content: Record<string, string>) =>
  Object.fromEntries(Object.entries(content).map(([path, text]) => [path, {content: text}]))

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('ArkadiaPluginEditorHistory')
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
})

describe('recordVersions', () => {
  it('records only files that changed since their last version', async () => {
    expect(await recordVersions('p', files({'a.ts': 'one', 'b.ts': 'x'}), limits, 1000)).toBe(2)
    expect(await recordVersions('p', files({'a.ts': 'two', 'b.ts': 'x'}), limits, 2000)).toBe(1)
    expect((await listVersions('p', 'a.ts')).map(v => v.content)).toEqual(['two', 'one'])
    expect((await listVersions('p', 'b.ts')).map(v => v.content)).toEqual(['x'])
  })

  it('keeps at most maxVersions per file, newest first', async () => {
    for (let i = 1; i <= 5; i++) await recordVersions('p', files({'a.ts': `v${i}`}), limits, i * 1000)
    expect((await listVersions('p', 'a.ts')).map(v => v.content)).toEqual(['v5', 'v4', 'v3'])
  })

  it('records nothing when history is off', async () => {
    expect(await recordVersions('p', files({'a.ts': 'one'}), {maxVersions: 0, maxDays: 30})).toBe(0)
    expect(await listVersions('p', 'a.ts')).toEqual([])
  })

  it('drops versions older than maxDays', async () => {
    const now = 100 * DAY
    await recordVersions('p', files({'a.ts': 'old'}), limits, now - 40 * DAY)
    await recordVersions('p', files({'a.ts': 'new'}), limits, now)
    expect((await listVersions('p', 'a.ts')).map(v => v.content)).toEqual(['new'])
  })

  it('keeps plugins apart', async () => {
    await recordVersions('p', files({'a.ts': 'mine'}), limits)
    await recordVersions('q', files({'a.ts': 'theirs'}), limits)
    expect((await listVersions('q', 'a.ts')).map(v => v.content)).toEqual(['theirs'])
  })
})

describe('maintenance', () => {
  it('prunes every file to new limits', async () => {
    for (let i = 1; i <= 3; i++) await recordVersions('p', files({'a.ts': `a${i}`, 'b.ts': `b${i}`}), limits, i * 1000)
    await pruneHistory({maxVersions: 1, maxDays: 30}, 4000)
    expect((await listVersions('p', 'a.ts')).map(v => v.content)).toEqual(['a3'])
    expect((await listVersions('p', 'b.ts')).map(v => v.content)).toEqual(['b3'])
  })

  it('moves a file history with a rename, and deletes a plugin history', async () => {
    await recordVersions('p', files({'a.ts': 'one'}), limits, 1000)
    await recordVersions('p', files({'a.ts': 'two'}), limits, 2000)
    await moveFileHistory('p', 'a.ts', 'lib/a.ts')
    expect(await listVersions('p', 'a.ts')).toEqual([])
    expect((await listVersions('p', 'lib/a.ts')).map(v => v.content)).toEqual(['two', 'one'])

    await deletePluginHistory('p')
    expect(await listVersions('p', 'lib/a.ts')).toEqual([])
  })
})
