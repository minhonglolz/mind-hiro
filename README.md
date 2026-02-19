# Mind Hiro

Generate a **self-contained, interactive mind-map website** from a folder of Markdown files — one HTML file, works offline, no server needed.

Powered by [markmap](https://markmap.js.org/) + [Vite](https://vitejs.dev/).

---

## Features

- **Three-panel UI** — sidebar file list, Markdown editor, live mind-map renderer
- **Live editing** — edit Markdown in the browser; mind map updates in real time
- **Search** — filter files by filename or content
- **Share links** — compress current Markdown into a URL hash and copy to clipboard
- **Dark / light mode** — persisted to `localStorage`
- **Local edits saved** — browser remembers your edits per file across sessions
- **Fully self-contained** — all JS/CSS inlined; no CDN, works offline

---

## CLI

```bash
npx mind-hiro generate <dir> [options]
```

```
Options:
  -o, --output <file>   Output HTML file (default: mind-hiro.html)
  -r, --recursive       Scan subdirectories recursively
  -h, --help            Show help
```

### Examples

```bash
# Generate from a docs folder
npx mind-hiro generate ./docs -o site.html

# Include subdirectories
npx mind-hiro generate ./notes -r -o notes.html
```

Then open `site.html` in any browser — no server needed.

---

## Install globally

```bash
npm install -g mind-hiro
mind-hiro generate ./docs -o site.html
```

---

## Programmatic API

```ts
import { generate } from 'mind-hiro'

const html = generate([
  { name: 'Architecture', content: '# Architecture\n## Frontend\n## Backend' },
  { name: 'Roadmap',      content: '# Roadmap\n## Q1\n## Q2' },
])

import { writeFileSync } from 'fs'
writeFileSync('output.html', html)
```

### `generate(files): string`

| Parameter | Type | Description |
|---|---|---|
| `files` | `MindMapFile[]` | Array of `{ name: string, content: string }` objects |
| returns | `string` | Self-contained HTML string |

```ts
interface MindMapFile {
  name: string     // Shown in the sidebar (filename without extension)
  content: string  // Raw Markdown content
}
```

---

## Development

```bash
git clone https://github.com/your-username/mind-hiro
cd mind-hiro
npm install

npm run dev        # Start Vite dev server
npm run build      # Build app + CLI
```

---

## License

MIT
