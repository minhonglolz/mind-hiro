import LZString from 'lz-string'
import type { MindMapFile } from '../../shared/types'

export function encodeShare(content: string): string {
  return LZString.compressToEncodedURIComponent(content)
}

export function decodeShare(encoded: string): string | null {
  return LZString.decompressFromEncodedURIComponent(encoded)
}

// ── Legacy hash-based share (keep for backward compat) ───────────────────────

export function getShareFromHash(): string | null {
  const hash = window.location.hash
  if (!hash.startsWith('#share=')) return null
  const encoded = hash.slice('#share='.length)
  return decodeShare(encoded)
}

export function buildShareURL(content: string): string {
  const encoded = encodeShare(content)
  return `${window.location.origin}${window.location.pathname}#share=${encoded}`
}

// ── New query-param-based share ───────────────────────────────────────────────

/**
 * Build a shareable URL for a file.
 * - Local files: embeds the current content as a compressed ?md= param
 * - Embedded/guide files: only adds ?file= so the recipient auto-selects it
 */
export function buildFileShareURL(
  file: MindMapFile,
  currentContent: string,
  isLocal: boolean,
): string {
  const base = `${window.location.origin}${window.location.pathname}`
  const params = new URLSearchParams()
  params.set('file', file.name)
  if (isLocal) {
    params.set('md', LZString.compressToEncodedURIComponent(currentContent))
  }
  return `${base}?${params.toString()}`
}

/**
 * Parse ?file= / ?md= query params from the current URL.
 * Returns null if no ?file= param is present.
 */
export function getShareFromQuery(): { name: string; content: string | null } | null {
  const params = new URLSearchParams(window.location.search)
  const fileName = params.get('file')
  if (!fileName) return null
  const encoded = params.get('md')
  const content = encoded ? LZString.decompressFromEncodedURIComponent(encoded) : null
  return { name: fileName, content }
}
