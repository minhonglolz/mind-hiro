import './style.css'
import type { MindMapFile } from '../shared/types'
import { state } from './state'
import { bus } from './state'
import { loadTheme } from './utils/storage'
import { getShareFromHash } from './utils/share'
import { applyTheme } from './components/toolbar'
import { initToolbar } from './components/toolbar'
import { initSidebar } from './components/sidebar'
import { initEditor } from './components/editor'
import { initMindmap } from './components/mindmap'
import { initCommandPalette } from './components/commandpalette'

function boot(): void {
  // 1. Read embedded files from the data script tag
  const dataEl = document.getElementById('__MIND_HIRO_DATA__')
  let files: MindMapFile[] = []
  if (dataEl) {
    try {
      files = JSON.parse(dataEl.textContent || '[]')
    } catch {
      console.warn('[mind-hiro] Failed to parse embedded data')
    }
  }

  // 2. Check for share hash — override files if present
  const sharedContent = getShareFromHash()
  if (sharedContent !== null) {
    files = [{ name: 'shared.md', content: sharedContent }]
  }

  state.files = files

  // 3. Load and apply theme
  state.theme = loadTheme()
  applyTheme(state.theme)

  // 4. Boot components
  initMindmap()
  initToolbar()
  initSidebar()
  initEditor()
  initCommandPalette()

  // 5. Select first file by default
  if (state.files.length > 0) {
    const first = state.files[0]
    state.currentFile = first
    bus.emit('file:select', first)
  }
}

boot()
