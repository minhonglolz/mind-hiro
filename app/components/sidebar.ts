import { Transformer } from 'markmap-lib'
import { bus, state } from '../state'
import {
  saveLocalFiles, loadLocalFiles,
  saveEdit, loadEdit, clearEdit,
  loadNodeChecks,
  renameChecks,
  saveSidebarWidth, loadSidebarWidth,
  exportFileChecks, exportAllChecks, importChecks,
  type FileProgressExport, type AllProgressExport,
} from '../utils/storage'
import { icon as makeIcon, type IconName } from '../utils/icons'
import type { MindMapFile } from '../../shared/types'

const transformer = new Transformer()

// In-memory list of user-added local files (persisted to localStorage)
let localFiles: MindMapFile[] = loadLocalFiles()

// Sliding pill element — created once, re-inserted on each render
let pill: HTMLDivElement
let pillReady = false

export function initSidebar(): void {
  const list      = document.getElementById('file-list')!
  const fileInput = document.getElementById('file-upload-input') as HTMLInputElement

  pill = document.createElement('div')
  pill.id = 'sidebar-pill'
  list.prepend(pill)

  initSidebarResize()
  renderFiles(list, state.files, '')

  // ── Sidebar gear dropdown ──────────────────────────────────────────────

  const gearBtn      = document.getElementById('sidebar-gear-btn')!
  const gearDropdown = document.getElementById('sidebar-gear-dropdown')!

  gearBtn.appendChild(makeIcon('Settings', 14))

  let dropdownOpen = false

  function openDropdown(): void {
    buildSidebarDropdown(gearDropdown, list, fileInput)
    gearDropdown.classList.remove('hidden')
    gearBtn.setAttribute('aria-expanded', 'true')
    dropdownOpen = true
  }

  function closeDropdown(): void {
    gearDropdown.classList.add('hidden')
    gearBtn.setAttribute('aria-expanded', 'false')
    dropdownOpen = false
  }

  gearBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (dropdownOpen) closeDropdown()
    else openDropdown()
  })

  document.addEventListener('click', (e) => {
    if (!dropdownOpen) return
    const wrap = document.getElementById('sidebar-gear-wrap')!
    if (!wrap.contains(e.target as Node)) closeDropdown()
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dropdownOpen) closeDropdown()
  })

  // ── Upload .md file ────────────────────────────────────────────────────

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

  // ── Bus events ─────────────────────────────────────────────────────────

  // Search
  bus.on('search:change', (query: string) => {
    state.searchQuery = query
    renderFiles(list, state.files, query)
  })

  // File selected — re-render to update active highlight
  bus.on('file:select', () => {
    renderFiles(list, state.files, state.searchQuery)
  })

  // After editor finishes loading a file it emits content:change.
  // Re-sync the active file's progress badge at that point (guaranteed correct).
  // Also handles live updates while the user types.
  bus.on('content:change', () => {
    if (!state.currentFile) return
    const activeItem = list.querySelector<HTMLElement>('.file-item.active')
    if (!activeItem) return
    const progressEl = activeItem.querySelector('.file-progress')
    if (progressEl) progressEl.textContent = computeProgress(state.currentFile)
  })

  // Checkbox toggled — update progress badge for active file only
  bus.on('checks:change', () => {
    if (!state.currentFile) return
    const activeItem = list.querySelector<HTMLElement>('.file-item.active')
    if (!activeItem) return
    const progressEl = activeItem.querySelector('.file-progress')
    if (progressEl) progressEl.textContent = computeProgress(state.currentFile)
  })
}

// ── Sidebar gear dropdown builder ─────────────────────────────────────────

