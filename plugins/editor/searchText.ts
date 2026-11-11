/** Text helpers for searching across a plugin's files (searchPanel.ts). */

export interface SearchOptions {
  matchCase: boolean
  wholeWord: boolean
  regex: boolean
}

/** Why a pattern can't be searched for, or null when it can. */
export function patternError(query: string, options: SearchOptions): string | null {
  if (!options.regex) return null
  try {
    new RegExp(query, 'u')
    return null
  } catch (error) {
    return error instanceof Error ? error.message.replace(/^Invalid regular expression: /, '') : 'Invalid pattern'
  }
}

/**
 * A line cut to show a match in a narrow list: a little of what comes before
 * (`…` when cut), the match, and the rest. Columns are 1-based, as Monaco's.
 */
export function matchPreview(line: string, startColumn: number, endColumn: number, lead = 16) {
  const start = startColumn - 1
  const end = Math.max(start, endColumn - 1)
  let from = Math.max(0, start - lead)
  // `…` only when the cut dropped text, not just indentation
  const cut = line.slice(0, from).trim() !== ''
  // Start on a whole word rather than halfway through one
  if (cut && /\w/.test(line[from - 1] ?? '')) {
    const boundary = line.slice(from, start).search(/\W/)
    if (boundary >= 0) from += boundary + 1
  }
  // Don't open on whitespace
  while (from < start && /\s/.test(line[from])) from++
  return {
    before: (cut ? '…' : '') + line.slice(from, start),
    match: line.slice(start, end),
    after: line.slice(end, end + 200),
  }
}

/**
 * The text that replaces one match. With a regex, `$1`, `$&` and the like
 * refer to the match's groups, as in String.replace.
 */
export function replacementFor(matched: string, query: string, replace: string, options: SearchOptions): string {
  if (!options.regex) return replace
  try {
    return matched.replace(new RegExp(query, options.matchCase ? 'u' : 'iu'), replace)
  } catch {
    return replace
  }
}
