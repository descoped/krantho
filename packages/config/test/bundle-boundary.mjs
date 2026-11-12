#!/usr/bin/env node
/**
 * The frontend boundary, checked against a real build.
 *
 * Builds the reference example with a marker value in every secret leaf, then
 * greps everything the browser can fetch — the Next.js client chunks and the
 * Studio SPA bundle — for that marker. A hit means a credential reached a page.
 *
 * Too slow for the unit suite, so it runs on demand:
 *   pnpm --filter @krantho/config run test:bundle
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MARKER = 'krantho-secret-marker-do-not-leak'
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const example = join(repoRoot, 'examples', 'nextjs-shadcn')

const { LEAVES, envNameFor } = await import(join(repoRoot, 'packages/config/dist/index.js'))

const env = { ...process.env }
for (const leaf of LEAVES) {
  if (!leaf.secret) continue
  const name = envNameFor(leaf)
  if (name) env[name] = MARKER
}
// A token secret without token mode is inert; this keeps the build path identical.
env.KRANTHO_AUTH = 'none'

console.log('Building examples/nextjs-shadcn with a marker in every secret leaf…')
execFileSync('pnpm', ['run', 'build'], { cwd: example, env, stdio: 'inherit' })

function filesUnder(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...filesUnder(path))
    else out.push(path)
  }
  return out
}

const targets = [join(example, '.next', 'static'), join(repoRoot, 'packages', 'admin', 'dist')]

const leaked = []
for (const target of targets) {
  for (const file of filesUnder(target)) {
    if (readFileSync(file, 'latin1').includes(MARKER)) leaked.push(file)
  }
}

if (leaked.length > 0) {
  console.error(`A secret reached the browser bundle:\n${leaked.map((f) => `  - ${f}`).join('\n')}`)
  process.exit(1)
}

console.log(`No secret found in ${targets.length} browser-reachable trees. Boundary holds.`)
