const EDIT_PREFIX = 'mind-hiro:edit:'
const THEME_KEY = 'mind-hiro:theme'
const LOCAL_FILES_KEY = 'mind-hiro:local-files'
const CHECKS_PREFIX = 'mind-hiro:checks:'

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

export function saveTheme(theme: 'dark' | 'light'): void {
  localStorage.setItem(THEME_KEY, theme)
}

export function loadTheme(): 'dark' | 'light' {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  // Respect OS preference as fallback
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
