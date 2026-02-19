import { bus, state } from '../state'
import { saveEdit, loadEdit } from '../utils/storage'
import type { MindMapFile } from '../../shared/types'

let debounceTimer: ReturnType<typeof setTimeout> | null = null

export function initEditor(): void {
  const textarea = document.getElementById('editor') as HTMLTextAreaElement
  const stats = document.getElementById('editor-stats')!

  // Handle content change from textarea
  textarea.addEventListener('input', () => {
    const content = textarea.value
    state.currentContent = content

    if (state.currentFile) {
      saveEdit(state.currentFile.name, content)
    }

    updateStats(content, stats)

    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      bus.emit('content:change', content)
    }, 300)
  })

  // File selected — load content
  bus.on('file:select', (file: MindMapFile) => {
    const saved = loadEdit(file.name)
    const content = saved !== null ? saved : file.content
    textarea.value = content
    state.currentContent = content
    updateStats(content, stats)
    bus.emit('content:change', content)
  })

  // Editor toggle
  bus.on('editor:toggle', () => {
    state.isEditorVisible = !state.isEditorVisible
    const panel = document.getElementById('editor-panel')!
    const handle = document.getElementById('resize-handle')!
    panel.style.display = state.isEditorVisible ? 'flex' : 'none'
    handle.style.display = state.isEditorVisible ? 'block' : 'none'
  })

  // Resize handle — drag to adjust editor width
  initResizeHandle()
}

function initResizeHandle(): void {
  const handle = document.getElementById('resize-handle')!
  const panel  = document.getElementById('editor-panel')!

  let dragging = false
  let startX = 0
  let startWidth = 0

  handle.addEventListener('mousedown', (e) => {
    dragging   = true
    startX     = e.clientX
    startWidth = panel.offsetWidth
    document.body.style.cursor     = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return
    const width = Math.max(160, Math.min(640, startWidth + (e.clientX - startX)))
    panel.style.width = `${width}px`
  })

  document.addEventListener('mouseup', () => {
    if (!dragging) return
    dragging = false
    document.body.style.cursor     = ''
    document.body.style.userSelect = ''
  })
}

function updateStats(content: string, el: HTMLElement): void {
  const lines = content ? content.split('\n').length : 0
  const words = content.trim() ? content.trim().split(/\s+/).length : 0
  const chars = content.length
  el.textContent = `Lines: ${lines}   Words: ${words}   Chars: ${chars}`
}
