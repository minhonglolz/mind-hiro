import { bus, state } from '../state'
import { buildShareURL } from '../utils/share'
import type { MindMapFile } from '../../shared/types'

export interface Action {
  id: string
  group: 'Files' | 'Actions'
  label: string
  subtitle?: string
  shortcut?: string
  perform: () => void
}

let activeIndex = 0
let visibleActions: Action[] = []

const staticActions: Action[] = [
  {
    id: 'theme',
    group: 'Actions',
    label: 'Toggle theme',
    shortcut: '⌘T',
    perform: () => bus.emit('theme:toggle'),
  },
  {
    id: 'editor',
    group: 'Actions',
    label: 'Toggle editor',
    perform: () => bus.emit('editor:toggle'),
  },
  {
    id: 'share',
    group: 'Actions',
    label: 'Copy share link',
    perform: () => shareCurrentFile(),
  },
]

function shareCurrentFile(): void {
  if (!state.currentContent) return
  const url = buildShareURL(state.currentContent)
  navigator.clipboard.writeText(url).catch(() => {
    window.location.hash = `share=${url.split('#share=')[1]}`
  })
}

function buildActions(): Action[] {
  const fileActions: Action[] = state.files.map((f: MindMapFile) => ({
    id: `file:${f.name}`,
    group: 'Files' as const,
    label: f.name,
    perform: () => {
      state.currentFile = f
      bus.emit('file:select', f)
    },
  }))
  return [...fileActions, ...staticActions]
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  // Multi-word: all words must appear somewhere
  return q.split(/\s+/).filter(Boolean).every((word) => t.includes(word))
}

function filter(query: string, allActions: Action[]): Action[] {
  if (!query.trim()) return allActions
  return allActions.filter(
    (a) =>
      fuzzyMatch(query, a.label) ||
      (a.subtitle ? fuzzyMatch(query, a.subtitle) : false)
  )
}

function render(actions: Action[]): void {
  const results = document.getElementById('cmd-results')!
  results.innerHTML = ''

  if (actions.length === 0) {
    const empty = document.createElement('li')
    empty.style.cssText = 'padding: 12px 18px; font-size: 13px; color: var(--label-3);'
    empty.textContent = 'No results'
    results.appendChild(empty)
    return
  }

  let lastGroup: string | null = null

  actions.forEach((action, i) => {
    if (action.group !== lastGroup) {
      const divider = document.createElement('li')
      divider.className = 'cmd-group-label'
      divider.textContent = action.group
      results.appendChild(divider)
      lastGroup = action.group
    }

    const li = document.createElement('li')
    li.className = `cmd-row${i === activeIndex ? ' active' : ''}`
    li.dataset.index = String(i)

    const icon = document.createElement('span')
    icon.className = 'cmd-icon'
    icon.textContent = action.group === 'Files' ? '📄' : '⚡'

    const label = document.createElement('span')
    label.className = 'cmd-label'
    label.textContent = action.label

    li.appendChild(icon)
    li.appendChild(label)

    if (action.subtitle) {
      const sub = document.createElement('span')
      sub.className = 'cmd-subtitle'
      sub.textContent = action.subtitle
      li.appendChild(sub)
    }

    if (action.shortcut) {
      const kbd = document.createElement('span')
      kbd.className = 'cmd-shortcut'
      kbd.textContent = action.shortcut
      li.appendChild(kbd)
    }

    li.addEventListener('mouseenter', () => {
      activeIndex = i
      updateActiveRow(results)
    })

    li.addEventListener('click', () => {
      activeIndex = i
      select()
    })

    results.appendChild(li)
  })
}

function updateActiveRow(results: HTMLElement): void {
  results.querySelectorAll('.cmd-row').forEach((el, i) => {
    if (i === activeIndex) {
      el.classList.add('active')
      ;(el as HTMLElement).scrollIntoView({ block: 'nearest' })
    } else {
      el.classList.remove('active')
    }
  })
}

function navigate(direction: 1 | -1): void {
  const results = document.getElementById('cmd-results')!
  const rows = results.querySelectorAll('.cmd-row')
  if (rows.length === 0) return
  activeIndex = (activeIndex + direction + rows.length) % rows.length
  updateActiveRow(results)
}

function select(): void {
  const action = visibleActions[activeIndex]
  if (action) {
    action.perform()
    close()
  }
}

function open(): void {
  const overlay = document.getElementById('cmd-overlay')!
  const input = document.getElementById('cmd-input') as HTMLInputElement

  const allActions = buildActions()
  visibleActions = allActions
  activeIndex = 0

  render(visibleActions)
  overlay.classList.remove('hidden')
  input.value = ''
  input.focus()
}

function close(): void {
  const overlay = document.getElementById('cmd-overlay')!
  const input = document.getElementById('cmd-input') as HTMLInputElement
  overlay.classList.add('hidden')
  input.value = ''
}

export function initCommandPalette(): void {
  const input = document.getElementById('cmd-input') as HTMLInputElement
  const backdrop = document.getElementById('cmd-backdrop')!
  const cmdKBtn = document.getElementById('cmd-k-btn')

  // Input — filter as user types
  input.addEventListener('input', () => {
    const allActions = buildActions()
    visibleActions = filter(input.value, allActions)
    activeIndex = 0
    render(visibleActions)
  })

  // Click backdrop to close
  backdrop.addEventListener('click', () => close())

  // ⌘K badge in toolbar
  cmdKBtn?.addEventListener('click', () => open())

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('cmd-overlay')!
    const isOpen = !overlay.classList.contains('hidden')

    // Open: Cmd+K / Ctrl+K
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      if (isOpen) {
        close()
      } else {
        open()
      }
      return
    }

    if (!isOpen) return

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        close()
        break
      case 'ArrowDown':
        e.preventDefault()
        navigate(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        navigate(-1)
        break
      case 'Enter':
        e.preventDefault()
        select()
        break
    }
  })
}
