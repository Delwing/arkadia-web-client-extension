/**
 * Reading a plugin from a public GitHub repository: no account, no token.
 *
 * Two REST API calls per import or pull (the commit a ref points at, and the
 * tree of that commit); file contents come from raw.githubusercontent.com,
 * which does not count against the API's 60-requests-an-hour limit.
 *
 * A plugin imported this way remembers the commit it came from and the git
 * blob id of every file at that commit. Hashing the plugin's own files the
 * same way tells which side changed what, so a pull takes upstream changes
 * without throwing away local ones, and only asks about files both changed.
 */

import {isMirroredPath, MAX_FILE_SIZE} from './localFolder'

const API = 'https://api.github.com'
const RAW = 'https://raw.githubusercontent.com'
export const MAX_FILES = 300

/** Where a plugin lives on GitHub: a repo, a folder in it, and a branch, tag or commit. */
export interface GithubSource {
  owner: string
  repo: string
  /** Folder in the repo holding the plugin, without slashes at the ends; '' for the root. */
  path: string
  /** Branch, tag or commit; the default branch when absent. */
  ref?: string
}

/** Stored on a plugin imported from GitHub. */
export interface GithubLink extends GithubSource {
  /** Commit the plugin's files were last taken from. */
  commit: string
  /** Git blob id of each file at that commit, by plugin path. */
  blobs: Record<string, string>
}

export class GithubError extends Error {}

type Fetch = typeof fetch

const NAME = /^[A-Za-z0-9_.-]+$/

/**
 * Read what the user typed: `owner/repo`, `owner/repo/folder`, either with
 * `@ref`, or a github.com URL (`/tree/<ref>/<folder>` included). Null when
 * it is none of these.
 */
export function parseGithubSource(input: string): GithubSource | null {
  let text = input.trim()
  let ref: string | undefined
  let path: string[]

  const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.*)$/i.exec(text)
  if (url) {
    text = url[1].replace(/[?#].*$/, '')
    const parts = text.split('/').filter(Boolean)
    if (parts.length < 2) return null
    const [owner, repo, kind, refPart, ...rest] = parts
    if (kind !== undefined) {
      if ((kind !== 'tree' && kind !== 'blob') || !refPart) return null
      ref = decodeURIComponent(refPart)
    }
    path = rest
    return make(owner, repo.replace(/\.git$/, ''), path, ref)
  }

  const at = text.lastIndexOf('@')
  if (at >= 0) {
    ref = text.slice(at + 1).trim()
    text = text.slice(0, at)
    if (!ref) return null
  }
  const parts = text.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const [owner, repo, ...rest] = parts
  return make(owner, repo.replace(/\.git$/, ''), rest, ref)
}

function make(owner: string, repo: string, path: string[], ref?: string): GithubSource | null {
  if (!NAME.test(owner) || !NAME.test(repo)) return null
  if (path.some(part => part === '.' || part === '..')) return null
  return { owner, repo, path: path.join('/'), ...(ref ? { ref } : {}) }
}

/** `owner/repo/folder@ref`, the form the import dialog takes. */
export function describeSource(source: GithubSource): string {
  return `${source.owner}/${source.repo}${source.path ? `/${source.path}` : ''}${source.ref ? `@${source.ref}` : ''}`
}

/** Link to the source on github.com. */
export function sourceUrl(source: GithubSource, commit?: string): string {
  const base = `https://github.com/${source.owner}/${source.repo}`
  const ref = commit ?? source.ref
  if (!ref && !source.path) return base
  return `${base}/tree/${encodeURIComponent(ref ?? 'HEAD')}${source.path ? `/${encodePath(source.path)}` : ''}`
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

async function api(fetchImpl: Fetch, source: GithubSource, url: string, accept: string): Promise<Response> {
  let response: Response
  try {
    response = await fetchImpl(url, { headers: { Accept: accept } })
  } catch {
    throw new GithubError('Could not reach GitHub. Check your connection.')
  }
  if (response.ok) return response
  if ((response.status === 403 || response.status === 429) && response.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(response.headers.get('x-ratelimit-reset'))
    const minutes = reset ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60000)) : null
    throw new GithubError(`GitHub allows 60 requests an hour without signing in, and they are used up. ` +
      (minutes ? `Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` : 'Try again later.'))
  }
  if (response.status === 404 || response.status === 422) {
    throw new GithubError(`${describeSource(source)} was not found. Check the name and branch; private repositories are not supported.`)
  }
  throw new GithubError(`GitHub answered ${response.status} ${response.statusText}`.trim())
}

