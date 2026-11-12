/**
 * Build-time script: generates content-dates.json in the project's generated
 * SEO directory, mapping each CMS content slug to its last git commit date.
 *
 * Usage:
 *   tsx seo/generate-content-dates.ts
 *   tsx seo/generate-content-dates.ts --root ../site
 *
 * Called automatically by `next build` via package.json prebuild script.
 */

import { execSync } from 'child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { loadConfig, parseRoot } from '../shared/config'
import { setToolPaths } from '../shared/tool-paths'

function getLastGitCommitDate(filePath: string): string | null {
  try {
    const date = execSync(`git log -1 --format=%cI -- "${filePath}"`, {
      encoding: 'utf-8',
    }).trim()
    return date || null
  } catch (error) {
    console.warn(
      `Failed to get git commit date for "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const paths = setToolPaths(await loadConfig(parseRoot(args)))

  const files = readdirSync(paths.pagesDir).filter((f) => f.endsWith('.md'))
  const dates: Record<string, string> = {}

  for (const file of files) {
    const slug = basename(file, '.md')
    const filePath = join(paths.pagesDir, file)
    const date = getLastGitCommitDate(filePath)
    if (date) {
      dates[slug] = date
    }
  }

  const outputPath = join(paths.generatedDir, 'content-dates.json')
  mkdirSync(paths.generatedDir, { recursive: true })
  writeFileSync(outputPath, JSON.stringify(dates, null, 2) + '\n')

  console.log(`wrote ${outputPath}`)
  for (const [slug, date] of Object.entries(dates)) {
    console.log(`  ${slug}: ${date}`)
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
