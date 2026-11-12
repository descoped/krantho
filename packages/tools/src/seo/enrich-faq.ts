/**
 * Validate and enrich FAQ Q&A pairs using the configured LLM adapter.
 *
 * Phase 1: Backup guardrails.yaml
 * Phase 2: Validate existing Q&A answers against current CMS content (concurrent)
 * Phase 3: Generate new Q&A for pages below the configured minimum (concurrent)
 * Phase 4: Report summary
 *
 * Usage:
 *   tsx seo/enrich-faq.ts              # dry-run (validate + preview)
 *   tsx seo/enrich-faq.ts --apply      # write changes to guardrails.yaml
 *   tsx seo/enrich-faq.ts --concurrency 3
 *   tsx seo/enrich-faq.ts --root ../site
 */

import { copyFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { parse as parseYAML } from 'yaml'
import { createLimiter, resolveConcurrency } from '../shared/concurrency'
import { loadConfig, parseRoot } from '../shared/config'
import { createLLM } from '../shared/llm'
import { loadSiteConfig } from '../shared/site-config'
import { setToolPaths } from '../shared/tool-paths'
import { writeYAMLWithHeader } from '../shared/yaml-utils'
import { runGeneration } from './faq-generation'
import { runValidation } from './faq-validation'
import type { RouteGroup } from './types'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const kranthoConfig = await loadConfig(parseRoot(args))
  const paths = setToolPaths(kranthoConfig)
  const concurrency = resolveConcurrency(args, kranthoConfig)
  const guardrailsPath = join(paths.seoDir, 'guardrails.yaml')
  const backupPath = join(paths.seoDir, 'guardrails.yaml.bak')

  console.log(
    `FAQ enrichment ${apply ? '(APPLY mode)' : '(DRY RUN — use --apply to write)'} [concurrency: ${concurrency}]`,
  )
  console.log('')

  // Phase 1: Backup
  if (apply) {
    copyFileSync(guardrailsPath, backupPath)
    console.log(`Phase 1: Backed up guardrails.yaml → guardrails.yaml.bak`)
  } else {
    console.log(`Phase 1: Backup (skipped in dry-run)`)
  }
  console.log('')

  const config = loadSiteConfig()
  const llm = createLLM(kranthoConfig)
  const raw = readFileSync(guardrailsPath, 'utf-8')
  const routeGroups: RouteGroup[] = parseYAML(raw) as RouteGroup[]
  const limit = createLimiter(concurrency)

  // Phase 2: Validate
  const { results: validationResults, taskCount } = await runValidation(
    routeGroups,
    limit,
    config,
    llm,
  )

  let updatedCount = 0
  for (const result of validationResults) {
    if (result.updated) {
      if (apply) {
        const targetGroup = routeGroups[result.groupIdx]
        const targetQa = targetGroup?.questions[result.qaIdx]
        if (targetQa) {
          targetQa.answer = result.updated
        }
      }
      updatedCount++
    }
  }

  console.log(
    `\nPhase 2 complete: ${updatedCount} answers ${apply ? 'updated' : 'would be updated'}`,
  )
  console.log('')

  // Phase 3: Generate
  const addedCount = await runGeneration(
    routeGroups,
    limit,
    apply,
    config,
    llm,
    kranthoConfig.tools.enrich,
  )

  console.log(`\nPhase 3 complete: ${addedCount} Q&A ${apply ? 'added' : 'would be added'}`)
  console.log('')

  // Write updated guardrails
  if (apply) {
    const header = `# Route-grouped Q&A pairs for FAQPage JSON-LD
# Primary key: target route. Questions grouped under their route.
# inherit: true means child routes include this route's Q&A entries

`
    writeYAMLWithHeader(guardrailsPath, routeGroups, header)
    console.log('Written to guardrails.yaml')
  }

  // Phase 4: Report
  console.log('')
  console.log('=== Summary ===')
  console.log(`Validated: ${taskCount} existing Q&A`)
  console.log(`Updated answers: ${updatedCount}`)
  console.log(`New Q&A added: ${addedCount}`)

  if (!apply) {
    console.log('\nDry run complete. Use --apply to write changes.')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
