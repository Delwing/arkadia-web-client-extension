import {describe, expect, it} from 'vitest'
import {matchPreview, patternError, replacementFor} from '../../../plugins/editor/searchText'

const plain = {matchCase: false, wholeWord: false, regex: false}
const regex = {...plain, regex: true}

describe('patternError', () => {
  it('accepts any plain text and valid patterns', () => {
    expect(patternError('(unclosed', plain)).toBeNull()
    expect(patternError('foo\\d+', regex)).toBeNull()
  })

  it('explains a broken pattern', () => {
    expect(patternError('(unclosed', regex)).toMatch(/\(unclosed/)
  })
})

describe('matchPreview', () => {
  it('shows the whole line when it is short', () => {
    expect(matchPreview('const foo = 1', 7, 10)).toEqual({before: 'const ', match: 'foo', after: ' = 1'})
  })

  it('skips indentation', () => {
    expect(matchPreview('    foo()', 5, 8)).toEqual({before: '', match: 'foo', after: '()'})
  })

  it('cuts a long lead with an ellipsis', () => {
    const line = 'x'.repeat(50) + 'needle'
    const preview = matchPreview(line, 51, 57, 10)
    expect(preview.before).toBe('…' + 'x'.repeat(10))
    expect(preview.match).toBe('needle')
  })
})

describe('replacementFor', () => {
  it('uses the text as is without a regex', () => {
    expect(replacementFor('foo', 'foo', '$1bar', plain)).toBe('$1bar')
  })

  it('fills in regex groups', () => {
    expect(replacementFor('get(5)', 'get\\((\\d+)\\)', 'fetch($1)', regex)).toBe('fetch(5)')
    expect(replacementFor('FOO', 'foo', '[$&]', regex)).toBe('[FOO]')
  })
})
