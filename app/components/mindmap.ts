import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import { zoomTransform } from 'd3'
import { bus, state } from '../state'
import { saveNodeChecks, loadNodeChecks, saveNodeNotes, loadNodeNotes } from '../utils/storage'
import { icon as makeIcon } from '../utils/icons'

const transformer = new Transformer()
let mm: Markmap | null = null
let renderTimer: ReturnType<typeof setTimeout> | null = null
let dimmingTimer: ReturnType<typeof setTimeout> | null = null
let currentContent = ''
let foldAllActive = false
let fitOnNextRender = true
let editOverlay: HTMLDivElement | null = null
let noteOverlay: HTMLDivElement | null = null
let selectedDiv: HTMLElement | null = null
let pendingSelectText: string | null = null
let forceImmediateRender = false   // bypass 300ms debounce for new-node insertion
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentRoot: any = null
let nodePathKeyMap: Map<number, string> = new Map()

const CB_SIDE   = 12 // checkbox square size (px)
const CB_GAP    = 4  // gap between checkbox right edge and text left edge (px)
const NOTE_SIDE = 10 // note icon size (px)
const NOTE_GAP  = 4  // gap between note icon and checkbox

export function initMindmap(): void {
  const svg = document.getElementById('mindmap-svg') as unknown as SVGSVGElement
  const placeholder = document.getElementById('mindmap-placeholder')!

  mm = Markmap.create(svg)

  // Re-apply dimming after every markmap render cycle (including ResizeObserver-
  // triggered re-renders).  markmap's D3 transitions animate both `transform`
  // (node position) and foreignObject `opacity` with the same 500 ms duration.
  // Watching `transform` attribute changes tells us exactly when each cycle is
  // running; 50 ms after the last mutation the opacity tween has also settled.
  const dimObserver = new MutationObserver(() => {
    if (dimmingTimer) clearTimeout(dimmingTimer)
    dimmingTimer = setTimeout(() => applyDimming(), 50)
  })
  dimObserver.observe(svg as unknown as SVGElement, {
    subtree: true, attributes: true, attributeFilter: ['transform'],
  })

  bus.on('content:change', (content: string) => {
    if (renderTimer) clearTimeout(renderTimer)
    const delay = forceImmediateRender ? 0 : 300
    forceImmediateRender = false
    renderTimer = setTimeout(() => {
      renderContent(content)
      placeholder.style.display = content.trim() ? 'none' : 'flex'
    }, delay)
  })

  bus.on('editor:active-node', (nodeText: string) => {
    setSelectedNode(findNodeDivByText(nodeText))
  })

  bus.on('checks:reload', () => {
    // Remove existing checkboxes so injectCheckboxes() re-creates them with fresh state
    const mindmapSvg = document.getElementById('mindmap-svg')
    mindmapSvg?.querySelectorAll('.hiro-check-fo').forEach((el) => el.remove())
    injectCheckboxes()
    applyDimming()
  })

  bus.on('file:select', () => {
    // Reset fold state and selection when switching files
    foldAllActive = false
    fitOnNextRender = true
    setSelectedNode(null)
    const foldBtn = document.getElementById('fold-all-btn')
    if (foldBtn) {
      foldBtn.innerHTML = ''
      foldBtn.setAttribute('data-tooltip', '收折全部')
      foldBtn.appendChild(makeIcon('ChevronsUp', 14))
    }
    // content:change will fire after file:select — placeholder managed there
  })

  initMindmapControls()

  // Bubble-phase: node text click → select node + scroll editor
  ;(svg as unknown as SVGElement).addEventListener('click', (e: Event) => {
    const target = e.target as Element
    // SVG checkbox/note rect clicks have stopPropagation — won't reach here
    if (target.closest('.hiro-check-fo')) return
    if (target.closest('.hiro-note-fo')) return

    const nodeEl = target.closest('.markmap-node')
    if (!nodeEl) {
      // Clicked empty SVG space → deselect
      setSelectedNode(null)
      return
    }

    const fo      = nodeEl.querySelector('foreignObject')
    const div     = fo?.querySelector('div') as HTMLElement | null
    const nodeText = fo
      ? (div?.textContent?.trim() ?? '')
      : (nodeEl.querySelector('text')?.textContent?.trim() ?? '')

    if (nodeText) {
      bus.emit('node:click', nodeText)
      if (div) setSelectedNode(div)
    }
  })

  // Deselect when clicking outside the SVG (but not on overlays)
  document.addEventListener('click', (e: Event) => {
    const target = e.target as Element
    if (editOverlay?.contains(target)) return
    if (noteOverlay?.contains(target)) return
    // Close note overlay when clicking outside it
    if (noteOverlay && !noteOverlay.contains(target)) closeNoteOverlay(true)
    if (!(svg as unknown as SVGElement).contains(target)) setSelectedNode(null)
  })

  // Keyboard shortcuts for selected node (no edit/note overlay active)
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!selectedDiv || !document.body.contains(selectedDiv) || editOverlay || noteOverlay) return
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault()
      startInlineEditNew(selectedDiv)
    } else if (e.key === 'Escape') {
      setSelectedNode(null)
    }
  })

  // Capture-phase: markmap calls stopPropagation() on circle clicks in its
  // own bubble handler, so bubble phase never sees them.  Use capture to
  // detect collapse/expand and re-inject checkboxes after the transition.
  ;(svg as unknown as SVGElement).addEventListener('click', (e: Event) => {
    if ((e.target as Element).tagName.toLowerCase() === 'circle') {
      setTimeout(() => injectCheckboxes(), 600)
    }
  }, { capture: true })

  window.addEventListener('resize', () => {
    if (mm && state.currentContent.trim()) mm.fit()
  })

  // ── Cmd/Ctrl + wheel zoom (Figma-style) ──────────────────────────────────
  // markmap's D3 zoom filter only recognises ctrlKey for wheel-zoom.
  // On Mac, Cmd (metaKey) + wheel should also zoom.  We intercept the event,
  // cancel the default pan handler, and programmatically drive the D3 zoom.
  const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Macintosh')
  ;(svg as unknown as SVGElement).addEventListener('wheel', (e: WheelEvent) => {
    if (!mm) return
    const wantZoom = isMac ? (e.metaKey || e.ctrlKey) : e.ctrlKey
    if (!wantZoom) return

    e.preventDefault()
    e.stopPropagation()

    const svgEl   = svg as unknown as SVGElement
    const rect    = svgEl.getBoundingClientRect()
    // Mouse position relative to SVG top-left
    const mouseX  = e.clientX - rect.left
    const mouseY  = e.clientY - rect.top

    // Zoom factor: positive deltaY → zoom out, negative → zoom in
    const factor  = Math.pow(1.002, -e.deltaY)

    // Read current transform via D3, apply scale at mouse position
    // D3's translate() works in SVG-space (scaled by k), so we must
    // convert screen coords → SVG coords for accurate zoom-at-point.
    const currentT = zoomTransform(svgEl)
    const [svgX, svgY] = currentT.invert([mouseX, mouseY])
    const newT = currentT
      .translate(svgX, svgY)
      .scale(factor)
      .translate(-svgX, -svgY)

    mm.svg.call(mm.zoom.transform as any, newT)
  }, { passive: false, capture: true })
}

