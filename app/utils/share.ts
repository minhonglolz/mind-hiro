import LZString from 'lz-string'

export function encodeShare(content: string): string {
  return LZString.compressToEncodedURIComponent(content)
}

export function decodeShare(encoded: string): string | null {
  return LZString.decompressFromEncodedURIComponent(encoded)
}

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
