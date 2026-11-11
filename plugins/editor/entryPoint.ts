/** Which file a plugin bundles from, kept valid as files come and go. */

const SOURCE = /\.(tsx?|jsx?)$/

/**
 * The plugin's entry point if it still has that file; otherwise the best
 * stand-in: a root `index` or `main` source file, then any root source file,
 * then any source file, then any file at all (shortest path first).
 */
export function validEntryPoint(entryPoint: string | undefined, files: Record<string, unknown>): string | undefined {
  if (entryPoint && files[entryPoint]) return entryPoint
  const paths = Object.keys(files).sort((a, b) => a.length - b.length || a.localeCompare(b))
  const sources = paths.filter(p => SOURCE.test(p))
  const atRoot = sources.filter(p => !p.includes('/'))
  return atRoot.find(p => /^(index|main)\./.test(p)) ?? atRoot[0] ?? sources[0] ?? paths[0]
}
