#!/usr/bin/env node
// krantho.com's /changelog page shows one entry per release: a markdown file in
// content/releases/ whose frontmatter `version` is the release's. A release deploys
// only with its entry; a pre-release needs none.
//
//   node krantho-site/scripts/check-release-entry.mjs v0.7.7
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const releases = join(import.meta.dirname, '..', 'content', 'releases')
const tag = process.argv[2] ?? ''
const version = tag.startsWith('v') ? tag.slice(1) : ''

if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`::error::${tag || '(no tag)'} is not a vMAJOR.MINOR.PATCH release tag`)
  process.exit(1)
}
if (version.includes('-')) {
  console.log(`${tag}: a pre-release needs no changelog entry`)
  process.exit(0)
}

const pattern = new RegExp(`^version:\\s*['"]?${version.replaceAll('.', '\\.')}['"]?\\s*$`, 'm')
const entry = readdirSync(releases)
  .filter((name) => name.endsWith('.md'))
  .find((name) => pattern.test(readFileSync(join(releases, name), 'utf-8').split(/^---\s*$/m)[1] ?? ''))

if (!entry) {
  console.error(`::error::no /changelog entry for ${version}: add content/releases/v${version.replaceAll('.', '-')}.md`)
  process.exit(1)
}
console.log(`${tag}: /changelog entry ${entry}`)
