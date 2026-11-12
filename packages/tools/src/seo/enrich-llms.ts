/**
 * Validate and enrich llms.txt link descriptions in business.yaml using the configured LLM adapter.
 *
 * Reads page content for each link in llms-sections and generates content-rich
 * descriptions optimized for AI assistants to give accurate answers to users.
 *
 * Usage:
 *   tsx seo/enrich-llms.ts           # dry-run (preview)
 *   tsx seo/enrich-llms.ts --apply    # write to business.yaml
 *   tsx seo/enrich-llms.ts --apply --regenerate  # regenerate all
 *   tsx seo/enrich-llms.ts --concurrency 3       # limit parallel calls
 *   tsx seo/enrich-llms.ts --root ../site        # run against another project
 */

import { structuredComplete } from '@krantho/ai'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parse as parseYAML } from 'yaml'
import { readCMSContent } from '../shared/cms-reader'
import { createLimiter, resolveConcurrency } from '../shared/concurrency'
import { loadConfig, parseRoot } from '../shared/config'
import { createLLM, ENRICH_MAX_TOKENS } from '../shared/llm'
import { getPageContent, simpleFrontmatterFallback } from '../shared/page-content'
import { getSiteContext } from '../shared/prompt-builders'
import { getRouteToSection, getRouteToSlug } from '../shared/route-maps'
import { setToolPaths } from '../shared/tool-paths'
import { writeYAMLWithHeader } from '../shared/yaml-utils'
import type { LlmsSection } from './types'

const DESCRIPTION_SCHEMA = {
  type: 'object',
  properties: {
    description: { type: 'string' },
  },
  required: ['description'],
}

/** Build prompt for a link description */
function buildPrompt(
  title: string,
  path: string,
  pageContent: string,
  metaDescription: string = '',
): string {
  const ctx = getSiteContext()
  return `You are an expert on the llms.txt format for ${ctx.siteDescription} (${ctx.domain}).
Write a content-rich link description for use in the llms.txt format.

The description is read by AI assistants (ChatGPT, Perplexity, Copilot, Grok) who use
it to answer real users asking about ${ctx.siteDescription}. A user might ask:
"Tell me about services offered by ${ctx.domain}" — and the AI assistant should be able to
give a correct, helpful answer based on this description alone.

Rules:
- A short paragraph dense with facts, enough for an AI assistant to answer a user
  without visiting the page
- Include specific details relevant to this page:
  services offered, experience, pricing, contact info, hours, address, qualifications
- Use only facts present in the content; this text is published as the business's own statement
- Language: ${ctx.language}
- No quotation marks

Page: ${title} (${path})
Meta description (for reference — your description should be RICHER than this):
${metaDescription}

Content:
${pageContent}`
}

interface LinkTask {
  sectionIdx: number
  linkIdx: number
  title: string
  path: string
  description?: string
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const regenerate = args.includes('--regenerate')
  const config = await loadConfig(parseRoot(args))
  const paths = setToolPaths(config)
  const concurrency = resolveConcurrency(args, config)

  console.log(
    `llms.txt enrichment ${apply ? '(APPLY mode)' : '(DRY RUN — use --apply to write)'}${regenerate ? ' [REGENERATE ALL]' : ''} [concurrency: ${concurrency}]`,
  )
  console.log('')

  const llm = createLLM(config)
  const businessYamlPath = join(paths.seoDir, 'business.yaml')
  const rawYaml = readFileSync(businessYamlPath, 'utf-8')
  const business = parseYAML(rawYaml) as Record<string, unknown>
  const sections = business['llms-sections'] as LlmsSection[]

  if (!sections || sections.length === 0) {
    console.log('No llms-sections found in business.yaml')
    return
  }

  // Collect tasks to run
  const tasks: LinkTask[] = []

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si]
    if (!section) continue
    for (let li = 0; li < section.links.length; li++) {
      const link = section.links[li]
      if (!link) continue
      if (link.description && link.description.length > 0 && !regenerate) {
        console.log(
          `  ✓ ${link.title}: already has description (${link.description.length} chars), keeping`,
        )
        continue
      }
      tasks.push({ sectionIdx: si, linkIdx: li, title: link.title, path: link.path })
    }
  }

  if (tasks.length === 0) {
    console.log('\nAll links already have descriptions. Use --regenerate to refresh.')
    return
  }

  console.log(`\n  ${tasks.length} descriptions to generate...\n`)

  // Run in parallel with concurrency limit
  const limit = createLimiter(concurrency)
  let completed = 0

  const results = await Promise.all(
    tasks.map((task) =>
      limit(async () => {
        const pageContent = getPageContent(task.path, simpleFrontmatterFallback)
        if (!pageContent || pageContent.length < 20) {
          console.log(`  - ${task.title}: insufficient content for ${task.path}, skipping`)
          return task
        }

        // Get meta-description for quality baseline
        const slug = getRouteToSlug()[task.path]
        let metaDesc = ''
        if (slug) {
          try {
            const { frontmatter: fm } = readCMSContent(slug)
            const sectionSlug = getRouteToSection()[task.path]
            metaDesc = String(
              (sectionSlug ? fm[`meta-description-${sectionSlug}`] : fm['meta-description']) || '',
            )
          } catch {
            /* skip */
          }
        }

        try {
          const prompt = buildPrompt(task.title, task.path, pageContent, metaDesc)
          const data = await structuredComplete<{ description: string }>(
            llm,
            prompt,
            DESCRIPTION_SCHEMA,
            { maxTokens: ENRICH_MAX_TOKENS },
          )

          // Cap the description and end on a complete sentence
          let desc = data.description.slice(0, config.tools.enrich.llmsDescriptionCap).trim()
          const lastDot = desc.lastIndexOf('.')
          if (lastDot > 50) desc = desc.slice(0, lastDot + 1)

          task.description = desc
          completed++
          console.log(
            `  ✓ [${completed}/${tasks.length}] ${task.title} (${desc.length} chars): ${desc.slice(0, 80)}...`,
          )
        } catch (error) {
          console.error(
            `  ✗ ${task.title}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }

        return task
      }),
    ),
  )

  // Apply results
  if (apply) {
    for (const task of results) {
      if (task.description) {
        const targetSection = sections[task.sectionIdx]
        const targetLink = targetSection?.links[task.linkIdx]
        if (targetLink) {
          targetLink.description = task.description
        }
      }
    }

    writeYAMLWithHeader(businessYamlPath, business)

    console.log('\nWritten to business.yaml')
    console.log('llms.txt is an SSR route — changes are live on next request')
  } else {
    console.log('\nDry run complete. Use --apply to write.')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
