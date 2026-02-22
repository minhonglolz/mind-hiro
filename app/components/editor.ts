import { bus, state } from '../state'
import { saveEdit, loadEdit } from '../utils/storage'
import type { MindMapFile } from '../../shared/types'

let debounceTimer: ReturnType<typeof setTimeout> | null = null
// Hidden mirror div used to measure wrapped-line heights accurately
let _mirror: HTMLDivElement | null = null

export function initEditor(): void {
  const textarea = document.getElementById('editor') as HTMLTextAreaElement
  const wrap     = document.getElementById('editor-scroll-wrap') as HTMLElement
  const stats    = document.getElementById('editor-stats')!

  // ── Input ────────────────────────────────────────────────────────────────
  textarea.addEventListener('input', () => {
    const content = textarea.value
    state.currentContent = content
    if (state.currentFile) saveEdit(state.currentFile.name, content)
    autoResize(textarea, wrap)
    updateStats(content, stats)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => bus.emit('content:change', content), 300)
  })

  // ── File selected ────────────────────────────────────────────────────────
  bus.on('file:select', (file: MindMapFile) => {
    const saved  = loadEdit(file.name)
    const content = saved !== null ? saved : file.content
    textarea.value       = content
    state.currentContent = content
    wrap.scrollTop       = 0
    autoResize(textarea, wrap)
    updateStats(content, stats)
    bus.emit('content:change', content)
    positionBar(textarea, 0)
  })

  // ── Editor toggle ────────────────────────────────────────────────────────
  bus.on('editor:toggle', () => {
    state.isEditorVisible = !state.isEditorVisible
    const panel  = document.getElementById('editor-panel')!
    const handle = document.getElementById('resize-handle')!
    panel.style.display  = state.isEditorVisible ? 'flex' : 'none'
    handle.style.display = state.isEditorVisible ? 'block' : 'none'
  })

  // ── Persistent cursor bar: update on every cursor move ──────────────────
  document.addEventListener('selectionchange', () => {
    if (document.activeElement !== textarea) return
    const lineIndex = textarea.value
      .substring(0, textarea.selectionStart)
      .split('\n').length - 1
    positionBar(textarea, lineIndex)
  })

  // ── Mindmap node click ───────────────────────────────────────────────────
  bus.on('node:click', (nodeText: string) => {
    if (!state.isEditorVisible) bus.emit('editor:toggle')
    jumpToNode(textarea, wrap, nodeText)
  })

  // ── Resize handle ────────────────────────────────────────────────────────
  initResizeHandle()
}

// ── Mirror-based line-top measurement ─────────────────────────────────────
//
// A <textarea> wraps long lines visually but the JS API gives only logical
// (newline-separated) line indices.  We replicate the textarea's styling in a
// hidden <div> so the browser performs identical text layout, then read
// scrollHeight to get the exact pixel top of any logical line.

function ensureMirror(textarea: HTMLTextAreaElement): HTMLDivElement {
  if (_mirror) return _mirror

  _mirror = document.createElement('div')
  _mirror.setAttribute('aria-hidden', 'true')
  Object.assign(_mirror.style, {
    position:      'absolute',
    top:           '0',
    left:          '0',
    visibility:    'hidden',
    pointerEvents: 'none',
    overflow:      'hidden',
    whiteSpace:    'pre-wrap',
    wordBreak:     'break-word',
    zIndex:        '-1',
  })
  ;(textarea.parentElement as HTMLElement).appendChild(_mirror)
  return _mirror
}

function syncMirror(textarea: HTMLTextAreaElement, mirror: HTMLDivElement): void {
  const cs = getComputedStyle(textarea)
  mirror.style.width         = `${textarea.clientWidth}px`
  mirror.style.fontFamily    = cs.fontFamily
  mirror.style.fontSize      = cs.fontSize
  mirror.style.fontWeight    = cs.fontWeight
  mirror.style.lineHeight    = cs.lineHeight
  mirror.style.letterSpacing = cs.letterSpacing
  mirror.style.paddingTop    = cs.paddingTop
  mirror.style.paddingRight  = cs.paddingRight
  mirror.style.paddingLeft   = cs.paddingLeft
  mirror.style.paddingBottom = '0'
  mirror.style.boxSizing     = cs.boxSizing
}

