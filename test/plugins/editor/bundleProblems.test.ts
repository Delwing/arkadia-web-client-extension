import {describe, expect, it} from 'vitest'
import {bundleProblems} from '../../../plugins/editor/bundleProblems'

const has = (...paths: string[]) => (p: string) => paths.includes(p)

describe('bundleProblems', () => {
  it('places esbuild errors in the plugin file they name', () => {
    const failure = {
      errors: [
        {text: 'File not found: missing.ts', location: {file: 'plugin-vfs:index.ts', line: 2, column: 7, length: 11}},
        {text: 'Unexpected end of file', location: {file: 'plugin-vfs:lib/x.ts', line: 2, column: 0, length: 0}},
      ],
    }
    expect(bundleProblems(failure, 'index.ts', has('index.ts', 'lib/x.ts'))).toEqual([
      {path: 'index.ts', message: 'File not found: missing.ts', startLineNumber: 2, startColumn: 8, endLineNumber: 2, endColumn: 19},
      {path: 'lib/x.ts', message: 'Unexpected end of file', startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 2},
    ])
  })

  it('puts errors with no place in a plugin file on the entry point', () => {
    const failure = {errors: [{text: 'Could not resolve "lodash"', location: {file: '<stdin>', line: 1, column: 0, length: 5}}]}
    expect(bundleProblems(failure, 'main.ts', has('main.ts'))[0]).toMatchObject({path: 'main.ts', startLineNumber: 1})
    expect(bundleProblems(new Error('esbuild not initialized'), 'main.ts', has('main.ts'))).toEqual([
      {path: 'main.ts', message: 'esbuild not initialized', startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1},
    ])
  })
})