function buildSidebarDropdown(
  dropdown: HTMLElement,
  list: HTMLElement,
  fileInput: HTMLInputElement,
): void {
  dropdown.innerHTML = ''

  dropdown.appendChild(makeSidebarItem('Plus', '新建檔案', () => {
    dropdown.classList.add('hidden')
    showNewFileInput(list)
  }))

  dropdown.appendChild(makeSidebarItem('Upload', '上傳 .md', () => {
    dropdown.classList.add('hidden')
    fileInput.click()
  }))

  dropdown.appendChild(sidebarSep())

  const exportOneBtn = makeSidebarItem('Download', '匯出當前檔案進度', () => {
    dropdown.classList.add('hidden')
    if (state.currentFile) doExport(state.currentFile.name)
  })
  if (!state.currentFile) exportOneBtn.disabled = true
  dropdown.appendChild(exportOneBtn)

  dropdown.appendChild(makeSidebarItem('Files', '匯出全部進度', () => {
    dropdown.classList.add('hidden')
    doExportAll()
  }))

  dropdown.appendChild(sidebarSep())

  dropdown.appendChild(makeSidebarItem('FolderInput', '匯入進度', () => {
    dropdown.classList.add('hidden')
    doImport()
  }))
}

function makeSidebarItem(iconName: IconName, label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'gear-item'
  btn.setAttribute('role', 'menuitem')
  btn.appendChild(makeIcon(iconName, 14))
  const span = document.createElement('span')
  span.className = 'gear-item__label'
  span.textContent = label
  btn.appendChild(span)
  btn.addEventListener('click', onClick)
  return btn
}

function sidebarSep(): HTMLHRElement {
  const hr = document.createElement('hr')
  hr.className = 'gear-separator'
  return hr
}

// ── Helpers ───────────────────────────────────────────────────────────────

function initSidebarResize(): void {
  const handle  = document.getElementById('sidebar-resize-handle')!
  const sidebar = document.getElementById('sidebar')!
  // Restore saved width
  sidebar.style.width = `${loadSidebarWidth()}px`

  let dragging = false, startX = 0, startWidth = 0

  handle.addEventListener('mousedown', (e) => {
    dragging = true
    startX = e.clientX
    startWidth = sidebar.offsetWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  })
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return
    const newWidth = Math.max(100, Math.min(400, startWidth + (e.clientX - startX)))
    sidebar.style.width = `${newWidth}px`
  })
  document.addEventListener('mouseup', () => {
    if (!dragging) return
    dragging = false
    document.body.style.cursor = document.body.style.userSelect = ''
    saveSidebarWidth(sidebar.offsetWidth)
  })
}

// Convert markmap node HTML content to the same plain text used as checkbox keys.
// Must match injectCheckboxes: div.textContent?.trim()
function htmlToText(html: string): string {
  const el = document.createElement('div')
  el.innerHTML = html
  return el.textContent?.trim() ?? ''
}

function computeProgress(file: MindMapFile): string {
  const checks  = loadNodeChecks(file.name)
  const saved   = loadEdit(file.name)
  const content = saved !== null ? saved : file.content
  if (!content.trim()) return ''

  let total = 0
  let checkedCount = 0

  try {
    const { root } = transformer.transform(content)

    // Walk the markmap tree. If a parent is checked, all descendants count as
    // checked too — mirroring the dimming logic in applyDimming().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function walk(node: any, parentChecked: boolean): void {
      const nodeText = htmlToText(node.content ?? '')
      if (!nodeText) {
        // Empty node — skip it but still walk children
        for (const child of node.children ?? []) walk(child, parentChecked)
        return
      }
      total++
      const isChecked = parentChecked || !!checks[nodeText]
      if (isChecked) checkedCount++
      for (const child of node.children ?? []) walk(child, isChecked)
    }

    walk(root, false)
  } catch {
    return ''
  }

  if (total === 0) return ''
  return `${Math.floor((checkedCount / total) * 100)}%`
}

