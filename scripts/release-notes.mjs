#!/usr/bin/env node
// Prints the CHANGELOG section for one version, so the GitHub Release body and
// the changelog can never drift apart. Fails loudly rather than publishing a
// release with empty notes.
import { readFileSync } from 'node:fs'

const version = process.argv[2]
if (!version) {
  console.error('usage: node scripts/release-notes.mjs <version>')
  process.exit(1)
}

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
const lines = changelog.split('\n')

// Matches "## [1.2.3] - 2026-01-01", "## [1.2.3]" or "## 1.2.3".
const heading = new RegExp(`^##\\s+\\[?${version.replace(/\./g, '\\.')}\\]?(\\s|$)`)
const start = lines.findIndex((line) => heading.test(line))
if (start === -1) {
  console.error(`No CHANGELOG section found for ${version}.`)
  console.error('Add a "## [%s] - <date>" heading before tagging.', version)
  process.exit(1)
}

let end = lines.length
for (let index = start + 1; index < lines.length; index += 1) {
  if (/^##\s/.test(lines[index])) {
    end = index
    break
  }
}

const body = lines.slice(start + 1, end).join('\n').trim()
if (!body) {
  console.error(`The CHANGELOG section for ${version} is empty.`)
  process.exit(1)
}
console.log(body)
