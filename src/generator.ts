import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import type { MindMapFile } from '../shared/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = join(__dirname, '../../template/index.html')

let _template: string | null = null

function getTemplate(): string {
  if (_template === null) {
    _template = readFileSync(TEMPLATE_PATH, 'utf-8')
  }
  return _template
}

export function generate(files: MindMapFile[]): string {
  const template = getTemplate()
  const json = JSON.stringify(files)
  return template.replace(
    '>[]</script>',
    `>${json}</script>`
  )
}