// ── Node selection ─────────────────────────────────────────────────────────

function setSelectedNode(div: HTMLElement | null): void {
  if (div === selectedDiv) return
  selectedDiv?.classList.remove('mm-node-selected')
  selectedDiv = div
  selectedDiv?.classList.add('mm-node-selected')
}

function findNodeDivByText(text: string): HTMLElement | null {
  if (!text) return null
  const svg = document.getElementById('mindmap-svg')
  if (!svg) return null
  let found: HTMLElement | null = null
  svg.querySelectorAll<HTMLElement>('.markmap-node foreignObject > div').forEach((div) => {
    if (!found && div.textContent?.trim() === text) found = div
  })
  return found
}

// ── Inline node editing ────────────────────────────────────────────────────

/** Insert a <br> at the current caret position inside a contenteditable div. */
function insertLineBreakAt(): void {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const br = document.createElement('br')
  range.insertNode(br)
  // At the very end of the div a second <br> is needed so the caret can sit
  // on the new empty line — otherwise the browser ignores the trailing <br>.
  const after = br.nextSibling
  if (!after || (after.nodeType === Node.TEXT_NODE && (after as Text).data === '')) {
    const sentinel = document.createElement('br')
    br.after(sentinel)
    range.setStartBefore(sentinel)
  } else {
    range.setStartAfter(br)
  }
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

function makeEditOverlay(
  rect: DOMRect,
  cs: CSSStyleDeclaration,
  initialText: string,
  extraClass = '',
): HTMLDivElement {
  const input = document.createElement('div')
  input.className = `mm-inline-edit${extraClass ? ' ' + extraClass : ''}`
  input.contentEditable = 'true'
  input.setAttribute('spellcheck', 'false')
  if (initialText) input.textContent = initialText

  input.style.left       = `${rect.left}px`
  input.style.top        = `${rect.top}px`
  input.style.minWidth   = `${Math.max(80, rect.width)}px`
  input.style.fontSize   = cs.fontSize
  input.style.fontFamily = cs.fontFamily
  input.style.fontWeight = cs.fontWeight
  input.style.lineHeight = cs.lineHeight
  return input
}

// Edit existing node text (double-click)
function startInlineEdit(nodeEl: Element, e: MouseEvent): void {
  e.stopPropagation()

  const fo  = nodeEl.querySelector('foreignObject')
  const div = fo?.querySelector('div') as HTMLElement | null
  if (!div) return

  const nodeText = div.textContent?.trim() ?? ''
  if (!nodeText) return

  editOverlay?.remove()
  editOverlay = null
  setSelectedNode(null)

  const rect  = div.getBoundingClientRect()
  const cs    = getComputedStyle(div)
  const input = makeEditOverlay(rect, cs, nodeText)
  document.body.appendChild(input)
  editOverlay = input

  input.focus()
  const sel   = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(input)
  sel?.removeAllRanges()
  sel?.addRange(range)

  let done = false

  const confirm = () => {
    if (done) return
    done = true
    const newText = (input.innerText ?? '').replace(/\n{3,}/g, '\n\n').trim()
    input.remove()
    editOverlay = null
    if (newText && newText !== nodeText) {
      pendingSelectText = newText
      bus.emit('node:edit', { oldText: nodeText, newText })
    }
  }

  const cancel = () => {
    if (done) return
    done = true
    input.remove()
    editOverlay = null
  }

  input.addEventListener('blur', confirm)
  input.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      if (ev.metaKey || ev.ctrlKey) {
        // Cmd/Ctrl+Enter → insert line break within the node text
        ev.preventDefault()
        insertLineBreakAt()
      } else {
        ev.preventDefault()
        confirm()
      }
    } else if (ev.key === 'Escape') {
      ev.preventDefault()
      cancel()
    }
  })
}

