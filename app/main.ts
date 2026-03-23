import './style.css'
import type { MindMapFile } from '../shared/types'
import { state } from './state'
import { bus } from './state'
import { loadTheme, loadLocalFiles } from './utils/storage'
import { getShareFromHash, getShareFromQuery } from './utils/share'
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
#### ⚙ 齒輪選單新增檔案、上傳 .md
#### 匯出當前檔案進度 或 匯出全部進度（含備註）
#### 匯入進度自動辨識單筆或全部格式（含備註）
#### 本地檔案：雙擊名稱可重新命名
#### 本地檔案：右側垃圾桶圖示可刪除
#### 拖動側邊欄右邊界可調整寬度
#### 檔案右側顯示節點打勾完成百分比
#### 上傳與新增的檔案儲存於瀏覽器本地

### 釘選
#### 滑鼠移到檔案項目上，點擊釘選圖示
#### 釘選的檔案置頂顯示，圖示呈主題色
#### 再次點擊取消釘選，釘選狀態跨 Session 保存

### 資料夾
#### 使用 CLI 以 -r 掃描子目錄時自動產生資料夾分組
#### 點擊資料夾標題可收折 / 展開，狀態跨 Session 保存
#### 搜尋時自動攤平所有分組，不受資料夾影響
#### 釘選的檔案永遠置頂，不受資料夾分組限制

### 編輯器
#### 直接編輯 Markdown 文字
#### 修改即時反映在右側心智圖
#### 拖動中間邊界可調整編輯器寬度
#### 所有編輯自動儲存於瀏覽器中
#### 底部統計列顯示行數、字數、字元數

### 心智圖
#### 即時渲染 Markdown 標題層級結構
#### 滾輪縮放、拖動平移
#### 點擊節點圓點可折疊與展開子樹
#### 點擊節點文字可跳轉至編輯器對應行
#### 節點左側 Checkbox 可打勾標記完成（綠色 ✓）
#### 再次點擊切換為 Block（紅色 ✗），第三次點擊取消
#### Block 節點不計入完成百分比
#### 打勾或 Block 的節點與所有子節點自動變暗
#### 節點左側圓形圖示可新增備註，有備註時呈金色
#### 左下 ✕ 按鈕清空所有打勾與 Block 狀態
#### 左下 ↑↓ 按鈕收折或展開全部節點

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
### 本地檔案：將內容壓縮為 URL 參數一起分享
### 內嵌檔案：分享含檔案名稱的 URL 供對方直接開啟

## CLI 使用

### 安裝：npm install -g mind-hiro
### mind-hiro generate ./docs -o site.html
### mind-hiro generate ./docs -r -o site.html（含子目錄分組）
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

  // 2. Determine file list — priority: hash share > query share > normal
  let targetFileName: string | null = null

  const sharedContent = getShareFromHash()
  const queryShare = getShareFromQuery()

  if (sharedContent !== null) {
    // Legacy #share= format — single shared file
    state.files = [{ name: 'shared.md', content: sharedContent }]
  } else if (queryShare !== null) {
    if (queryShare.content !== null) {
      // ?file=name&md=compressed — shared local file with content
      state.files = [{ name: queryShare.name, content: queryShare.content }]
    } else {
      // ?file=name only — embedded file, load normally then auto-select
      const localFiles = loadLocalFiles()
      const embeddedNames = new Set(embeddedFiles.map((f) => f.name))
      embeddedNames.add(GUIDE_FILE.name)
      const uniqueLocal = localFiles.filter((f) => !embeddedNames.has(f.name))
      state.files = [GUIDE_FILE, ...embeddedFiles, ...uniqueLocal]
      state.localFileNames = new Set(localFiles.map((f) => f.name))
      targetFileName = queryShare.name
    }
  } else {
    // Normal load — merge guide + sample + embedded + local
    const localFiles = loadLocalFiles()
    const embeddedNames = new Set(embeddedFiles.map((f) => f.name))
    embeddedNames.add(GUIDE_FILE.name)
    const uniqueLocal = localFiles.filter((f) => !embeddedNames.has(f.name))
    state.files = [GUIDE_FILE, ...embeddedFiles, ...uniqueLocal]
    state.localFileNames = new Set(localFiles.map((f) => f.name))
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

  // 5. Select target file (from query param) or first file
  const initialFile =
    (targetFileName ? state.files.find((f) => f.name === targetFileName) : null) ??
    state.files[0] ??
    null

  if (initialFile) {
    state.currentFile = initialFile
    bus.emit('file:select', initialFile)
  }
}

boot()
