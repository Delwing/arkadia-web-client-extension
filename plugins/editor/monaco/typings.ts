/**
 * What Monaco's TypeScript service knows: compiler options, the plugin API
 * typings (under both names a plugin may import them by), and each file of
 * the open plugin, so imports between them resolve.
 */
import * as monaco from 'monaco-editor'
import type {PluginFile} from '@client/utils/pluginEditorStorage.ts'
import pluginApiTypes from '../../types/index.d.ts?raw'
import pluginUiTypes from '../../types/ui.d.ts?raw'
import {LEGACY_PLUGIN_TYPES_MODULE, PLUGIN_TYPES_MODULE} from './moduleNames'

/** Where the editor's own typings are registered; plugin files live elsewhere. */
export const TYPINGS_ROOT = 'file:///node_modules/'

export function setupTypeScriptEnvironment() {
  // Configure TypeScript compiler options
  monaco.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.typescript.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.typescript.JsxEmit.React,
    allowJs: true,
    typeRoots: ['node_modules/@types'],
    resolveJsonModule: true,
  })

  // Also configure JavaScript defaults with same options
  monaco.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.typescript.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.typescript.JsxEmit.React,
    allowJs: true,
    typeRoots: ['node_modules/@types'],
    checkJs: true,
    resolveJsonModule: true,
  })

  // Enable diagnostics
  monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [],
  })

  monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [],
  })

  // Enable auto-imports
  monaco.typescript.typescriptDefaults.setInlayHintsOptions({
    includeInlayParameterNameHints: 'all',
    includeInlayParameterNameHintsWhenArgumentMatchesName: true,
    includeInlayFunctionParameterTypeHints: true,
    includeInlayVariableTypeHints: true,
    includeInlayPropertyDeclarationTypeHints: true,
    includeInlayFunctionLikeReturnTypeHints: true,
    includeInlayEnumMemberValueHints: true,
  })

  monaco.typescript.javascriptDefaults.setInlayHintsOptions({
    includeInlayParameterNameHints: 'all',
    includeInlayParameterNameHintsWhenArgumentMatchesName: true,
    includeInlayFunctionParameterTypeHints: true,
    includeInlayVariableTypeHints: true,
    includeInlayPropertyDeclarationTypeHints: true,
    includeInlayFunctionLikeReturnTypeHints: true,
    includeInlayEnumMemberValueHints: true,
  })

  // Set eager model sync
  monaco.typescript.typescriptDefaults.setEagerModelSync(true)
  monaco.typescript.javascriptDefaults.setEagerModelSync(true)

  // Enable semantic tokens
  monaco.typescript.typescriptDefaults.setWorkerOptions({
    customWorkerPath: undefined,
  })


  // Add Plugin API type definitions
  monaco.typescript.typescriptDefaults.addExtraLib(
    pluginApiTypes
        .replace(/@example/gm, ""),
    'file:///node_modules/@types/plugin-api/index.d.ts'
  )

  monaco.typescript.javascriptDefaults.addExtraLib(
    pluginApiTypes,
    'file:///node_modules/@types/plugin-api/index.d.ts'
  )

  // The same API under the npm package's name, and its `/ui` typings
  // (`declare module '@arkadia/ui'`). The package re-exports the module above
  // rather than a second copy, so go-to-definition still lands in one place.
  const packageEntry = `export * from '${LEGACY_PLUGIN_TYPES_MODULE}';\nexport { default } from '${LEGACY_PLUGIN_TYPES_MODULE}';\n`
  for (const defaults of [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]) {
    defaults.addExtraLib(packageEntry, `${TYPINGS_ROOT}${PLUGIN_TYPES_MODULE}/index.d.ts`)
    defaults.addExtraLib(pluginUiTypes, `${TYPINGS_ROOT}${PLUGIN_TYPES_MODULE}/ui.d.ts`)
  }

  // Add wildcard module declarations for JSON files
  const jsonModuleDeclaration = `declare module "*.json" {
  const value: any;
  export default value;
}

declare module "*data.json" {
  const value: any;
  export default value;
}`
  monaco.typescript.typescriptDefaults.addExtraLib(
    jsonModuleDeclaration,
    'file:///node_modules/@types/json-module/index.d.ts'
  )

  monaco.typescript.javascriptDefaults.addExtraLib(
    jsonModuleDeclaration,
    'file:///node_modules/@types/json-module/index.d.ts'
  )
}

const allDefaults = () => [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]

/** Put a file into Monaco's TypeScript view of the plugin, so imports of it resolve. */
export function registerPluginFileLib(pluginId: string, filePath: string, file: PluginFile) {
  const uri = `file:///${pluginId}/${filePath}`
  if (file.language === 'typescript' || file.language === 'javascript') {
    for (const defaults of allDefaults()) defaults.addExtraLib(file.content, uri)
  } else if (file.language === 'json') {
    // A .d.ts beside the JSON declares it as a module, so TypeScript types
    // `import data from './x.json'` without validating the JSON itself.
    let inferredType = 'any'
    try {
      inferredType = inferJsonType(JSON.parse(file.content || '{}'))
    } catch {
      // Invalid JSON while typing: fall back to any
    }
    const tsModuleContent = `declare const value: ${inferredType};\nexport default value;`
    for (const defaults of allDefaults()) defaults.addExtraLib(tsModuleContent, uri.replace('.json', '.json.d.ts'))
  }
}

/** Take a file (renamed or deleted) out of Monaco's TypeScript view of the plugin. */
export function unregisterPluginFileLib(pluginId: string, filePath: string) {
  const uri = `file:///${pluginId}/${filePath}`
  for (const defaults of allDefaults()) {
    defaults.addExtraLib('', uri)
    if (filePath.endsWith('.json')) defaults.addExtraLib('', uri.replace('.json', '.json.d.ts'))
  }
}

/**
 * Replace the plugin files Monaco knows with `files`. Models are not made
 * here: the editor makes them as it loads the plugin.
 */
export function updateMonacoFileSystem(pluginId: string, files: Record<string, PluginFile>) {
  // The editor's own typings live under node_modules/; only plugin files are cleared.
  for (const path of Object.keys(monaco.typescript.typescriptDefaults.getExtraLibs())) {
    if (path.startsWith('file:///') && !path.startsWith(TYPINGS_ROOT)) {
      for (const defaults of allDefaults()) defaults.addExtraLib('', path)
    }
  }
  for (const file of Object.values(files)) registerPluginFileLib(pluginId, file.path, file)
}

/** A TypeScript type for a JSON value, so `import data from './x.json'` is typed. */
export function inferJsonType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (value.length === 0) return 'any[]'
    const uniqueTypes = [...new Set(value.map(item => inferJsonType(item)))]
    return uniqueTypes.length === 1 ? `${uniqueTypes[0]}[]` : '(' + uniqueTypes.join(' | ') + ')[]'
  }
  if (typeof value === 'object') {
    const props = Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `  ${JSON.stringify(key)}: ${inferJsonType(val)}`)
      .join(';\n')
    return `{\n${props}\n}`
  }
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'any'
}