function renameLocalFile(oldName: string, newName: string): void {
  // Update sidebar's local array
  const lf = localFiles.find((f) => f.name === oldName)
  if (lf) lf.name = newName
  // Update state.files (may be a different object for startup-loaded files)
  const sf = state.files.find((f) => f.name === oldName)
  if (sf) sf.name = newName
  state.localFileNames.delete(oldName)
  state.localFileNames.add(newName)
  saveLocalFiles(localFiles)
  // Migrate edit draft
  const edit = loadEdit(oldName)
  if (edit !== null) { saveEdit(newName, edit); clearEdit(oldName) }
  // Migrate checks
  renameChecks(oldName, newName)
  const list = document.getElementById('file-list')!
  renderFiles(list, state.files, state.searchQuery)
}

function startRename(li: HTMLElement, file: MindMapFile, nameSpan: HTMLElement): void {
  if (li.querySelector('.rename-input')) return // already renaming

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'rename-input'
  input.value = file.name
  input.spellcheck = false
  nameSpan.replaceWith(input)
  input.focus()
  input.select()

  let committed = false

  const commit = () => {
    if (committed) return
    committed = true
    const raw = input.value.trim().replace(/\.md$/i, '')
    if (raw && raw !== file.name) {
      // uniqueName handles conflicts; file.name still equals oldName here
      const newName = uniqueName(raw)
      renameLocalFile(file.name, newName)
    } else {
      input.replaceWith(nameSpan)
    }
  }
  const cancel = () => {
    if (committed) return
    committed = true
    input.replaceWith(nameSpan)
  }

  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') cancel()
  })
  input.addEventListener('click', (e) => e.stopPropagation())
  input.addEventListener('blur', commit)
}

function addLocalFile(file: MindMapFile): void {
  localFiles.push(file)
  state.files.push(file)
  state.localFileNames.add(file.name)
  saveLocalFiles(localFiles)

  const list = document.getElementById('file-list')!
  renderFiles(list, state.files, state.searchQuery)

  state.currentFile = file
  bus.emit('file:select', file)
}

function deleteLocalFile(name: string): void {
  localFiles = localFiles.filter((f) => f.name !== name)
  state.files = state.files.filter((f) => f.name !== name)
  state.localFileNames.delete(name)
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
  icon.appendChild(makeIcon('FileText', 13))

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

function doExport(filename: string): void {
  const data = exportFileChecks(filename)
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `mind-hiro-${filename}-progress.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function doExportAll(): void {
  const filenames = state.files.map((f) => f.name)
  const data = exportAllChecks(filenames)
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'mind-hiro-all-progress.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function doImport(): void {
  const input = document.getElementById('progress-import-input') as HTMLInputElement
  input.value = ''
  input.click()
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as FileProgressExport | AllProgressExport
        importChecks(data)
        bus.emit('checks:reload')
        bus.emit('search:change', state.searchQuery)
      } catch {
        alert('Invalid progress file.')
      }
    }
    reader.readAsText(file)
  }
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

    const iconSpan = document.createElement('span')
    iconSpan.className = 'file-icon'
    iconSpan.appendChild(makeIcon('FileText', 13))

    const nameSpan = document.createElement('span')
    nameSpan.className = 'file-name'
    nameSpan.textContent = file.name

    const progressSpan = document.createElement('span')
    progressSpan.className = 'file-progress'
    progressSpan.textContent = computeProgress(file)

    li.appendChild(iconSpan)
    li.appendChild(nameSpan)
    li.appendChild(progressSpan)

    if (localNames.has(file.name)) {
      // Double-click on name → rename
      nameSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation()
        startRename(li, file, nameSpan)
      })

      const btn = document.createElement('button')
      btn.className = 'delete-btn'
      btn.title = 'Delete file'
      btn.appendChild(makeIcon('Trash2', 12))
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        deleteLocalFile(file.name)
      })
      li.appendChild(btn)
    }

    li.addEventListener('click', () => {
      // Skip if already active — keeps DOM intact so dblclick rename can fire
      if (state.currentFile?.name === file.name) return
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

