const EDIT_PREFIX = 'mind-hiro:edit:'
const THEME_KEY = 'mind-hiro:theme'

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

export function saveTheme(theme: 'dark' | 'light'): void {
  localStorage.setItem(THEME_KEY, theme)
}

export function loadTheme(): 'dark' | 'light' {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  // Respect OS preference as fallback
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
