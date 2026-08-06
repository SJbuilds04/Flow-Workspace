import { relative, resolve, sep } from 'node:path'
import { MEDIA_PROTOCOL } from '@shared/ipc'
import { paths } from './paths'

export type MediaRoot = 'uploads' | 'outputs'

function rootDirectory(root: MediaRoot): string {
  return root === 'uploads' ? paths.uploads() : paths.outputs()
}

/** Builds the `flow-media://` URL the renderer uses to display a local file. */
export function toMediaUrl(root: MediaRoot, absolutePath: string): string {
  const rel = relative(rootDirectory(root), absolutePath)
  const segments = rel.split(sep).map(encodeURIComponent)
  return `${MEDIA_PROTOCOL}://${root}/${segments.join('/')}`
}

/**
 * Resolves a `flow-media://` URL back to a file on disk, refusing anything that
 * escapes its declared root. Path traversal in a renderer-supplied URL must
 * never reach the user's wider filesystem.
 */
export function fromMediaUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.protocol !== `${MEDIA_PROTOCOL}:`) return null

  const host = parsed.host as MediaRoot
  if (host !== 'uploads' && host !== 'outputs') return null

  const decoded = decodeURIComponent(parsed.pathname).replace(/^\/+/, '')
  if (!decoded) return null

  const root = rootDirectory(host)
  const target = resolve(root, decoded)
  const rel = relative(root, target)

  if (rel.startsWith('..') || rel.includes(`..${sep}`) || resolve(rel) === rel) {
    return null
  }

  return target
}
