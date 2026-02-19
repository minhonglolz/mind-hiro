import { bus, state } from '../state'
import { saveLocalFiles, loadLocalFiles, clearEdit } from '../utils/storage'
import type { MindMapFile } from '../../shared/types'

// In-memory list of user-added local files (persisted to localStorage)
let localFiles: MindMapFile[] = loadLocalFiles()

// Sliding pill element — created once, re-inserted on each render
let pill: HTMLDivElement
let pillReady = false

export function initSidebar(): void {
  const list = document.getElementById('file-list')!

  pill = document.createElement('div')
  pill.id = 'sidebar-pill'
  list.prepend(pill)
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

function deleteLocalFile(name: string): void {
  localFiles = localFiles.filter((f) => f.name !== name)
  state.files = state.files.filter((f) => f.name !== name)
  saveLocalFiles(localFiles)
  clearEdit(name)

  // If the deleted file was active, select the first remaining file
  if (state.currentFile?.name === name) {
    const next = state.files[0] ?? null
    state.currentFile = next
    if (next) bus.emit('file:select', next)
  }

  const list = document.getElementById('file-list')!
  renderFiles(list, state.files, state.searchQuery)
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
  const localNames = new Set(localFiles.map((f) => f.name))

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

  // Re-insert pill (must stay in the list; sits behind items via z-index)
  list.prepend(pill)

  // Re-insert the new-file input at the top if it was open
  if (existingInput) list.insertBefore(existingInput, pill.nextSibling)

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

    if (localNames.has(file.name)) {
      const btn = document.createElement('button')
      btn.className = 'delete-btn'
      btn.title = 'Delete file'
      btn.innerHTML = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 3.5h10M5 3.5V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1M11 3.5l-.7 7.5H3.7L3 3.5"/>
      </svg>`
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        deleteLocalFile(file.name)
      })
      li.appendChild(btn)
    }

    li.addEventListener('click', () => {
      state.currentFile = file
      bus.emit('file:select', file)
    })

    list.appendChild(li)
  }

  updatePill(list)
}

function updatePill(list: HTMLElement): void {
  const activeItem = list.querySelector<HTMLElement>('.file-item.active')

  if (!activeItem) {
    pill.style.opacity = '0'
    pillReady = false
    return
  }

  const { offsetTop, offsetLeft, offsetWidth, offsetHeight } = activeItem

  if (!pillReady) {
    // First appearance: snap into place with no animation
    pill.style.transition = 'none'
    pill.style.top    = `${offsetTop}px`
    pill.style.left   = `${offsetLeft}px`
    pill.style.width  = `${offsetWidth}px`
    pill.style.height = `${offsetHeight}px`
    pill.style.opacity = '1'
    requestAnimationFrame(() => {
      pill.style.transition = ''
      pillReady = true
    })
  } else {
    pill.style.top    = `${offsetTop}px`
    pill.style.left   = `${offsetLeft}px`
    pill.style.width  = `${offsetWidth}px`
    pill.style.height = `${offsetHeight}px`
    pill.style.opacity = '1'
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
