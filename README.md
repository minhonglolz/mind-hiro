# Mind Hiro

Generate a **self-contained, interactive mind-map site** from a folder of Markdown files — single HTML file, works offline, no server needed.

Powered by [markmap](https://markmap.js.org/) + [Vite](https://vitejs.dev/).

---

## Features

- **Three-panel UI** — file sidebar, Markdown editor, live mind-map renderer
- **Command palette** — `⌘K` to search files and run actions (toggle theme, share, …)
- **Live editing** — edit Markdown in the browser; mind map updates in real time
- **Full-text search** — filter files by filename or content
- **Share links** — compress the current file into a URL hash and copy to clipboard
- **Dark / light mode** — toggled via toolbar or command palette, persisted to `localStorage`
- **Local edits saved** — browser remembers edits per file across sessions
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
  name: string     // Shown in the sidebar
  content: string  // Raw Markdown content
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
