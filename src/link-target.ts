import * as path from 'node:path'

export type LinkTarget =
  | { kind: 'external'; url: string }
  | { kind: 'file'; path: string }
  | { kind: 'missing'; path: string }
  | { kind: 'none' }

const SCHEME = /^[a-zA-Z][a-zA-Z\d+\-.]*:/u
/** Reads as a path to a file, so a missing one is reported rather than looked up on the web. */
const FILE_LIKE = /^\.{0,2}\/|\.(?:md|markdown|mdx|txt|png|jpe?g|gif|svg|webp|pdf|json|ya?ml|toml|csv|html?|css|[cm]?[jt]sx?|py|go|rs|java|rb|sh)$/iu
const BARE_DOMAIN = /^[\w-]+(?:\.[\w-]+)+(?:[/:?#]|$)/u

function decode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Where a link in a Markdown file points. `#heading` links never reach here -
 * the editor follows them itself. A `#section` or `?query` after a file name is
 * not part of the file's name, and `/docs/a.md` means the workspace root, as it
 * does on GitHub.
 */
export async function resolveLink(
  rawUrl: string,
  documentFolder: string,
  workspaceFolder: string | undefined,
  exists: (filePath: string) => Promise<boolean>,
): Promise<LinkTarget> {
  const url = rawUrl.trim()
  if (!url || url.startsWith('#')) return { kind: 'none' }
  if (SCHEME.test(url)) return { kind: 'external', url }

  const pathPart = url.split(/[?#]/u, 1)[0]
  const decoded = decode(pathPart)
  const candidates = decoded.startsWith('/') && workspaceFolder
    ? [path.join(workspaceFolder, decoded), decoded]
    : [path.resolve(documentFolder, decoded)]
  for (const candidate of candidates) {
    if (await exists(candidate)) return { kind: 'file', path: candidate }
  }
  // `example.com/page` written without https:// is a web page; `notes.md` is a missing file.
  if (!FILE_LIKE.test(pathPart) && BARE_DOMAIN.test(url)) return { kind: 'external', url: `https://${url}` }
  return { kind: 'missing', path: candidates[0] }
}
