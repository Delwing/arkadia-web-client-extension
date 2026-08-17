import { describe, it, expect } from 'vitest'
import { createEditorPluginFromSource } from '@client/utils/pluginEditorStorage'

describe('createEditorPluginFromSource', () => {
  const source = `export async function init() { return {name: 'X'} }`

  it('wraps a single blob of JavaScript into an editable single-file plugin', () => {
    const plugin = createEditorPluginFromSource('stored_abc_1', 'Wklejony', source)

    expect(plugin.id).toBe('stored_abc_1')
    expect(plugin.name).toBe('Wklejony')
    expect(plugin.entryPoint).toBe('index.js')
    expect(plugin.files['index.js']).toEqual({
      path: 'index.js',
      content: source,
      language: 'javascript',
    })
  })

  it('uses the source as the compiled output, since pasted code already runs as-is', () => {
    const plugin = createEditorPluginFromSource('stored_abc_1', 'Wklejony', source)

    expect(plugin.compiled).toBe(source)
  })

  it('keeps the original creation time when adopting an existing plugin', () => {
    const createdAt = 1_700_000_000_000
    const plugin = createEditorPluginFromSource('stored_abc_1', 'Wklejony', source, undefined, createdAt)

    expect(plugin.createdAt).toBe(createdAt)
    expect(plugin.updatedAt).toBeGreaterThanOrEqual(createdAt)
  })

  it('carries metadata through so the editor and plugin list show the same name', () => {
    const metadata = { name: 'Wklejony', version: '1.0.0', author: 'QA', description: 'test' }
    const plugin = createEditorPluginFromSource('stored_abc_1', 'Wklejony', source, metadata)

    expect(plugin.metadata).toEqual(metadata)
  })
})
