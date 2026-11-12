/**
 * Deterministic SEO pipeline — no model calls.
 *
 * Usage:
 *   tsx seo/index.ts                  # generate output files
 *   tsx seo/index.ts --dry-run        # print what would be written
 *   tsx seo/index.ts --root ../site   # run against another project
 */

import { loadConfig, parseRoot } from '../shared/config'
import { setToolPaths } from '../shared/tool-paths'
import { generateBusinessData } from './map-business'
import { generateFAQData } from './map-faq'
import { generateLlmsTxt } from './map-llms-txt'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  setToolPaths(await loadConfig(parseRoot(args)))

  if (dryRun) {
    console.log('SEO pipeline — dry-run mode\n')
  } else {
    console.log('SEO pipeline — generating output files\n')
  }

  generateBusinessData(dryRun)
  generateLlmsTxt(dryRun)
  generateFAQData(dryRun)

  console.log('\nDone.')
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
