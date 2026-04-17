#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'fs'
import { join, extname, basename, resolve, relative } from 'path'
import { generate } from './generator.js'
import type { MindMapFile, MindHiroConfig } from '../shared/types.js'

function printHelp(): void {
  console.log(`
  mind-hiro — Generate an interactive mind map HTML site from Markdown files

  Usage:
    mind-hiro generate <dir> [options]

  Options:
    -o, --output <file>      Output HTML file path (default: mind-hiro.html)
    -r, --recursive          Scan subdirectories recursively
    --ignore <folder,...>    Comma-separated folder names to exclude (e.g. draft,_private)
    -h, --help               Show this help message

  Examples:
    mind-hiro generate ./docs -o site.html
    mind-hiro generate ./notes -r -o notes.html
    mind-hiro generate ./docs -r --ignore draft,_private
`)
}

function collectFiles(dir: string, recursive: boolean, ignore: string[]): MindMapFile[] {
  const root = resolve(dir)
  const files: MindMapFile[] = []
  const ignoreSet = new Set(ignore)

  function scan(currentDir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(currentDir)
    } catch {
      console.error(`Error reading directory: ${currentDir}`)
      process.exit(1)
    }

    // Sort entries for consistent ordering
    entries.sort()

    for (const entry of entries) {
      const fullPath = join(currentDir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        if (recursive && !ignoreSet.has(entry)) scan(fullPath)
      } else if (extname(entry).toLowerCase() === '.md') {
        const content = readFileSync(fullPath, 'utf-8')
        const name = basename(entry, '.md')
        // Record relative subfolder path (empty string for root-level files)
        const relDir = relative(root, currentDir).replace(/\\/g, '/')
        const file: MindMapFile = relDir ? { name, content, folder: relDir } : { name, content }
        files.push(file)
      }
    }
  }

  scan(root)
  return files
}

function run(): void {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp()
    process.exit(0)
  }

  const subcommand = args[0]
  if (subcommand !== 'generate') {
    console.error(`Unknown subcommand: ${subcommand}`)
    printHelp()
    process.exit(1)
  }

  const rest = args.slice(1)

  if (rest.length === 0 || rest[0].startsWith('-')) {
    console.error('Error: <dir> argument is required')
    printHelp()
    process.exit(1)
  }

  const dir = rest[0]
  let output = 'mind-hiro.html'
  let recursive = false
  let ignore: string[] = []

  for (let i = 1; i < rest.length; i++) {
    const flag = rest[i]
    if (flag === '-o' || flag === '--output') {
      const next = rest[++i]
      if (!next) {
        console.error('Error: --output requires a file path argument')
        process.exit(1)
      }
      output = next
    } else if (flag === '-r' || flag === '--recursive') {
      recursive = true
    } else if (flag === '--ignore') {
      const next = rest[++i]
      if (!next) {
        console.error('Error: --ignore requires a comma-separated list of folder names')
        process.exit(1)
      }
      ignore = next.split(',').map((s) => s.trim()).filter(Boolean)
    } else if (flag === '-h' || flag === '--help') {
      printHelp()
      process.exit(0)
    } else {
      console.error(`Unknown option: ${flag}`)
      printHelp()
      process.exit(1)
    }
  }

  const ignoreLabel = ignore.length ? `, ignoring: ${ignore.join(', ')}` : ''
  console.log(`Scanning ${dir}${recursive ? ' (recursive)' : ''}${ignoreLabel}...`)
  const files = collectFiles(dir, recursive, ignore)

  if (files.length === 0) {
    console.warn('Warning: No .md files found in the specified directory')
    process.exit(0)
  }

  console.log(`Found ${files.length} file(s): ${files.map((f) => f.name).join(', ')}`)

  // Load optional config file
  let config: MindHiroConfig = {}
  const configPath = join(resolve(dir), 'mind-hiro.config.json')
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'))
      console.log(`Loaded config from mind-hiro.config.json`)
    } catch {
      console.warn('Warning: Failed to parse mind-hiro.config.json, using defaults')
    }
  }

  const html = generate(files, config)
  writeFileSync(output, html, 'utf-8')
  console.log(`Generated ${output} (${Math.round(html.length / 1024)} KB)`)
}

run()
