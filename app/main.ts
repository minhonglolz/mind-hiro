import './style.css'
import type { MindMapFile } from '../shared/types'
import { state } from './state'
import { bus } from './state'
import { loadTheme, loadLocalFiles } from './utils/storage'
import { getShareFromHash } from './utils/share'
import { applyTheme } from './components/toolbar'
import { initToolbar } from './components/toolbar'
import { initSidebar } from './components/sidebar'
import { initEditor } from './components/editor'
import { initMindmap } from './components/mindmap'
import { initCommandPalette } from './components/commandpalette'

export const GUIDE_FILE: MindMapFile = {
  name: '使用指南',
  content: `# Mind Hiro 使用指南

## 介面

### 側邊欄
#### 點擊檔案名稱切換顯示
#### 搜尋欄過濾檔案名稱與內容
#### ↑ 按鈕上傳本地 .md 檔案
#### + 按鈕新增空白 Markdown 檔案
#### 上傳與新增的檔案儲存於瀏覽器本地

### 編輯器
#### 直接編輯 Markdown 文字
#### 修改即時反映在右側心智圖
#### 拖動中間邊界可調整編輯器寬度
#### 所有編輯自動儲存於瀏覽器中

### 心智圖
#### 即時渲染 Markdown 標題層級結構
#### 滾輪縮放、拖動平移
#### 點擊節點可折疊與展開子樹

## 快捷鍵

### ⌘K — 開啟指令選擇器
### ⌘T — 切換深色與淺色模式

## 指令選擇器

### 搜尋並切換任意檔案
### 切換深色模式
### 切換編輯器顯示
### 複製分享連結

## 分享功能

### 點擊工具列 Share 按鈕
### 自動壓縮文件為 URL Hash
### 複製到剪貼簿後即可分享
`,
}

function boot(): void {
  // 1. Read embedded files from the data script tag
  const dataEl = document.getElementById('__MIND_HIRO_DATA__')
  let embeddedFiles: MindMapFile[] = []
  if (dataEl) {
    try {
      embeddedFiles = JSON.parse(dataEl.textContent || '[]')
    } catch {
      console.warn('[mind-hiro] Failed to parse embedded data')
    }
  }

  // 2. Check for share hash — override files if present
  const sharedContent = getShareFromHash()
  if (sharedContent !== null) {
    state.files = [{ name: 'shared.md', content: sharedContent }]
  } else {
    // Merge: guide first, then embedded, then local (skip name conflicts)
    const localFiles = loadLocalFiles()
    const embeddedNames = new Set(embeddedFiles.map((f) => f.name))
    embeddedNames.add(GUIDE_FILE.name)
    const uniqueLocal = localFiles.filter((f) => !embeddedNames.has(f.name))
    state.files = [GUIDE_FILE, ...embeddedFiles, ...uniqueLocal]
  }

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
