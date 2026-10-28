#!/usr/bin/env node
/**
 * Build output check for the data-modelling demo.
 *
 * Verifies that the production build produced exactly one HTML page with
 * non-empty JavaScript and CSS assets, then prints the gate marker.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const distDir = join(projectRoot, 'dist')

function fail(message) {
  console.error(`VERIFY_FAILED data-modelling: ${message}`)
  process.exit(1)
}

function walk(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(fullPath))
    else files.push(fullPath)
  }
  return files
}

if (!existsSync(distDir)) {
  fail('dist/ does not exist — run the build first')
}

const allFiles = walk(distDir)
const htmlFiles = allFiles.filter((file) => file.toLowerCase().endsWith('.html'))

if (htmlFiles.length !== 1) {
  fail(
    `expected exactly one HTML file in dist/, found ${htmlFiles.length}: ${htmlFiles
      .map((file) => relative(projectRoot, file))
      .join(', ')}`,
  )
}

if (!htmlFiles[0].toLowerCase().endsWith(join('dist', 'index.html').toLowerCase())) {
  fail(`the single HTML file must be dist/index.html, found ${relative(projectRoot, htmlFiles[0])}`)
}

const html = readFileSync(htmlFiles[0], 'utf8')
if (!html.includes('dual-orbit:demo')) {
  fail('dist/index.html is missing the <meta name="dual-orbit:demo"> marker')
}

const scriptFiles = allFiles.filter((file) => file.toLowerCase().endsWith('.js'))
const styleFiles = allFiles.filter((file) => file.toLowerCase().endsWith('.css'))

if (scriptFiles.length === 0) {
  fail('dist/ contains no JavaScript bundle')
}
if (styleFiles.length === 0) {
  fail('dist/ contains no CSS bundle')
}

for (const file of [...scriptFiles, ...styleFiles]) {
  if (statSync(file).size === 0) {
    fail(`asset ${relative(projectRoot, file)} is empty`)
  }
}

console.log(
  `VERIFY_BUILD_OK data-modelling html=${htmlFiles.length} js=${scriptFiles.length} css=${styleFiles.length}`,
)
console.log('VERIFY_OK data-modelling')
