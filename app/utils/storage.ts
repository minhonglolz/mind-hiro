const EDIT_PREFIX = 'mind-hiro:edit:'
const THEME_KEY = 'mind-hiro:theme'
const LOCAL_FILES_KEY = 'mind-hiro:local-files'
const CHECKS_PREFIX = 'mind-hiro:checks:'
const NOTES_PREFIX = 'mind-hiro:notes:'
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

export function saveNodeChecks(filename: string, checks: Record<string, 'checked' | 'blocked'>): void {
  try {
    localStorage.setItem(CHECKS_PREFIX + filename, JSON.stringify(checks))
  } catch { /* quota exceeded */ }
}

export function loadNodeChecks(filename: string): Record<string, 'checked' | 'blocked'> {
  try {
    const raw = localStorage.getItem(CHECKS_PREFIX + filename)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, boolean | 'checked' | 'blocked'>
    // Normalize v1 boolean values: true → 'checked', false → skip
    const result: Record<string, 'checked' | 'blocked'> = {}
    for (const [key, val] of Object.entries(parsed)) {
      if (val === true || val === 'checked') result[key] = 'checked'
      else if (val === 'blocked') result[key] = 'blocked'
    }
    return result
  } catch { return {} }
}

export function saveNodeNotes(filename: string, notes: Record<string, string>): void {
  try {
    localStorage.setItem(NOTES_PREFIX + filename, JSON.stringify(notes))
  } catch { /* quota exceeded */ }
}

export function loadNodeNotes(filename: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(NOTES_PREFIX + filename)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch { return {} }
}

export function renameChecks(oldName: string, newName: string): void {
  const data = localStorage.getItem(CHECKS_PREFIX + oldName)
  if (data !== null) {
    try { localStorage.setItem(CHECKS_PREFIX + newName, data) } catch { /* quota */ }
    localStorage.removeItem(CHECKS_PREFIX + oldName)
  }
}

export function renameNotes(oldName: string, newName: string): void {
  const data = localStorage.getItem(NOTES_PREFIX + oldName)
  if (data !== null) {
    try { localStorage.setItem(NOTES_PREFIX + newName, data) } catch { /* quota */ }
    localStorage.removeItem(NOTES_PREFIX + oldName)
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
  version: '1' | '2'
  filename: string
  checks: Record<string, boolean | 'checked' | 'blocked'>
  notes?: Record<string, string>
}

export interface AllProgressExport {
  version: '1' | '2'
  all: true
  files: FileProgressExport[]
}

export function exportFileChecks(filename: string): FileProgressExport {
  return { version: '2', filename, checks: loadNodeChecks(filename), notes: loadNodeNotes(filename) }
}

export function exportAllChecks(filenames: string[]): AllProgressExport {
  return { version: '2', all: true, files: filenames.map((n) => exportFileChecks(n)) }
}

export function importFileChecks(data: FileProgressExport): void {
  if ((data.version !== '1' && data.version !== '2') || typeof data.checks !== 'object' || !data.filename)
    throw new Error('Invalid progress file')
  // Normalize v1 boolean values: true → 'checked', false → skip
  const checks: Record<string, 'checked' | 'blocked'> = {}
  for (const [key, val] of Object.entries(data.checks)) {
    if (val === true || val === 'checked') checks[key] = 'checked'
    else if (val === 'blocked') checks[key] = 'blocked'
  }
  saveNodeChecks(data.filename, checks)
  if (data.notes) saveNodeNotes(data.filename, data.notes)
}

export function importChecks(data: FileProgressExport | AllProgressExport): void {
  if ('all' in data && data.all) {
    if (!Array.isArray(data.files)) throw new Error('Invalid progress file')
    for (const f of data.files) importFileChecks(f)
  } else {
    importFileChecks(data as FileProgressExport)
  }
}
