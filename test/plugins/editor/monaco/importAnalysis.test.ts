import { describe, expect, it } from 'vitest'
import {
  extractExports,
  extractImportedSymbols,
  findExistingImport,
  findPluginTypesImport,
  mergeApiImport,
  mergeFileImport,
  pluginApiExports,
  relativeImportPath,
} from '../../../../plugins/editor/monaco/importAnalysis'

describe('relativeImportPath', () => {
  it('imports a file beside this one by ./', () => {
    expect(relativeImportPath('index.ts', 'utils.ts')).toBe('./utils')
    expect(relativeImportPath('lib/a.ts', 'lib/b.ts')).toBe('./b')
  })

  it('goes down into a folder with ./, not a bare path a bundler reads as a package', () => {
    expect(relativeImportPath('index.ts', 'lib/b.ts')).toBe('./lib/b')
    expect(relativeImportPath('lib/a.ts', 'lib/deep/c.ts')).toBe('./deep/c')
  })

  it('goes up to the root without a doubled slash', () => {
    expect(relativeImportPath('lib/a.ts', 'utils.ts')).toBe('../utils')
    expect(relativeImportPath('lib/deep/a.ts', 'other/b.js')).toBe('../../other/b')
  })

  it('keeps a .json extension', () => {
    expect(relativeImportPath('index.ts', 'data/items.json')).toBe('./data/items.json')
  })
})

describe('reading imports and exports', () => {
  it('lists what a file exports, the default one marked', () => {
    const exports = extractExports(
      'export const a = 1\nexport function b() {}\nexport interface C {}\nexport type D = 1\nexport enum E {}\nexport default class F {}',
      'x.ts',
    )
    expect(exports).toEqual([
      { name: 'a', kind: 'variable' },
      { name: 'b', kind: 'function' },
      { name: 'C', kind: 'interface' },
      { name: 'D', kind: 'type' },
      { name: 'E', kind: 'enum' },
      { name: 'F', kind: 'class', isDefault: true },
    ])
  })

  it('names an anonymous default export after its file', () => {
    expect(extractExports('export default { a: 1 }', 'lib/settings.ts')).toEqual([{ name: 'settings', kind: 'default', isDefault: true }])
  })

  it('collects every name the imports bring in', () => {
    const names = extractImportedSymbols('import a from "./a"\nimport { b, c as d } from "./b"\nimport * as e from "./e"')
    expect([...names].sort()).toEqual(['a', 'b', 'd', 'e'])
  })

  it('finds an import of the plugin types under either module name', () => {
    expect(findPluginTypesImport('import type { Plugin } from "plugin-api"')).toMatchObject({ exists: true, path: 'plugin-api', namedImports: ['Plugin'] })
    expect(findPluginTypesImport("import type { PluginApi } from '@arkadia/plugin-types'\nimport { x } from 'plugin-api'"))
      .toMatchObject({ exists: true, path: '@arkadia/plugin-types', lineNumber: 1 })
    expect(findPluginTypesImport('import { x } from "./x"').exists).toBe(false)
  })

  it('reads the API exports from the typings, once', () => {
    const first = pluginApiExports()
    expect(first.some(e => e.name === 'PluginInfo' && e.kind === 'interface')).toBe(true)
    expect(pluginApiExports()).toBe(first)
  })
})

describe('merging into an existing import', () => {
  it('adds an API name to a type-only import in TypeScript, and to a plain one in JavaScript', () => {
    const existing = findExistingImport('import type { Plugin } from "@arkadia/plugin-types"', '@arkadia/plugin-types')
    expect(mergeApiImport(existing, 'PluginInfo', true)).toBe('import type { Plugin, PluginInfo } from "@arkadia/plugin-types"')
    expect(mergeApiImport(existing, 'PluginInfo', false)).toBe('import { Plugin, PluginInfo } from "@arkadia/plugin-types"')
    expect(mergeApiImport(existing, 'Plugin', true)).toBe('import type { Plugin } from "@arkadia/plugin-types"')
  })

  it('keeps a default import when merging an API name, in either language', () => {
    const existing = findExistingImport('import Api, { Plugin } from "plugin-api"', 'plugin-api')
    expect(mergeApiImport(existing, 'PluginInfo', true)).toBe('import Api, { Plugin, PluginInfo } from "plugin-api"')
    expect(mergeApiImport(existing, 'PluginInfo', false)).toBe('import Api, { Plugin, PluginInfo } from "plugin-api"')
  })

  it('merges a file export into an import of that file', () => {
    const named = 'import { a } from "./lib"'
    expect(mergeFileImport(named, findExistingImport(named, './lib'), { name: 'b', kind: 'function' }, './lib'))
      .toBe('import { a, b } from "./lib"')
    expect(mergeFileImport(named, findExistingImport(named, './lib'), { name: 'Lib', kind: 'class', isDefault: true }, './lib'))
      .toBe('import Lib, { a } from "./lib"')
    const withDefault = 'import Lib from "./lib"'
    expect(mergeFileImport(withDefault, findExistingImport(withDefault, './lib'), { name: 'b', kind: 'function' }, './lib'))
      .toBe('import Lib, { b } from "./lib"')
  })
})