/**
 * Returns the pixel top AND visual height of logical line `lineIndex`,
 * accounting for text wrapping (a long wrapped line spans multiple visual rows).
 *
 * Strategy: fill the mirror div with content *before* the line → read top,
 * then add the line itself → read bottom.  height = bottom − top.
 */
function getLineMetrics(
  textarea: HTMLTextAreaElement,
  lineIndex: number,
): { top: number; height: number } {
  const cs         = getComputedStyle(textarea)
  const lineHeight = parseFloat(cs.lineHeight) || 20
  const paddingTop = parseFloat(cs.paddingTop)  || 0
  const lines      = textarea.value.split('\n')

  const mirror = ensureMirror(textarea)
  syncMirror(textarea, mirror)

  // ── top of lineIndex ──────────────────────────────────────────────────
  let top: number
  if (lineIndex === 0) {
    top = paddingTop
  } else {
    mirror.textContent = lines.slice(0, lineIndex).join('\n') + '\n'
    top = mirror.scrollHeight
  }

  // ── bottom of lineIndex (= top of lineIndex + 1 in content space) ────
  mirror.textContent = lines.slice(0, lineIndex + 1).join('\n') + '\n'
  const bottom = mirror.scrollHeight

  // Ensure at least one row tall in case of measurement edge cases
  return { top, height: Math.max(lineHeight, bottom - top) }
}

// ── Bar positioning ────────────────────────────────────────────────────────

function positionBar(textarea: HTMLTextAreaElement, lineIndex: number): void {
  const bar = document.getElementById('editor-highlight-bar')
  if (!bar) return

  const { top, height } = getLineMetrics(textarea, lineIndex)
  bar.style.top    = `${top}px`
  bar.style.height = `${height}px`
  bar.classList.add('active')
}

// ── Jump to mindmap node ───────────────────────────────────────────────────

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()
}

function jumpToNode(
  textarea: HTMLTextAreaElement,
  wrap: HTMLElement,
  nodeText: string,
): void {
  const lines = textarea.value.split('\n')
  let targetLine = -1

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const stripped = raw.startsWith('#')
      ? stripInlineMarkdown(raw.replace(/^#+\s*/, ''))
      : stripInlineMarkdown(raw.replace(/^[\s\-*+\d.]+/, ''))
    if (stripped === nodeText) { targetLine = i; break }
  }

  if (targetLine === -1) return

  // Character range for selection
  let charOffset = 0
  for (let j = 0; j < targetLine; j++) charOffset += lines[j].length + 1
  const lineEnd = charOffset + lines[targetLine].length

  // Move cursor (fires selectionchange → positionBar updates automatically)
  textarea.focus({ preventScroll: true })
  textarea.setSelectionRange(charOffset, lineEnd)
  // Also call explicitly for browsers that delay selectionchange
  positionBar(textarea, targetLine)

  // Smooth-scroll the wrapper div so the bar comes into view
  const { top: topPx, height: barHeight } = getLineMetrics(textarea, targetLine)
  const maxScroll = Math.max(0, wrap.scrollHeight - wrap.clientHeight)
  const target    = Math.max(0, Math.min(maxScroll, topPx - wrap.clientHeight / 4 + barHeight / 2))

  wrap.scrollTo({ top: target, behavior: 'smooth' })
}

// ── Auto-resize (wrapper div scrolls, not textarea) ────────────────────────

function autoResize(textarea: HTMLTextAreaElement, wrap: HTMLElement): void {
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.max(wrap.clientHeight, textarea.scrollHeight)}px`
}

// ── Resize handle ──────────────────────────────────────────────────────────

function initResizeHandle(): void {
  const handle = document.getElementById('resize-handle')!
  const panel  = document.getElementById('editor-panel')!
  let dragging = false, startX = 0, startWidth = 0

  handle.addEventListener('mousedown', (e) => {
    dragging = true; startX = e.clientX; startWidth = panel.offsetWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  })
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return
    panel.style.width = `${Math.max(160, Math.min(640, startWidth + (e.clientX - startX)))}px`
  })
  document.addEventListener('mouseup', () => {
    if (!dragging) return
    dragging = false
    document.body.style.cursor = document.body.style.userSelect = ''
  })
}

function updateStats(content: string, el: HTMLElement): void {
  const lines = content ? content.split('\n').length : 0
  const words = content.trim() ? content.trim().split(/\s+/).length : 0
  el.textContent = `Lines: ${lines}   Words: ${words}   Chars: ${content.length}`
}