// Add new sibling node below selected node (Enter key).
//
// Hybrid approach:
//  1. An invisible placeholder (U+200B ZERO WIDTH SPACE) is pre-inserted in
//     the markdown right away — this places the new sibling correctly in the
//     mindmap tree without any visible text or layout expansion.
//  2. The edit overlay is shown immediately at the anchor's bottom edge
//     (no D3-animation timing issues) so the user can start typing instantly.
//  3. On confirm the placeholder is replaced with the typed text (node:edit).
//  4. On cancel / empty the placeholder is removed (node:delete).
function startInlineEditNew(anchorDiv: HTMLElement): void {
  editOverlay?.remove()
  editOverlay = null

  const anchorText = anchorDiv.textContent?.trim() ?? ''
  if (!anchorText) return

  setSelectedNode(null)

  // Zero-width space is invisible and takes no layout width in the mindmap.
  const placeholder = '\u200B'

  // Insert placeholder; 0 ms debounce so the tree updates on the next tick.
  forceImmediateRender = true
  bus.emit('node:insert-after', { anchorText, newText: placeholder })

  // Show the edit overlay immediately at the anchor's position.
  const anchorRect = anchorDiv.getBoundingClientRect()
  const cs         = getComputedStyle(anchorDiv)
  const fakeRect   = new DOMRect(anchorRect.left, anchorRect.bottom + 4, anchorRect.width, anchorRect.height)
  const input      = makeEditOverlay(fakeRect, cs, '', 'mm-inline-edit--new')
  input.setAttribute('data-placeholder', 'New item…')
  document.body.appendChild(input)
  editOverlay = input
  input.focus()

  let done = false

  const confirm = () => {
    if (done) return
    done = true
    const newText = (input.innerText ?? '').replace(/\n{3,}/g, '\n\n').trim()
    input.remove()
    editOverlay = null
    if (newText) {
      pendingSelectText = newText
      bus.emit('node:edit', { oldText: placeholder, newText })
    } else {
      bus.emit('node:delete', placeholder)
    }
  }

  const cancel = () => {
    if (done) return
    done = true
    input.remove()
    editOverlay = null
    bus.emit('node:delete', placeholder)
  }

  input.addEventListener('blur', confirm)
  input.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.metaKey && !ev.ctrlKey) {
      ev.preventDefault()
      confirm()
    } else if (ev.key === 'Escape') {
      ev.preventDefault()
      cancel()
    }
  })
}

