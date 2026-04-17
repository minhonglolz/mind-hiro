import type { MindMapFile, MindHiroConfig } from '../../shared/types'

// Matches a markdown heading or list item whose entire node text is one or more @-references
// Group 1: the prefix (heading hashes + space, or list marker + space, including leading indent)
// Group 2: the @-reference expression, e.g. "@foo", "@foo.bar", "@a > @b"
const IMPORT_LINE_RE =
  /^(#{1,6} |[ \t]*[-*+] )(@[\w\-\u4e00-\u9fff./]+(?:\s*>\s*@[\w\-\u4e00-\u9fff./]+)*)$/

// Extracts individual "@name" or "@name.section" tokens from a composition expression
const MODULE_REF_RE = /@([\w\-\u4e00-\u9fff./]+)/g

// Maximum recursion depth to prevent infinite expansion
const MAX_DEPTH = 10

/** Parse the heading level from a line, returns 0 if not a heading */
function headingLevel(line: string): number {
  const m = line.match(/^(#{1,6}) /)
  return m ? m[1].length : 0
}

/**
 * Extracts the subtree starting at the first heading whose stripped text matches `sectionName`.
 * Returns that heading and all lines below it until a heading of equal or higher level is found.
 * If no match is found, returns the full content.
 */
function extractSection(content: string, sectionName: string): string {
  const lines = content.split('\n')
  let startIdx = -1
  let baseLevel = 0

  for (let i = 0; i < lines.length; i++) {
    const lvl = headingLevel(lines[i])
    if (lvl > 0) {
      const text = lines[i].replace(/^#{1,6} /, '').trim()
      if (text === sectionName) {
        startIdx = i
        baseLevel = lvl
        break
      }
    }
  }

  if (startIdx === -1) return content

  const result: string[] = [lines[startIdx]]
  for (let i = startIdx + 1; i < lines.length; i++) {
    const lvl = headingLevel(lines[i])
    if (lvl > 0 && lvl <= baseLevel) break
    result.push(lines[i])
  }
  return result.join('\n')
}

/**
 * Re-indent all headings in `content` so that a heading at `sourceLevel`
 * becomes a heading at `targetLevel`. Headings deeper than `sourceLevel`
 * are shifted proportionally. The root heading of the imported content is
 * removed (it becomes the label of the @-reference line itself), and its
 * children are promoted.
 */
function reindentContent(content: string, targetLevel: number): string {
  const lines = content.split('\n')

  // Find the minimum heading level in the content to use as base
  let minLevel = 7
  for (const line of lines) {
    const lvl = headingLevel(line)
    if (lvl > 0 && lvl < minLevel) minLevel = lvl
  }
  if (minLevel === 7) {
    // No headings — wrap everything as list items indented under targetLevel
    return lines
      .filter((l) => l.trim())
      .map((l) => `${'#'.repeat(targetLevel + 1)} ${l.trim()}`)
      .join('\n')
  }

  const offset = targetLevel - minLevel + 1

  return lines
    .map((line) => {
      const lvl = headingLevel(line)
      if (lvl === 0) return line
      const newLevel = Math.min(lvl + offset, 6)
      const rest = line.replace(/^#{1,6} /, '')
      return `${'#'.repeat(newLevel)} ${rest}`
    })
    .join('\n')
}

/**
 * Determine the "base level" of an import line prefix.
 * For headings it's the number of `#`. For list items it's treated as level 3
 * (so children start at level 4).
 */
function prefixLevel(prefix: string): number {
  const m = prefix.match(/^(#{1,6}) $/)
  if (m) return m[1].length
  // list item — treat as depth 3
  return 3
}

/**
 * Resolve a single module reference token (e.g. "建立訂單" or "建立訂單.選擇商品")
 * into expanded markdown lines, or null if the module isn't found.
 */
function resolveRef(
  token: string,
  files: MindMapFile[],
  targetLevel: number,
  visited: Set<string>,
  config: MindHiroConfig,
): string | null {
  const dotIdx = token.indexOf('.')
  const fileName = dotIdx === -1 ? token : token.slice(0, dotIdx)
  const sectionName = dotIdx === -1 ? null : token.slice(dotIdx + 1)

  const file = files.find((f) => f.name === fileName)
  if (!file) return null

  let content = file.content
  if (sectionName) {
    content = extractSection(content, sectionName)
  }

  // Recursively resolve imports within the module content
  content = resolveImports(content, files, fileName, config, new Set(visited))

  return reindentContent(content, targetLevel)
}

/**
 * Apply hidePrefix filtering: removes lines (and their sub-tree) whose node text
 * starts with any of the configured prefixes.
 */
function applyHidePrefix(content: string, prefixes: string[]): string {
  if (!prefixes.length) return content
  const lines = content.split('\n')
  const result: string[] = []
  let skipUntilLevel: number | null = null

  for (const line of lines) {
    const lvl = headingLevel(line)
    const nodeText = lvl > 0 ? line.replace(/^#{1,6} /, '') : null

    if (skipUntilLevel !== null) {
      if (lvl > 0 && lvl <= skipUntilLevel) {
        // Back to parent level or higher — stop skipping
        skipUntilLevel = null
      } else {
        continue
      }
    }

    if (lvl > 0 && nodeText !== null) {
      if (prefixes.some((p) => nodeText.startsWith(p))) {
        skipUntilLevel = lvl
        continue
      }
    }

    result.push(line)
  }

  return result.join('\n')
}

/**
 * Resolve all @-import references in `content`, expanding them with content
 * from matching files. Also applies hidePrefix filtering from config.
 *
 * @param content        Raw markdown content to process
 * @param files          All available MindMapFiles to resolve references against
 * @param currentFileName Name of the file being rendered (to prevent self-import)
 * @param config         Optional config with hidePrefix settings
 * @param visited        Internal: set of module names in the current expansion chain
 */
export function resolveImports(
  content: string,
  files: MindMapFile[],
  currentFileName: string,
  config: MindHiroConfig = {},
  visited: Set<string> = new Set(),
): string {
  if (visited.size >= MAX_DEPTH) return content
  visited = new Set([...visited, currentFileName])

  const lines = content.split('\n')
  const result: string[] = []
  let inFence = false

  for (const line of lines) {
    // Track fenced code blocks
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence
      result.push(line)
      continue
    }
    if (inFence) {
      result.push(line)
      continue
    }

    const m = line.match(IMPORT_LINE_RE)
    if (!m) {
      result.push(line)
      continue
    }

    const prefix = m[1]
    const expr = m[2]
    const baseLevel = prefixLevel(prefix)

    // Parse all @refs in the expression (handles "@a > @b" composition)
    const tokens: string[] = []
    let match: RegExpExecArray | null
    MODULE_REF_RE.lastIndex = 0
    while ((match = MODULE_REF_RE.exec(expr)) !== null) {
      tokens.push(match[1])
    }

    let expanded = false
    const expandedChunks: string[] = []

    for (const token of tokens) {
      // Get just the file name part (before any '.')
      const fileName = token.includes('.') ? token.slice(0, token.indexOf('.')) : token

      if (visited.has(fileName)) {
        // Circular reference — keep original text
        expandedChunks.push(line)
        continue
      }

      const resolved = resolveRef(token, files, baseLevel, visited, config)
      if (resolved !== null) {
        expandedChunks.push(resolved)
        expanded = true
      } else {
        // Module not found — keep original line
        expandedChunks.push(line)
      }
    }

    if (expanded) {
      result.push(...expandedChunks)
    } else {
      result.push(line)
    }
  }

  const joined = result.join('\n')

  // Apply hidePrefix filtering
  const prefixes = config.hidePrefix ?? []
  return prefixes.length ? applyHidePrefix(joined, prefixes) : joined
}