/** The commit the source's ref (or the default branch) points at now. */
export async function resolveCommit(source: GithubSource, fetchImpl: Fetch = fetch): Promise<string> {
  const ref = encodeURIComponent(source.ref ?? 'HEAD')
  const response = await api(fetchImpl, source, `${API}/repos/${source.owner}/${source.repo}/commits/${ref}`, 'application/vnd.github.sha')
  const sha = (await response.text()).trim()
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new GithubError('GitHub sent an unexpected answer for the commit.')
  return sha
}

interface TreeEntry {
  path: string
  type: string
  sha: string
  size?: number
}

/**
 * The plugin's files at `commit`: git blob id by plugin path (relative to
 * the source's folder). Only the files a linked folder would mirror count.
 */
export async function listFiles(source: GithubSource, commit: string, fetchImpl: Fetch = fetch): Promise<Record<string, string>> {
  const response = await api(fetchImpl, source,
    `${API}/repos/${source.owner}/${source.repo}/git/trees/${commit}?recursive=1`, 'application/vnd.github+json')
  const tree = await response.json() as { tree: TreeEntry[]; truncated?: boolean }
  if (tree.truncated) throw new GithubError(`${source.owner}/${source.repo} is too large to read. Keep the plugin in a repository of its own.`)

  const prefix = source.path ? `${source.path}/` : ''
  const blobs: Record<string, string> = {}
  let inFolder = !prefix
  for (const entry of tree.tree) {
    if (prefix && (entry.path === source.path || entry.path.startsWith(prefix))) inFolder = true
    if (entry.type !== 'blob' || !entry.path.startsWith(prefix)) continue
    const path = entry.path.slice(prefix.length)
    if (!isMirroredPath(path) || (entry.size ?? 0) > MAX_FILE_SIZE) continue
    blobs[path] = entry.sha
  }

  if (!inFolder) throw new GithubError(`${source.owner}/${source.repo} has no folder ${source.path}.`)
  const count = Object.keys(blobs).length
  if (!count) throw new GithubError(`${describeSource(source)} has no plugin source files.`)
  if (count > MAX_FILES) throw new GithubError(`${describeSource(source)} holds ${count} source files. Point at the plugin's own folder.`)
  return blobs
}

/** Contents of the plugin's files at `commit`, a few downloads at a time. */
export async function downloadFiles(
  source: GithubSource,
  commit: string,
  paths: string[],
  fetchImpl: Fetch = fetch,
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true })
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < paths.length) {
      const path = paths[next++]
      const full = source.path ? `${source.path}/${path}` : path
      let response: Response
      try {
        response = await fetchImpl(`${RAW}/${source.owner}/${source.repo}/${commit}/${encodePath(full)}`)
      } catch {
        throw new GithubError(`Could not download ${path} from GitHub.`)
      }
      if (!response.ok) throw new GithubError(`Could not download ${path} from GitHub (${response.status}).`)
      // Not response.text(): it drops a byte order mark, and the file would
      // then hash differently from the same file on GitHub.
      result[path] = decoder.decode(await response.arrayBuffer())
      onProgress?.(++done, paths.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, paths.length) }, worker))
  return result
}

/** The id git gives a file with this text (sha1 of "blob <bytes>\0<bytes>"). */
export async function gitBlobSha(content: string): Promise<string> {
  const body = new TextEncoder().encode(content)
  const header = new TextEncoder().encode(`blob ${body.length}\0`)
  const data = new Uint8Array(header.length + body.length)
  data.set(header)
  data.set(body, header.length)
  const digest = await crypto.subtle.digest('SHA-1', data)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function blobsOf(files: Record<string, { content: string }>): Promise<Record<string, string>> {
  const entries = await Promise.all(Object.entries(files).map(async ([path, file]) => [path, await gitBlobSha(file.content)] as const))
  return Object.fromEntries(entries)
}

/** What a pull does to each file. */
export interface PullPlan {
  /** Changed or added on GitHub only: take GitHub's version. */
  update: string[]
  /** Deleted on GitHub, unchanged here: delete here. */
  remove: string[]
  /** Changed on both sides, differently. */
  conflicts: string[]
}

/**
 * Compare base (the last commit taken), local and remote blob ids for every
 * path. Files changed only here are left alone.
 */
export function planPull(base: Record<string, string>, local: Record<string, string>, remote: Record<string, string>): PullPlan {
  const plan: PullPlan = { update: [], remove: [], conflicts: [] }
  const paths = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])
  for (const path of [...paths].sort()) {
    const b = base[path], l = local[path], r = remote[path]
    if (l === r || r === b) continue
    if (l === b) (r === undefined ? plan.remove : plan.update).push(path)
    else plan.conflicts.push(path)
  }
  return plan
}