function renderContent(content: string): void {
  if (!mm) return
  currentContent = content
  if (!content.trim()) {
    mm.setData({ content: '', children: [] })
    return
  }
  const { root } = transformer.transform(content)
  currentRoot = root
  if (foldAllActive) applyFold(root, true, true)
  mm.setData(root)
  if (fitOnNextRender) {
    fitOnNextRender = false
    mm.fit()
  }
  requestAnimationFrame(() => injectCheckboxes())
  // applyDimming() is handled by the MutationObserver after transitions settle
}

// ── Mindmap quick-action controls ─────────────────────────────────────────

function initMindmapControls(): void {
  const clearBtn = document.getElementById('clear-checks-btn')
  const foldBtn  = document.getElementById('fold-all-btn')

  // Replace HTML inline SVGs with Lucide icons
  if (clearBtn) { clearBtn.innerHTML = ''; clearBtn.appendChild(makeIcon('SquareX', 14)) }
  if (foldBtn)  { foldBtn.innerHTML = '';  foldBtn.appendChild(makeIcon('ChevronsUp', 14)) }

  clearBtn?.addEventListener('click', () => {
    const file = state.currentFile?.name
    if (!file) return
    const svg = document.getElementById('mindmap-svg')!
    svg.querySelectorAll('.hiro-check-fo').forEach((el) => {
      el.classList.remove('hiro-cb-checked', 'hiro-cb-blocked')
    })
    saveNodeChecks(file, {})
    applyDimming()
    bus.emit('checks:change')
  })

  foldBtn?.addEventListener('click', () => {
    if (!mm || !currentContent.trim()) return
    foldAllActive = !foldAllActive

    // Swap icon and tooltip
    foldBtn.innerHTML = ''
    if (foldAllActive) {
      foldBtn.setAttribute('data-tooltip', '展開全部')
      foldBtn.appendChild(makeIcon('ChevronsDown', 14))
    } else {
      foldBtn.setAttribute('data-tooltip', '收折全部')
      foldBtn.appendChild(makeIcon('ChevronsUp', 14))
    }

    // Re-transform to get a clean tree, then apply fold state
    const { root } = transformer.transform(currentContent)
    currentRoot = root
    if (foldAllActive) applyFold(root, true, true)
    mm.setData(root)
    mm.fit()
    requestAnimationFrame(() => injectCheckboxes())
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFold(node: any, fold: boolean, isRoot: boolean): void {
  if (!isRoot && (node.children ?? []).length > 0) {
    node.payload = node.payload ?? {}
    node.payload.fold = fold ? 1 : 0
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const child of node.children ?? []) applyFold(child, fold, false)
}

// ── Node checkboxes + note icons (pure SVG) ───────────────────────────────
//
// Checkboxes: <g class="hiro-check-fo"> with <rect> + two polylines (✓ / ✗)
// Notes:      <g class="hiro-note-fo"> with a circle icon further to the left
//
// Both use path-based keys (root→node texts joined with \u001f) so same-named
// sibling nodes don't collide.  Legacy text-only keys are read as fallback.
//
// pointer-events strategy:
//   • <g>            no pointer-events → background clicks pass through
//   • hit area rect  pointer-events:all → responds to clicks on empty fill
//   • visual rects/polylines  pointer-events:none → decorative only
//
// This avoids the foreignObject "width:100% = viewport width" bug that was
// blocking all circle clicks.

/** Extract plain text from an HTML string. */
function htmlToText(html: string): string {
  const el = document.createElement('div')
  el.innerHTML = html
  return el.textContent?.trim() ?? ''
}

/**
 * Pre-traverse the markmap tree (where children ARE available) and build a
 * Map<state.id, pathKey> so same-named siblings at the same level get unique
 * keys.  Must be called after mm.setData(root) assigns state.id values.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPathKeyMap(node: any, idx: number, parentPath: string[]): void {
  const text = node.content ? htmlToText(node.content) : ''
  const children: any[] = node.children ?? []
  if (!text) {
    // Skip empty nodes but still recurse
    for (let i = 0; i < children.length; i++) buildPathKeyMap(children[i], i, parentPath)
    return
  }
  const segment  = `${text}\u001e${idx}`
  const nodePath = [...parentPath, segment]
  const key      = nodePath.join('\u001f')
  if (node.state?.id != null) nodePathKeyMap.set(node.state.id as number, key)
  for (let i = 0; i < children.length; i++) buildPathKeyMap(children[i], i, nodePath)
}

/**
 * Look up a node's path key from the pre-built map using its state.id.
 * Falls back to leaf text if the map has no entry (e.g. map not yet built).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildNodePathKey(data: any): string {
  const id = data.state?.id as number | null | undefined
  if (id != null) {
    const key = nodePathKeyMap.get(id)
    if (key !== undefined) return key
  }
  return data.content ? htmlToText(data.content) : ''
}

/** Close the note overlay, optionally saving its content. */
function closeNoteOverlay(save: boolean): void {
  if (!noteOverlay) return
  if (save) {
    const textarea = noteOverlay.querySelector('textarea') as HTMLTextAreaElement | null
    const cb = (noteOverlay as HTMLDivElement & { _hiroSave?: (text: string) => void })._hiroSave
    if (textarea && cb) cb(textarea.value.trim())
  }
  noteOverlay.remove()
  noteOverlay = null
}

/** Open the note popover anchored below a node's text div. */
function openNoteOverlay(
  anchorDiv: HTMLElement,
  pathKey: string,
  legacyKey: string,
  filename: string,
  noteG: SVGGElement,
): void {
  closeNoteOverlay(false)

  const notes = loadNodeNotes(filename)
  const currentNote = notes[pathKey] ?? notes[legacyKey] ?? ''

  const rect = anchorDiv.getBoundingClientRect()

  const overlay = document.createElement('div')
  overlay.className = 'hiro-note-popover'
  overlay.style.left = `${rect.left}px`
  overlay.style.top  = `${rect.bottom + 6}px`

  const label = document.createElement('div')
  label.className = 'hiro-note-label'
  label.textContent = '備註'
  overlay.appendChild(label)

  const textarea = document.createElement('textarea')
  textarea.className = 'hiro-note-textarea'
  textarea.value = currentNote
  textarea.rows = 4
  textarea.setAttribute('spellcheck', 'false')
  overlay.appendChild(textarea)

  const btns = document.createElement('div')
  btns.className = 'hiro-note-btns'

  const saveBtn   = document.createElement('button')
  saveBtn.textContent = '儲存'
  saveBtn.className = 'hiro-note-btn hiro-note-btn--save'

  const clearBtn2 = document.createElement('button')
  clearBtn2.textContent = '清除'
  clearBtn2.className = 'hiro-note-btn'

  const cancelBtn = document.createElement('button')
  cancelBtn.textContent = '取消'
  cancelBtn.className = 'hiro-note-btn'

  btns.appendChild(saveBtn)
  btns.appendChild(clearBtn2)
  btns.appendChild(cancelBtn)
  overlay.appendChild(btns)

  // Save callback: persist and update icon
  const doSave = (text: string) => {
    const fresh = loadNodeNotes(filename)
    // Remove legacy text key if present
    if (fresh[legacyKey] !== undefined && pathKey !== legacyKey) delete fresh[legacyKey]
    if (text) {
      fresh[pathKey] = text
      noteG.classList.add('hiro-has-note')
    } else {
      delete fresh[pathKey]
      noteG.classList.remove('hiro-has-note')
    }
    saveNodeNotes(filename, fresh)
  }

  // Attach save callback to the overlay element for closeNoteOverlay(true)
  ;(overlay as HTMLDivElement & { _hiroSave?: (text: string) => void })._hiroSave = doSave

  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    doSave(textarea.value.trim())
    closeNoteOverlay(false)
  })

  clearBtn2.addEventListener('click', (e) => {
    e.stopPropagation()
    textarea.value = ''
    doSave('')
    closeNoteOverlay(false)
  })

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    closeNoteOverlay(false)
  })

  textarea.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); closeNoteOverlay(false) }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveBtn.click() }
  })

  document.body.appendChild(overlay)
  noteOverlay = overlay
  textarea.focus()
}

