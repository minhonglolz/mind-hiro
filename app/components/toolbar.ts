import { bus, state } from '../state'
import { saveTheme } from '../utils/storage'
import { buildShareURL } from '../utils/share'

export function initToolbar(): void {
  const searchInput = document.getElementById('search-input') as HTMLInputElement
  const themeBtn = document.getElementById('theme-btn') as HTMLButtonElement
  const shareBtn = document.getElementById('share-btn') as HTMLButtonElement
  const toggleEditorBtn = document.getElementById('toggle-editor-btn') as HTMLButtonElement

  // Search
  searchInput.addEventListener('input', () => {
    bus.emit('search:change', searchInput.value)
  })

  // Theme toggle
  themeBtn.addEventListener('click', () => {
    bus.emit('theme:toggle')
  })

  bus.on('theme:toggle', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark'
    applyTheme(state.theme)
    saveTheme(state.theme)
    themeBtn.textContent = state.theme === 'dark' ? '☀️' : '🌙'
  })

  // Share
  shareBtn.addEventListener('click', () => {
    if (!state.currentContent) return
    const url = buildShareURL(state.currentContent)
    navigator.clipboard.writeText(url).then(
      () => {
        const orig = shareBtn.textContent
        shareBtn.textContent = '✓ Copied!'
        setTimeout(() => { shareBtn.textContent = orig }, 2000)
      },
      () => {
        window.location.hash = `share=${url.split('#share=')[1]}`
      }
    )
  })

  // Editor toggle — editor component handles the actual panel visibility
  toggleEditorBtn.addEventListener('click', () => {
    bus.emit('editor:toggle')
  })

  bus.on('editor:toggle', () => {
    // Update button opacity to reflect new state (editor component toggles state.isEditorVisible first)
    setTimeout(() => {
      toggleEditorBtn.style.opacity = state.isEditorVisible ? '1' : '0.5'
    }, 0)
  })
}

export function applyTheme(theme: 'dark' | 'light'): void {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}
