import { postMessage } from '../protocol'

/**
 * Local image sources the host has approved, keyed by the raw Markdown source.
 * The host only hands back URIs inside the workspace, and remote URLs are never
 * fetched, so anything not in here keeps showing its Markdown source instead.
 */
const resolved = new Map<string, string>()
const requested = new Set<string>()
const failed = new Set<string>()
const listeners = new Set<() => void>()
let counter = 0

export function isRemoteSource(source: string): boolean {
  return /^(?:[a-z][a-z\d+\-.]*:|\/\/)/iu.test(source)
}

export function resolvedImage(source: string): string | undefined {
  return resolved.get(source)
}

export function imageUnavailable(source: string): boolean {
  return failed.has(source)
}

/** Asks the host for a webview URI, once per source. */
export function requestImage(source: string): void {
  if (!source || isRemoteSource(source) || requested.has(source)) return
  requested.add(source)
  counter += 1
  postMessage({ type: 'resolveImage', requestId: `image-${counter}`, source })
}

export function setResolvedImage(source: string, uri: string): void {
  if (resolved.get(source) === uri) return
  resolved.set(source, uri)
  failed.delete(source)
  for (const listener of listeners) listener()
}

export function markImageUnavailable(source: string): void {
  if (failed.has(source)) return
  failed.add(source)
  for (const listener of listeners) listener()
}

export function onImagesChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resetImageStore(): void {
  resolved.clear()
  requested.clear()
  failed.clear()
}
