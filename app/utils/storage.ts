const EDIT_PREFIX = 'mind-hiro:edit:'
const THEME_KEY = 'mind-hiro:theme'
const LOCAL_FILES_KEY = 'mind-hiro:local-files'
const CHECKS_PREFIX = 'mind-hiro:checks:'
const SIDEBAR_WIDTH_KEY = 'mind-hiro:sidebar-width'

export interface StoredFile { name: string; content: string }

export function saveLocalFiles(files: StoredFile[]): void {
  try {
    localStorage.setItem(LOCAL_FILES_KEY, JSON.stringify(files))
  } catch { /* quota exceeded */ }
}

export function loadLocalFiles(): StoredFile[] {
  try {
    const raw = localStorage.getItem(LOCAL_FILES_KEY)
    return raw ? (JSON.parse(raw) as StoredFile[]) : []
  } catch { return [] }
}

export function saveEdit(filename: string, content: string): void {
  try {
    localStorage.setItem(EDIT_PREFIX + filename, content)
  } catch {
    // storage quota exceeded — ignore
  }
}

export function loadEdit(filename: string): string | null {
  return localStorage.getItem(EDIT_PREFIX + filename)
}

export function clearEdit(filename: string): void {
  localStorage.removeItem(EDIT_PREFIX + filename)
}

export function saveNodeChecks(filename: string, checks: Record<string, boolean>): void {
  try {
    localStorage.setItem(CHECKS_PREFIX + filename, JSON.stringify(checks))
  } catch { /* quota exceeded */ }
}

export function loadNodeChecks(filename: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CHECKS_PREFIX + filename)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch { return {} }
}

export function renameChecks(oldName: string, newName: string): void {
  const data = localStorage.getItem(CHECKS_PREFIX + oldName)
  if (data !== null) {
    try { localStorage.setItem(CHECKS_PREFIX + newName, data) } catch { /* quota */ }
    localStorage.removeItem(CHECKS_PREFIX + oldName)
  }
}

export function saveSidebarWidth(w: number): void {
  try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w)) } catch { /* quota */ }
}

export function loadSidebarWidth(): number {
  const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY)
  if (raw) {
    const n = parseInt(raw, 10)
    if (!isNaN(n) && n >= 100 && n <= 500) return n
  }
  return 196
}

export function saveTheme(theme: 'dark' | 'light'): void {
  localStorage.setItem(THEME_KEY, theme)
}

export function loadTheme(): 'dark' | 'light' {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  // Respect OS preference as fallback
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// ── Progress import / export (per-file and all-files) ────────────────────

export interface FileProgressExport {
  version: '1'
  filename: string
  checks: Record<string, boolean>
}

export interface AllProgressExport {
  version: '1'
  all: true
  files: FileProgressExport[]
}

export function exportFileChecks(filename: string): FileProgressExport {
  return { version: '1', filename, checks: loadNodeChecks(filename) }
}

export function exportAllChecks(filenames: string[]): AllProgressExport {
  return { version: '1', all: true, files: filenames.map((n) => exportFileChecks(n)) }
}

export function importFileChecks(data: FileProgressExport): void {
  if (data.version !== '1' || typeof data.checks !== 'object' || !data.filename)
    throw new Error('Invalid progress file')
  saveNodeChecks(data.filename, data.checks)
}

export function importChecks(data: FileProgressExport | AllProgressExport): void {
  if ('all' in data && data.all) {
    if (!Array.isArray(data.files)) throw new Error('Invalid progress file')
    for (const f of data.files) importFileChecks(f)
  } else {
    importFileChecks(data as FileProgressExport)
  }
}
