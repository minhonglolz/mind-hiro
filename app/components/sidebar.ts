import { bus, state } from '../state'
import { saveLocalFiles, loadLocalFiles } from '../utils/storage'
import type { MindMapFile } from '../../shared/types'

// In-memory list of user-added local files (persisted to localStorage)
let localFiles: MindMapFile[] = loadLocalFiles()

export function initSidebar(): void {
  const list = document.getElementById('file-list')!
  const uploadBtn = document.getElementById('upload-btn')!
  const newFileBtn = document.getElementById('new-file-btn')!
  const fileInput = document.getElementById('file-upload-input') as HTMLInputElement

  renderFiles(list, state.files, '')

  // Search
  bus.on('search:change', (query: string) => {
    state.searchQuery = query
    renderFiles(list, state.files, query)
  })

  // File selected — re-render to update active highlight
  bus.on('file:select', () => {
    renderFiles(list, state.files, state.searchQuery)
  })

  // ── Upload .md file ────────────────────────────────────────────────────
  uploadBtn.addEventListener('click', () => fileInput.click())

  fileInput.addEventListener('change', () => {
    const picked = Array.from(fileInput.files ?? []).filter((f) =>
      f.name.toLowerCase().endsWith('.md')
    )
    fileInput.value = ''
    for (const file of picked) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = (e.target?.result as string) ?? ''
        const name = file.name.replace(/\.md$/i, '')
        addLocalFile({ name: uniqueName(name), content })
      }
      reader.readAsText(file)
    }
  })

  // ── New blank file ─────────────────────────────────────────────────────
  newFileBtn.addEventListener('click', () => {
    showNewFileInput(list)
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────

function addLocalFile(file: MindMapFile): void {
  localFiles.push(file)
  state.files.push(file)
  saveLocalFiles(localFiles)

  const list = document.getElementById('file-list')!
  renderFiles(list, state.files, state.searchQuery)

  state.currentFile = file
  bus.emit('file:select', file)
}

function uniqueName(base: string): string {
  const existing = new Set(state.files.map((f) => f.name))
  if (!existing.has(base)) return base
  let i = 2
  while (existing.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

function showNewFileInput(list: HTMLElement): void {
  // Prevent multiple inputs
  if (list.querySelector('.new-file-input')) return

  const li = document.createElement('li')
  li.className = 'file-item new-file-row'

  const icon = document.createElement('span')
  icon.className = 'file-icon'
  icon.textContent = '📄'

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'new-file-input'
  input.placeholder = 'filename'
  input.spellcheck = false

  li.appendChild(icon)
  li.appendChild(input)
  list.insertBefore(li, list.firstChild)
  input.focus()

  let committed = false

  const commit = () => {
    if (committed) return
    committed = true
    const raw = input.value.trim().replace(/\.md$/i, '')
    li.remove()
    if (raw) addLocalFile({ name: uniqueName(raw), content: '' })
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { committed = true; li.remove() }
  })
  input.addEventListener('blur', commit)
}

function renderFiles(list: HTMLElement, files: MindMapFile[], query: string): void {
  // Keep any active new-file input while re-rendering
  const existingInput = list.querySelector('.new-file-row')

  const q = query.toLowerCase().trim()

  const filtered = q
    ? files.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.content.toLowerCase().includes(q)
      )
    : files

  list.innerHTML = ''

  // Re-insert the input at the top if it was open
  if (existingInput) list.appendChild(existingInput)

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
