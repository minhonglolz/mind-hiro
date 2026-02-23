import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import { bus, state } from '../state'
import { saveNodeChecks, loadNodeChecks } from '../utils/storage'

const transformer = new Transformer()
let mm: Markmap | null = null
let renderTimer: ReturnType<typeof setTimeout> | null = null
let dimmingTimer: ReturnType<typeof setTimeout> | null = null

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
    renderTimer = setTimeout(() => {
      renderContent(content)
      placeholder.style.display = content.trim() ? 'none' : 'flex'
    }, 300)
  })

  bus.on('file:select', () => {
    // content:change will fire after file:select — placeholder managed there
  })

  // Bubble-phase: node text click → scroll editor
  ;(svg as unknown as SVGElement).addEventListener('click', (e: Event) => {
    const target = e.target as Element
    // SVG checkbox rect clicks have stopPropagation — won't reach here
    if (target.closest('.hiro-check-fo')) return

    const nodeEl = target.closest('.markmap-node')
    if (!nodeEl) return

    const fo = nodeEl.querySelector('foreignObject')
    const nodeText = fo
      ? (fo.querySelector('div')?.textContent?.trim() ?? '')
      : (nodeEl.querySelector('text')?.textContent?.trim() ?? '')

    if (nodeText) bus.emit('node:click', nodeText)
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
}

function renderContent(content: string): void {
  if (!mm) return
  if (!content.trim()) {
    mm.setData({ content: '', children: [] })
    return
  }
  const { root } = transformer.transform(content)
  mm.setData(root)
  mm.fit()
  requestAnimationFrame(() => injectCheckboxes())
  // applyDimming() is handled by the MutationObserver after transitions settle
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

    // Guard: already injected for this render of the node
    if (fo.parentElement.querySelector('.hiro-check-fo')) return

    const foX = parseFloat(fo.getAttribute('x') ?? 'NaN')
    const foY = parseFloat(fo.getAttribute('y') ?? '0') || 0
    if (isNaN(foX)) return

    // markmap sets height via CSS style, not SVG attribute — fall back to
    // getBoundingClientRect, then to a sensible default.
    const foHAttr = parseFloat(fo.getAttribute('height') ?? '')
    const foH = !isNaN(foHAttr) ? foHAttr : (fo.getBoundingClientRect().height || 20)

    const div = fo.querySelector('div') as HTMLElement | null
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
    })
  })

  applyDimming()
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
