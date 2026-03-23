# Mind <font color="#ed6424">Hiro</font>

Generate a **self-contained, interactive mind-map site** from a folder of Markdown files — single HTML file, works offline, no server needed.

Powered by [markmap](https://markmap.js.org/) + [Vite](https://vitejs.dev/).

---

## Features

- **Three-panel UI** — resizable file sidebar, Markdown editor, live mind-map renderer
- **Command palette** — `⌘K` to search files and run actions (toggle theme, share, …)
- **Live editing** — edit Markdown in the browser; mind map updates in real time
- **Full-text search** — filter files by filename or content
- **File management** — upload `.md` files, create new files, rename (double-click), delete
- **Folder grouping** — use `-r` with the CLI to auto-group files by subdirectory; collapse/expand per folder, state persisted
- **Pin files** — pin any file to keep it at the top of the sidebar; state persisted across sessions
- **Node checkboxes** — tick any node to mark it done (green ✓); tick again to mark as blocked (red ✗); third click resets
- **Block state** — blocked nodes are excluded from the completion percentage; blocked nodes and their subtrees dim automatically
- **Node notes** — add a freeform note to any node via the circle icon; icon turns gold when a note is present
- **Progress tracking** — completion percentage displayed next to each file in the sidebar
- **Progress export / import** — save check/block/note state to JSON (current file or all files); import auto-detects format
- **Zoom** — scroll-wheel zoom and drag-to-pan on the mind map
- **Fold / unfold** — collapse or expand all mind-map nodes with one click
- **Share links** — compress the current file into a URL and copy to clipboard
- **Dark / light mode** — toggled via toolbar or `⌘T`, persisted to `localStorage`
- **Local edits saved** — browser remembers edits per file across sessions
- **Editor stats** — live line, word, and character count in the status bar
- **Fully self-contained** — all JS/CSS inlined; no CDN, works offline

---

## Quick start

```bash
npx mind-hiro generate ./docs -o site.html
```

Open `site.html` in any browser — no server needed.

---

## CLI

```
mind-hiro generate <dir> [options]

Options:
  -o, --output <file>   Output HTML file  (default: mind-hiro.html)
  -r, --recursive       Scan subdirectories recursively
  -h, --help            Show help
```

```bash
# Generate from a docs folder
npx mind-hiro generate ./docs -o site.html

# Include subdirectories
npx mind-hiro generate ./notes -r -o notes.html
```

### Install globally

```bash
npm install -g mind-hiro
mind-hiro generate ./docs -o site.html
```

---

## Programmatic API

```ts
import { generate } from 'mind-hiro'
import { writeFileSync } from 'fs'

const html = generate([
  { name: 'Architecture', content: '# Architecture\n## Frontend\n## Backend' },
  { name: 'Roadmap',      content: '# Roadmap\n## Q1\n## Q2' },
])

writeFileSync('output.html', html)
```

### `generate(files): string`

| Parameter | Type            | Description                                    |
|-----------|-----------------|------------------------------------------------|
| `files`   | `MindMapFile[]` | Array of `{ name: string, content: string }` objects |
| returns   | `string`        | Self-contained HTML string                     |

```ts
interface MindMapFile {
  name: string      // Shown in the sidebar
  content: string   // Raw Markdown content
  folder?: string   // Relative subfolder path, e.g. 'sprint1' or 'sprint1/backend'
}
```

---

## Development

```bash
git clone https://github.com/minhonglolz/mind-hiro
cd mind-hiro
npm install

npm run dev          # Vite dev server (hot reload)
npm run build        # Build app template + CLI
npm run type-check   # TypeScript check without emitting
```

### Project structure

```
app/          Vite app — the embedded viewer UI (TS + Tailwind)
src/          CLI + programmatic API (Node.js)
shared/       Types shared between app and src
index.html    Dev entry point
```

`npm run build:app` bundles `app/` into `template/index.html` (the inlined shell).
`npm run build:lib` compiles `src/` into `dist-lib/` (the CLI + API).

---

## License

MIT
