import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import { zoomTransform } from 'd3'
import { bus, state } from '../state'
import { saveNodeChecks, loadNodeChecks } from '../utils/storage'
import { icon as makeIcon } from '../utils/icons'

const transformer = new Transformer()
let mm: Markmap | null = null
let renderTimer: ReturnType<typeof setTimeout> | null = null
let dimmingTimer: ReturnType<typeof setTimeout> | null = null
let currentContent = ''
let foldAllActive = false
let fitOnNextRender = true
let editOverlay: HTMLDivElement | null = null
let selectedDiv: HTMLElement | null = null
let pendingSelectText: string | null = null
let forceImmediateRender = false   // bypass 300ms debounce for new-node insertion

const CB_SIDE = 12 // checkbox square size (px)
const CB_GAP  = 4  // gap between checkbox right edge and text left edge (px)

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
    // SVG checkbox rect clicks have stopPropagation — won't reach here
    if (target.closest('.hiro-check-fo')) return

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

  // Deselect when clicking outside the SVG (but not on the edit overlay)
  document.addEventListener('click', (e: Event) => {
    const target = e.target as Element
    if (editOverlay?.contains(target)) return
    if (!(svg as unknown as SVGElement).contains(target)) setSelectedNode(null)
  })

  // Keyboard shortcuts for selected node (no edit overlay active)
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!selectedDiv || !document.body.contains(selectedDiv) || editOverlay) return
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
    svg.querySelectorAll('.hiro-check-fo.hiro-cb-checked').forEach((el) => {
      el.classList.remove('hiro-cb-checked')
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

// ── Node checkboxes (pure SVG) ─────────────────────────────────────────────
//
// A <g class="hiro-check-fo"> containing a <rect> + <polyline> is appended
// as a SIBLING of markmap's <foreignObject>.  markmap's own DOM is untouched.
//
// pointer-events strategy:
//   • <g>       pointer-events:none  → background clicks pass through to the
//                                      markmap circle underneath (collapse works)
//   • <rect>    pointer-events:auto  → the checkbox square IS clickable
//   • <polyline> pointer-events:none → checkmark is decorative only
//
// This avoids the foreignObject "width:100% = viewport width" bug that was
// blocking all circle clicks.

function injectCheckboxes(): void {
  const filename = state.currentFile?.name
  if (!filename) return

  const svg = document.getElementById('mindmap-svg')!
  const checks = loadNodeChecks(filename)

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

    const checked = !!checks[nodeText]

    // Vertically centered with the text foreignObject
    const cy = foY + foH / 2

    // Position: LEFT of text for all nodes
    //   right-side (foX ≥ 0): between circle and text (slight overlap is fine
    //                          because g has pointer-events:none)
    //   left-side  (foX < 0): at the branch tip, further left than the text
    const rectX = foX - CB_GAP - CB_SIDE
    const rectY = cy - CB_SIDE / 2

    // ── Outer group ──────────────────────────────────────────────────────
    // Do NOT set pointer-events:none on <g> — in some browsers that prevents
    // children from receiving events too. SVG <g> elements have no geometry
    // of their own, so they don't block clicks on siblings (e.g. the circle).
    const checkG = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    checkG.setAttribute('class', `hiro-check-fo${checked ? ' hiro-cb-checked' : ''}`)

    // ── Invisible hit area (larger than visual for easier clicking) ───────
    // pointer-events="all" makes the full rect area respond to clicks even
    // though fill is none (SVG default only hit-tests painted/visible areas).
    const hitPad = 4
    const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    hitArea.setAttribute('x', String(rectX - hitPad))
    hitArea.setAttribute('y', String(rectY - hitPad))
    hitArea.setAttribute('width',  String(CB_SIDE + hitPad * 2))
    hitArea.setAttribute('height', String(CB_SIDE + hitPad * 2))
    hitArea.setAttribute('class', 'hiro-hit-area')
    hitArea.setAttribute('fill', 'none')
    hitArea.setAttribute('stroke', 'none')
    hitArea.setAttribute('pointer-events', 'all')
    hitArea.style.cursor = 'pointer'

    // ── Visual checkbox square ────────────────────────────────────────────
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('x', String(rectX))
    rect.setAttribute('y', String(rectY))
    rect.setAttribute('width',  String(CB_SIDE))
    rect.setAttribute('height', String(CB_SIDE))
    rect.setAttribute('rx', '2')
    rect.setAttribute('pointer-events', 'none') // visual only; hitArea handles clicks

    // ── Checkmark polyline ───────────────────────────────────────────────
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
    const px = rectX + 2
    poly.setAttribute(
      'points',
      `${px},${cy} ${px + 3},${cy + 3} ${px + 8},${cy - 4}`,
    )
    poly.setAttribute('pointer-events', 'none')

    checkG.appendChild(hitArea)
    checkG.appendChild(rect)
    checkG.appendChild(poly)
    fo.parentElement.appendChild(checkG)

    hitArea.addEventListener('click', (e) => {
      e.stopPropagation()
      const file = state.currentFile?.name
      if (!file) return
      const isChecked = checkG.classList.toggle('hiro-cb-checked')
      const current = loadNodeChecks(file)
      current[nodeText] = isChecked
      saveNodeChecks(file, current)
      applyDimming()
      bus.emit('checks:change')
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

  // Build set of node IDs to dim: checked nodes + all their descendants
  const dimmedIds = new Set<number>()
  svg.querySelectorAll('.hiro-check-fo.hiro-cb-checked').forEach((checkG) => {
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