function injectCheckboxes(): void {
  const filename = state.currentFile?.name
  if (!filename) return

  // Rebuild the state.id → pathKey map so same-named siblings get unique keys
  nodePathKeyMap = new Map()
  if (currentRoot) buildPathKeyMap(currentRoot, 0, [])

  const svg = document.getElementById('mindmap-svg')!
  const checks = loadNodeChecks(filename)
  const notes  = loadNodeNotes(filename)

  svg.querySelectorAll('.markmap-node').forEach((nodeEl) => {
    const fo = nodeEl.querySelector('foreignObject')
    if (!fo || !fo.parentElement) return

    // Attach dblclick for inline editing directly on the HTML div — this
    // is the only reliable way since dblclick doesn't always bubble across
    // the HTML→SVG boundary, and closest() can't traverse it either.
    const div = fo.querySelector('div') as HTMLElement | null
    if (div && !div.dataset.hiroEditAttached) {
      div.dataset.hiroEditAttached = '1'
      div.addEventListener('dblclick', (e) => {
        e.preventDefault()
        e.stopPropagation()
        startInlineEdit(nodeEl, e as MouseEvent)
      })
    }

    // Guard: already injected checkboxes for this render of the node
    if (fo.parentElement.querySelector('.hiro-check-fo')) return

    const foX = parseFloat(fo.getAttribute('x') ?? 'NaN')
    const foY = parseFloat(fo.getAttribute('y') ?? '0') || 0
    if (isNaN(foX)) return

    // markmap sets height via CSS style, not SVG attribute — fall back to
    // getBoundingClientRect, then to a sensible default.
    const foHAttr = parseFloat(fo.getAttribute('height') ?? '')
    const foH = !isNaN(foHAttr) ? foHAttr : (fo.getBoundingClientRect().height || 20)

    if (!div) return
    const nodeText = div.textContent?.trim() ?? ''
    if (!nodeText) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (fo.parentElement as any).__data__ as any
    const pathKey = buildNodePathKey(data)

    // Read state: try path key first, fall back to legacy text key for backward compat
    const checkVal = checks[pathKey] ?? checks[nodeText]
    const checkState: 'checked' | 'blocked' | '' =
      checkVal === 'checked' ? 'checked' : checkVal === 'blocked' ? 'blocked' : ''

    // Vertically centered with the text foreignObject
    const cy = foY + foH / 2

    // Layout (left of text):  [NOTE_ICON]  [CHECKBOX]  [node text]
    const cbX   = foX - CB_GAP - CB_SIDE
    const cbY   = cy  - CB_SIDE   / 2
    const noteX = cbX - NOTE_GAP - NOTE_SIDE
    const noteY = cy  - NOTE_SIDE / 2

    // ── Checkbox group ────────────────────────────────────────────────────
    const checkG = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    let checkClass = 'hiro-check-fo'
    if (checkState === 'checked') checkClass += ' hiro-cb-checked'
    else if (checkState === 'blocked') checkClass += ' hiro-cb-blocked'
    checkG.setAttribute('class', checkClass)

    // Invisible hit area (larger than visual for easier clicking)
    const hitPad = 4
    const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    hitArea.setAttribute('x', String(cbX - hitPad))
    hitArea.setAttribute('y', String(cbY - hitPad))
    hitArea.setAttribute('width',  String(CB_SIDE + hitPad * 2))
    hitArea.setAttribute('height', String(CB_SIDE + hitPad * 2))
    hitArea.setAttribute('class', 'hiro-hit-area')
    hitArea.setAttribute('fill', 'none')
    hitArea.setAttribute('stroke', 'none')
    hitArea.setAttribute('pointer-events', 'all')
    hitArea.style.cursor = 'pointer'

    // Visual checkbox square
    const cbRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    cbRect.setAttribute('x', String(cbX))
    cbRect.setAttribute('y', String(cbY))
    cbRect.setAttribute('width',  String(CB_SIDE))
    cbRect.setAttribute('height', String(CB_SIDE))
    cbRect.setAttribute('rx', '2')
    cbRect.setAttribute('pointer-events', 'none')

    // Checkmark ✓ (shown when checked)
    const polyCheck = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
    const px = cbX + 2
    polyCheck.setAttribute('points', `${px},${cy} ${px + 3},${cy + 3} ${px + 8},${cy - 4}`)
    polyCheck.setAttribute('pointer-events', 'none')
    polyCheck.setAttribute('class', 'hiro-check-mark')

    // X mark ✗ (shown when blocked) — drawn as two crossing lines
    const xG = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    xG.setAttribute('class', 'hiro-block-mark')
    xG.setAttribute('pointer-events', 'none')
    const xPad = 2.5
    const x1 = cbX + xPad, y1 = cbY + xPad
    const x2 = cbX + CB_SIDE - xPad, y2 = cbY + CB_SIDE - xPad
    const lineA = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    lineA.setAttribute('x1', String(x1)); lineA.setAttribute('y1', String(y1))
    lineA.setAttribute('x2', String(x2)); lineA.setAttribute('y2', String(y2))
    const lineB = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    lineB.setAttribute('x1', String(x2)); lineB.setAttribute('y1', String(y1))
    lineB.setAttribute('x2', String(x1)); lineB.setAttribute('y2', String(y2))
    xG.appendChild(lineA)
    xG.appendChild(lineB)

    checkG.appendChild(hitArea)
    checkG.appendChild(cbRect)
    checkG.appendChild(polyCheck)
    checkG.appendChild(xG)
    fo.parentElement.appendChild(checkG)

    hitArea.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation() })
    hitArea.addEventListener('click', (e) => {
      e.stopPropagation()
      const file = state.currentFile?.name
      if (!file) return
      // Cycle: unchecked → checked → blocked → unchecked
      const wasChecked = checkG.classList.contains('hiro-cb-checked')
      const wasBlocked = checkG.classList.contains('hiro-cb-blocked')
      checkG.classList.remove('hiro-cb-checked', 'hiro-cb-blocked')
      const current = loadNodeChecks(file)
      // Remove legacy text key if present
      if (current[nodeText] !== undefined && pathKey !== nodeText) delete current[nodeText]
      if (wasChecked) {
        checkG.classList.add('hiro-cb-blocked')
        current[pathKey] = 'blocked'
      } else if (wasBlocked) {
        delete current[pathKey]
      } else {
        checkG.classList.add('hiro-cb-checked')
        current[pathKey] = 'checked'
      }
      saveNodeChecks(file, current)
      applyDimming()
      bus.emit('checks:change')
    })

    // ── Note icon group ───────────────────────────────────────────────────
    const hasNote = !!(notes[pathKey] ?? notes[nodeText])
    const noteG = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    noteG.setAttribute('class', `hiro-note-fo${hasNote ? ' hiro-has-note' : ''}`)

    const noteHitPad = 4
    const noteHitArea = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    noteHitArea.setAttribute('x', String(noteX - noteHitPad))
    noteHitArea.setAttribute('y', String(noteY - noteHitPad))
    noteHitArea.setAttribute('width',  String(NOTE_SIDE + noteHitPad * 2))
    noteHitArea.setAttribute('height', String(NOTE_SIDE + noteHitPad * 2))
    noteHitArea.setAttribute('fill', 'none')
    noteHitArea.setAttribute('stroke', 'none')
    noteHitArea.setAttribute('pointer-events', 'all')
    noteHitArea.style.cursor = 'pointer'

    // Circle background
    const noteCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    noteCircle.setAttribute('cx', String(noteX + NOTE_SIDE / 2))
    noteCircle.setAttribute('cy', String(cy))
    noteCircle.setAttribute('r',  String(NOTE_SIDE / 2))
    noteCircle.setAttribute('pointer-events', 'none')
    noteCircle.setAttribute('class', 'hiro-note-circle')

    // Three horizontal lines inside the circle (note symbol)
    const noteLinesG = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    noteLinesG.setAttribute('pointer-events', 'none')
    noteLinesG.setAttribute('class', 'hiro-note-lines')
    const ncx = noteX + NOTE_SIDE / 2
    for (let i = 0; i < 3; i++) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      const ly = cy - 2 + i * 2
      line.setAttribute('x1', String(ncx - 2.5))
      line.setAttribute('y1', String(ly))
      line.setAttribute('x2', String(ncx + 2.5))
      line.setAttribute('y2', String(ly))
      noteLinesG.appendChild(line)
    }

    noteG.appendChild(noteHitArea)
    noteG.appendChild(noteCircle)
    noteG.appendChild(noteLinesG)
    fo.parentElement.appendChild(noteG)

    noteHitArea.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation() })
    noteHitArea.addEventListener('click', (e) => {
      e.stopPropagation()
      const file = state.currentFile?.name
      if (!file) return
      openNoteOverlay(div, pathKey, nodeText, file, noteG as SVGGElement)
    })
  })

  applyDimming()

  // Auto-select node after an edit or new-node-confirm operation
  if (pendingSelectText) {
    const pending = pendingSelectText
    pendingSelectText = null
    const pendingDiv = findNodeDivByText(pending)
    if (pendingDiv) setSelectedNode(pendingDiv)
  }
}

