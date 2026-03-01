import { bus, state } from '../state'
import { saveTheme } from '../utils/storage'
import { buildFileShareURL } from '../utils/share'
import { icon } from '../utils/icons'
import { GUIDE_FILE } from '../main'

// ── initToolbar ────────────────────────────────────────────────────────────

export function initToolbar(): void {
  const searchInput     = document.getElementById('search-input') as HTMLInputElement
  const toggleEditorBtn = document.getElementById('toggle-editor-btn')!
  const themeBtn        = document.getElementById('theme-btn')!
  const shareBtn        = document.getElementById('share-btn')!
  const guideBtn        = document.getElementById('guide-btn')!

  // Insert Lucide icons
  toggleEditorBtn.appendChild(icon('PanelLeft', 18))
  themeBtn.appendChild(icon(state.theme === 'dark' ? 'Sun' : 'Moon', 18))
  shareBtn.appendChild(icon('Share2', 18))
  guideBtn.appendChild(icon('BookOpen', 18))

  // Search
  searchInput.addEventListener('input', () => {
    bus.emit('search:change', searchInput.value)
  })

  // Toggle editor
  toggleEditorBtn.addEventListener('click', () => bus.emit('editor:toggle'))

  // Toggle theme
  themeBtn.addEventListener('click', () => bus.emit('theme:toggle'))

  // Share
  shareBtn.addEventListener('click', () => {
    if (!state.currentFile) return
    const isLocal = state.localFileNames.has(state.currentFile.name)
    const url = buildFileShareURL(state.currentFile, state.currentContent, isLocal)
    navigator.clipboard.writeText(url).then(
      () => {
        shareBtn.style.color = 'var(--hiro)'
        setTimeout(() => { shareBtn.style.color = '' }, 2000)
      },
      () => { window.history.replaceState(null, '', url) }
    )
  })

  // Guide
  guideBtn.addEventListener('click', () => {
    const guide = state.files.find((f) => f.name === GUIDE_FILE.name) ?? GUIDE_FILE
    state.currentFile = guide
    bus.emit('file:select', guide)
  })

  // Theme toggle — update state, theme class, icon
  bus.on('theme:toggle', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark'
    applyTheme(state.theme)
    saveTheme(state.theme)
    themeBtn.innerHTML = ''
    themeBtn.appendChild(icon(state.theme === 'dark' ? 'Sun' : 'Moon', 18))
  })
}

export function applyTheme(theme: 'dark' | 'light'): void {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}
