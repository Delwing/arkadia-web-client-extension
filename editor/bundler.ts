import * as esbuild from 'esbuild-wasm'
import type { PluginFile } from '../src/client/utils/pluginEditorStorage'
import type { StatusType } from './types'

let esbuildInitialized = false

export async function initEsbuild(updateStatus: (message: string, type: StatusType) => void) {
  if (esbuildInitialized) return
  try {
    await esbuild.initialize({
      wasmURL: `https://unpkg.com/esbuild-wasm@${esbuild.version}/esbuild.wasm`,
    })
    esbuildInitialized = true
    updateStatus('esbuild initialized', 'success')
  } catch (error) {
    console.error('Failed to initialize esbuild:', error)
    updateStatus('Failed to initialize esbuild', 'error')
  }
}

export function isEsbuildInitialized(): boolean {
  return esbuildInitialized
}

export async function bundlePlugin(files: Record<string, PluginFile>, entryPoint: string): Promise<string> {
  if (!esbuildInitialized) {
    throw new Error('esbuild not initialized')
  }

  try {
    // Create a virtual file system plugin for esbuild
    const virtualFsPlugin: esbuild.Plugin = {
      name: 'virtual-fs',
      setup(build) {
        // Intercept imports starting with ./ or ../
        build.onResolve({ filter: /^\./ }, args => {
          // Resolve relative paths
          const dir = args.importer ? args.importer.substring(0, args.importer.lastIndexOf('/')) : ''
          let resolved = args.path

          if (resolved.startsWith('./')) {
            resolved = dir ? `${dir}/${resolved.substring(2)}` : resolved.substring(2)
          } else if (resolved.startsWith('../')) {
            const parts = dir.split('/').filter(p => p)
            const upCount = (resolved.match(/\.\.\//g) || []).length
            const remainingPath = resolved.replace(/\.\.\//g, '')
            const newParts = parts.slice(0, parts.length - upCount)
            resolved = newParts.length ? `${newParts.join('/')}/${remainingPath}` : remainingPath
          }

          // Add extension if missing
          if (!resolved.endsWith('.ts') && !resolved.endsWith('.js') && !resolved.endsWith('.json')) {
            if (files[`${resolved}.ts`]) {
              resolved = `${resolved}.ts`
            } else if (files[`${resolved}.js`]) {
              resolved = `${resolved}.js`
            } else if (files[`${resolved}.json`]) {
              resolved = `${resolved}.json`
            }
          }

          return {
            path: resolved,
            namespace: 'plugin-vfs'
          }
        })

        // Load files from virtual file system
        build.onLoad({ filter: /.*/, namespace: 'plugin-vfs' }, args => {
          const file = files[args.path]

          if (!file) {
            return {
              errors: [{
                text: `File not found: ${args.path}`,
                location: null
              }]
            }
          }

          // Determine the correct loader based on file language
          let loader: esbuild.Loader
          if (file.language === 'typescript') {
            loader = 'ts'
          } else if (file.language === 'json') {
            loader = 'json'
          } else {
            loader = 'js'
          }

          return {
            contents: file.content,
            loader: loader
          }
        })

        // Handle entry point resolution
        build.onResolve({ filter: /^entry$/ }, () => {
          return {
            path: entryPoint,
            namespace: 'plugin-vfs'
          }
        })
      }
    }

    // Bundle using esbuild
    const result = await esbuild.build({
      stdin: {
        contents: `export * from 'entry'`,
        resolveDir: '/',
        loader: 'js'
      },
      bundle: true,
      format: 'esm',
      target: 'es2020',
      write: false,
      plugins: [virtualFsPlugin],
    })

    if (result.outputFiles && result.outputFiles.length > 0) {
      return result.outputFiles[0].text
    }

    throw new Error('No output generated')
  } catch (error) {
    console.error('Bundle failed:', error)
    throw error
  }
}

export async function compileTypeScript(source: string): Promise<string> {
  if (!esbuildInitialized) {
    throw new Error('esbuild not initialized')
  }

  try {
    const result = await esbuild.transform(source, {
      loader: 'ts',
      target: 'es2020',
      format: 'esm',
    })
    return result.code
  } catch (error) {
    console.error('TypeScript compilation failed:', error)
    throw error
  }
}