// Apply dimming by reading state from our own .hiro-check-fo.hiro-cb-checked
// elements (which D3 never touches).  D3 resets .markmap-node class attributes
// on every render, so we cannot rely on hiro-checked/hiro-child-checked classes
// stored there — they are wiped before applyDimming ever runs.
function applyDimming(): void {
  const svg = document.getElementById('mindmap-svg')
  if (!svg) return

  // Build set of node IDs to dim: checked/blocked nodes + all their descendants
  const dimmedIds = new Set<number>()
  svg.querySelectorAll('.hiro-check-fo.hiro-cb-checked, .hiro-check-fo.hiro-cb-blocked').forEach((checkG) => {
    const nodeEl = checkG.closest('.markmap-node')
    if (!nodeEl) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (nodeEl as any).__data__ as any
    if (!data) return
    if (data.state?.id != null) dimmedIds.add(data.state.id as number)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function collect(node: any): void {
      for (const child of node.children ?? []) {
        if (child.state?.id != null) dimmedIds.add(child.state.id as number)
        collect(child)
      }
    }
    collect(data)
  })

  svg.querySelectorAll<SVGElement>('.markmap-node').forEach((nodeEl) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (nodeEl as any).__data__ as any
    const dim  = data?.state?.id != null && dimmedIds.has(data.state.id as number)
    const fo     = nodeEl.querySelector<SVGElement>('foreignObject')
    const circle = nodeEl.querySelector<SVGElement>('circle')
    if (fo)     fo.style.opacity     = dim ? '0.4' : ''
    if (circle) circle.style.opacity = dim ? '0.4' : ''
  })
}
