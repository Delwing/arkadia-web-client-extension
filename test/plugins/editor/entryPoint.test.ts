import {describe, expect, it} from 'vitest'
import {validEntryPoint} from '../../../plugins/editor/entryPoint'

const files = (...paths: string[]) => Object.fromEntries(paths.map(p => [p, {}]))

describe('validEntryPoint', () => {
  it('keeps an entry point that still exists', () => {
    expect(validEntryPoint('lib/a.ts', files('index.ts', 'lib/a.ts'))).toBe('lib/a.ts')
  })

  it('prefers a root index or main file', () => {
    expect(validEntryPoint('gone.ts', files('a.ts', 'lib/index.ts', 'main.ts'))).toBe('main.ts')
    expect(validEntryPoint('gone.ts', files('zz.ts', 'index.js'))).toBe('index.js')
  })

  it('falls back to a root source file, then any source file, then anything', () => {
    expect(validEntryPoint('gone.ts', files('data.json', 'lib/x.ts', 'util.ts'))).toBe('util.ts')
    expect(validEntryPoint('gone.ts', files('data.json', 'lib/deep/x.ts', 'lib/y.ts'))).toBe('lib/y.ts')
    expect(validEntryPoint('gone.ts', files('notes.md'))).toBe('notes.md')
  })

  it('has nothing to offer with no files', () => {
    expect(validEntryPoint('gone.ts', {})).toBeUndefined()
  })
})
