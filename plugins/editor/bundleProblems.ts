/**
 * Turn esbuild's errors from a failed bundle into markers on the plugin's
 * files, so they show in the Problems panel and as squiggles like
 * TypeScript's. Plain data here; session.ts puts them on the models.
 */

/** The parts of an esbuild message used here. */
interface EsbuildMessage {
  text: string
  location?: { file: string; line: number; column: number; length: number } | null
}

export interface BundleProblem {
  /** The plugin file it belongs to. */
  path: string
  message: string
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

/** Marker owner for bundle errors. */
export const BUNDLE_MARKER_OWNER = 'esbuild'

/** esbuild's messages from a thrown build failure, or one message for anything else. */
export function bundleMessages(error: unknown): EsbuildMessage[] {
  const errors = (error as { errors?: unknown })?.errors
  if (Array.isArray(errors) && errors.length > 0) return errors as EsbuildMessage[]
  return [{ text: error instanceof Error ? error.message : String(error) }]
}

/**
 * Where each message belongs. esbuild names files `plugin-vfs:<path>` with
 * 1-based lines and 0-based columns; a message with no place in a plugin
 * file goes on the first line of the entry point.
 */
export function bundleProblems(error: unknown, entryPoint: string, hasFile: (path: string) => boolean): BundleProblem[] {
  return bundleMessages(error).map(({ text, location }) => {
    const path = location?.file.replace(/^[\w-]+:/, '')
    if (location && path && hasFile(path)) {
      const startColumn = location.column + 1
      return {
        path,
        message: text,
        startLineNumber: location.line,
        startColumn,
        endLineNumber: location.line,
        endColumn: startColumn + Math.max(location.length, 1),
      }
    }
    return { path: entryPoint, message: text, startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }
  })
}
