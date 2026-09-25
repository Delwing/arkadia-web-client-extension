import { afterEach, describe, it, expect, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
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

describe('first save on a fresh profile', () => {
  const sharedIndexedDB = globalThis.indexedDB

  afterEach(() => {
    globalThis.indexedDB = sharedIndexedDB
    vi.resetModules()
  })

  const settle = <T>(promise: Promise<T>) =>
    Promise.race([promise, new Promise<'stuck'>(resolve => setTimeout(() => resolve('stuck'), 1000))])

  it('is not blocked by the connection that listed the (still empty) database', async () => {
    // A profile of its own: an empty IndexedDB, and storage modules (with their
    // connection cache) loaded fresh against it, whatever other tests stored.
    globalThis.indexedDB = new IDBFactory()
    vi.resetModules()
    const storage = await import('@client/utils/pluginEditorStorage')

    // The editor lists plugins on start. With no store yet, the first save has
    // to upgrade the database - which waits for every open connection to close.
    expect(await storage.getAllEditorPlugins()).toEqual([])

    const plugin = storage.createEditorPluginFromSource('editor_first_1', 'First', 'export async function init() {}')
    expect(await settle(storage.storeEditorPlugin(plugin))).not.toBe('stuck')
    expect((await storage.getEditorPlugin('editor_first_1'))?.name).toBe('First')
  })
})
