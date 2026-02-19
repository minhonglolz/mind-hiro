import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import { bus, state } from '../state'

const transformer = new Transformer()
let mm: Markmap | null = null
let renderTimer: ReturnType<typeof setTimeout> | null = null

export function initMindmap(): void {
  const svg = document.getElementById('mindmap-svg') as unknown as SVGSVGElement
  const placeholder = document.getElementById('mindmap-placeholder')!

  mm = Markmap.create(svg)

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

  // Re-fit on window resize
  window.addEventListener('resize', () => {
    if (mm && state.currentContent.trim()) {
      mm.fit()
    }
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
}
