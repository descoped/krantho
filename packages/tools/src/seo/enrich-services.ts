/**
 * Validate and enrich service catalog entries in business.yaml using the configured LLM adapter.
 *
 * Reads service page section bodies and generates concise service descriptions
 * for the hasOfferCatalog in the ProfessionalService JSON-LD entity.
 * Writes the services array to business.yaml.
 *
 * Usage:
 *   tsx seo/enrich-services.ts           # dry-run (preview)
 *   tsx seo/enrich-services.ts --apply    # write to business.yaml
 *   tsx seo/enrich-services.ts --concurrency 3
 *   tsx seo/enrich-services.ts --root ../site
 */

import { structuredComplete } from '@krantho/ai'
import { findSection, splitSections } from '@krantho/core'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parse as parseYAML } from 'yaml'
import { readCMSContent } from '../shared/cms-reader'
import { createLimiter, resolveConcurrency } from '../shared/concurrency'
import { loadConfig, parseRoot } from '../shared/config'
import { createLLM, ENRICH_MAX_TOKENS } from '../shared/llm'
import { cleanMarkdown } from '../shared/markdown-utils'
import { buildSeoPrompt } from '../shared/prompt-builders'
import { loadSiteConfig } from '../shared/site-config'
import { setToolPaths } from '../shared/tool-paths'
import { writeYAMLWithHeader } from '../shared/yaml-utils'
import type { ServiceCatalogEntry } from './types'

const DESCRIPTION_SCHEMA = {
  type: 'object',
  properties: {
    description: { type: 'string' },
  },
  required: ['description'],
}

function buildPrompt(serviceName: string, sectionBody: string, contentCap: number): string {
  return buildSeoPrompt(
    (ctx) => `Write a short, fact-based service description for Schema.org hasOfferCatalog.

Rules:
- One or two terse sentences, as fits a machine-readable catalog entry
- Use only facts present in the content; do not invent anything
- Language: ${ctx.language}
- Suitable for machine-readable Schema.org, not marketing
- No quotation marks

Service name: ${serviceName}

Content:
${sectionBody.slice(0, contentCap)}`,
  )
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const config = await loadConfig(parseRoot(args))
  const paths = setToolPaths(config)
  const concurrency = resolveConcurrency(args, config)

  console.log(
    `Service catalog enrichment ${apply ? '(APPLY mode)' : '(DRY RUN — use --apply to write)'} [concurrency: ${concurrency}]`,
  )
  console.log('')

  const llm = createLLM(config)
  const businessYamlPath = join(paths.seoDir, 'business.yaml')
  const rawYaml = readFileSync(businessYamlPath, 'utf-8')
  const business = parseYAML(rawYaml) as Record<string, unknown>

  const existingServices: ServiceCatalogEntry[] =
    (business['services'] as ServiceCatalogEntry[]) || []
  const existingMap = new Map(existingServices.map((s) => [s.id, s]))

  const { servicesSlug, serviceIds } = loadSiteConfig()
  const { frontmatter, content } = readCMSContent(servicesSlug)

  // Collect tasks
  interface ServiceTask {
    id: string
    name: string
    sectionBody: string
    ingress: string
    existing?: ServiceCatalogEntry | undefined
  }

  const toGenerate: ServiceTask[] = []
  const kept: ServiceCatalogEntry[] = []

  for (const id of serviceIds) {
    const existing = existingMap.get(id)
    const name = String(frontmatter[`${id}-title`] || id)
    const sectionBody = cleanMarkdown(findSection(splitSections(content), id)?.markdown ?? '')
    const ingress = String(frontmatter[`${id}-ingress`] || '')

    if (existing?.description) {
      console.log(
        `  ✓ ${id}: already has description (${existing.description.length} chars), keeping`,
      )
      kept.push({ id, name, description: existing.description })
      continue
    }

    if (!sectionBody || sectionBody.length < 20) {
      console.log(`  - ${id}: insufficient section content, using ingress`)
      kept.push({ id, name, description: ingress })
      continue
    }

    toGenerate.push({ id, name, sectionBody, ingress, existing })
  }

  // Generate missing descriptions in parallel
  const limit = createLimiter(concurrency)
  let completed = 0

  const generated = await Promise.all(
    toGenerate.map((task) =>
      limit(async (): Promise<ServiceCatalogEntry> => {
        try {
          console.log(`  → ${task.id}: generating from section body...`)
          const prompt = buildPrompt(task.name, task.sectionBody, config.tools.enrich.serviceCap)
          const data = await structuredComplete<{ description: string }>(
            llm,
            prompt,
            DESCRIPTION_SCHEMA,
            { maxTokens: ENRICH_MAX_TOKENS },
          )

          completed++
          console.log(
            `  ✓ [${completed}/${toGenerate.length}] ${task.id} (${data.description.length} chars): ${data.description}`,
          )
          return { id: task.id, name: task.name, description: data.description }
        } catch (error) {
          console.error(
            `  ✗ ${task.id}: failed, falling back to ingress — ${error instanceof Error ? error.message : String(error)}`,
          )
          return { id: task.id, name: task.name, description: task.ingress }
        }
      }),
    ),
  )

  // Reassemble in original order
  const updatedServices: ServiceCatalogEntry[] = serviceIds.map((id) => {
    const fromKept = kept.find((s) => s.id === id)
    if (fromKept) return fromKept
    const fromGenerated = generated.find((s) => s.id === id)
    if (fromGenerated) return fromGenerated
    return { id, name: id, description: '' }
  })

  console.log('')

  if (apply) {
    business['services'] = updatedServices

    writeYAMLWithHeader(businessYamlPath, business)

    console.log('Written to business.yaml')
    console.log('Run "just seo-generate" to regenerate structured-data.json')
  } else {
    console.log('Services preview:')
    for (const s of updatedServices) {
      console.log(`  ${s.name}: ${s.description}`)
    }
    console.log('\nDry run complete. Use --apply to write.')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
