import { bus, state } from '../state'
import type { MindMapFile } from '../../shared/types'

export function initSidebar(): void {
  const list = document.getElementById('file-list')!

  renderFiles(list, state.files, '')

  bus.on('search:change', (query: string) => {
    state.searchQuery = query
    renderFiles(list, state.files, query)
  })

  bus.on('file:select', () => {
    // Re-render to update active highlight
    renderFiles(list, state.files, state.searchQuery)
  })
}

function renderFiles(list: HTMLElement, files: MindMapFile[], query: string): void {
  const q = query.toLowerCase().trim()

  // Filter: match filename OR file content
  const filtered = q
    ? files.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.content.toLowerCase().includes(q)
      )
    : files

  list.innerHTML = ''

  if (filtered.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'file-list-empty'
    empty.textContent = q ? 'No matching files' : 'No files loaded'
    list.appendChild(empty)
    return
  }

  for (const file of filtered) {
    const li = document.createElement('li')
    const isActive = state.currentFile?.name === file.name
    const isMatch = q && (file.name.toLowerCase().includes(q) || file.content.toLowerCase().includes(q))

    li.className = ['file-item', isActive ? 'active' : '', isMatch && !isActive ? 'match' : '']
      .filter(Boolean)
      .join(' ')

    li.innerHTML = `<span class="file-icon">📄</span><span class="file-name">${escapeHtml(file.name)}</span>`

    li.addEventListener('click', () => {
      state.currentFile = file
      bus.emit('file:select', file)
    })

    list.appendChild(li)
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
