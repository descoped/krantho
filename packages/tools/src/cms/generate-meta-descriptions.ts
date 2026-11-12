/**
 * Generate meta descriptions for CMS content pages using the configured LLM adapter.
 *
 * Reads each markdown page using the shared CMS reader (gray-matter), extracts
 * body text (or frontmatter as fallback), and calls the configured LLM adapter to
 * generate a meta description within the configured length range.
 *
 * Usage:
 *   tsx cms/generate-meta-descriptions.ts           # dry-run (preview)
 *   tsx cms/generate-meta-descriptions.ts --apply    # write to files
 *   tsx cms/generate-meta-descriptions.ts --force    # overwrite existing
 *   tsx cms/generate-meta-descriptions.ts --apply --force
 *   tsx cms/generate-meta-descriptions.ts --concurrency 3
 *   tsx cms/generate-meta-descriptions.ts --root ../site
 */

import type { LLMAdapter } from '@krantho/ai'
import { structuredComplete } from '@krantho/ai'
import type { KranthoConfig } from '@krantho/config'
import { splitSections } from '@krantho/core'
import { listCMSSlugs, readCMSContent, updateFrontmatterField } from '../shared/cms-reader'
import { createLimiter, resolveConcurrency } from '../shared/concurrency'
import { loadConfig, parseRoot } from '../shared/config'
import { createLLM, ENRICH_MAX_TOKENS } from '../shared/llm'
import { cleanMarkdown, createFieldFilter } from '../shared/markdown-utils'
import { buildSeoPrompt } from '../shared/prompt-builders'
import { getSlugCompositions } from '../shared/route-maps'
import { setToolPaths } from '../shared/tool-paths'

const DESCRIPTION_SCHEMA = {
  type: 'object',
  properties: {
    description: { type: 'string' },
  },
  required: ['description'],
}

function buildPrompt(text: string, meta: KranthoConfig['seo']['enrichment']['meta']): string {
  return buildSeoPrompt(
    () => `Write a meta description based on the text below.

Requirements:
- Between ${meta.minChars} and ${meta.maxChars} characters (including spaces)
- Natural language, no keyword-stuffing
- No quotation marks around the text
- Only the description itself, nothing else — no character count, no comments
- The text should be relevant for the searching user, not contain internal site information
- Focus on what the user can expect from the service

Text:
${text.slice(0, meta.contentCap)}`,
  )
}

/** Extract user-facing text from frontmatter values */
function extractFrontmatterText(
  data: Record<string, unknown>,
  isSkipped: (key: string) => boolean,
): string {
  const values: string[] = []
  for (const [key, value] of Object.entries(data)) {
    if (isSkipped(key)) continue
    if (typeof value !== 'string') continue
    if (value.startsWith('http')) continue
    if (value.length < 3) continue
    values.push(value)
  }
  return values.join('. ')
}

interface PageTask {
  slug: string
  fieldKey: string
  inputText: string
  source: string
  sectionSlug?: string
}

/** Collect page-level meta description tasks. */
function collectPageTasks(
  slugs: string[],
  compositionSources: Set<string>,
  slugCompositions: Record<string, string[]>,
  force: boolean,
  isSkipped: (key: string) => boolean,
): PageTask[] {
  const tasks: PageTask[] = []

  for (const slug of slugs) {
    if (compositionSources.has(slug)) {
      console.log(`  - ${slug}: composition source, skipping`)
      continue
    }

    const { frontmatter, content } = readCMSContent(slug)

    if (frontmatter['meta-description'] && !force) {
      console.log(
        `  ✓ ${slug}: already has meta-description (${String(frontmatter['meta-description']).length} chars), skipping`,
      )
      continue
    }

    let bodyText = cleanMarkdown(content)
    const compositionSlugs = slugCompositions[slug]
    if (compositionSlugs) {
      for (const compSlug of compositionSlugs) {
        try {
          const comp = readCMSContent(compSlug)
          const compText = cleanMarkdown(comp.content)
          bodyText =
            compText.length >= 20
              ? bodyText
                ? `${bodyText} ${compText}`
                : compText
              : bodyText
                ? `${bodyText} ${extractFrontmatterText(comp.frontmatter, isSkipped)}`
                : extractFrontmatterText(comp.frontmatter, isSkipped)
        } catch {
          /* skip */
        }
      }
    }

    const inputText =
      bodyText.length >= 20 ? bodyText : extractFrontmatterText(frontmatter, isSkipped)
    if (!inputText || inputText.length < 20) {
      console.log(`  - ${slug}: insufficient content, skipping`)
      continue
    }

    const source = compositionSlugs ? 'composition' : bodyText.length >= 20 ? 'body' : 'frontmatter'
    tasks.push({ slug, fieldKey: 'meta-description', inputText, source })
  }

  return tasks
}

/** Collect section-level meta description tasks. */
function collectSectionTasks(
  slugs: string[],
  compositionSources: Set<string>,
  force: boolean,
): PageTask[] {
  const tasks: PageTask[] = []

  for (const slug of slugs) {
    if (compositionSources.has(slug)) continue

    const { frontmatter, content } = readCMSContent(slug)
    const { sections } = splitSections(content)

    for (const section of sections) {
      const fieldKey = `meta-description-${section.heading}`
      if (frontmatter[fieldKey] && !force) {
        console.log(
          `  ✓ ${slug}#${section.heading}: already has ${fieldKey} (${String(frontmatter[fieldKey]).length} chars), skipping`,
        )
        continue
      }

      const sectionText = cleanMarkdown(section.markdown)
      if (!sectionText || sectionText.length < 20) {
        console.log(`  - ${slug}#${section.heading}: insufficient section content, skipping`)
        continue
      }

      tasks.push({
        slug,
        fieldKey,
        inputText: sectionText,
        source: 'section',
        sectionSlug: section.heading,
      })
    }
  }

  return tasks
}

/** Generate descriptions via LLM and optionally write to files. */
async function processResults(
  allTasks: PageTask[],
  llm: LLMAdapter,
  config: KranthoConfig,
  concurrency: number,
  apply: boolean,
): Promise<void> {
  const meta = config.seo.enrichment.meta
  const limit = createLimiter(concurrency)
  let completed = 0

  const results = await Promise.all(
    allTasks.map((task) =>
      limit(async (): Promise<{ task: PageTask; description: string | null }> => {
        const label = task.sectionSlug ? `${task.slug}#${task.sectionSlug}` : task.slug

        try {
          const prompt = buildPrompt(task.inputText, meta)
          const data = await structuredComplete<{ description: string }>(
            llm,
            prompt,
            DESCRIPTION_SCHEMA,
            { maxTokens: ENRICH_MAX_TOKENS },
          )

          const description = data.description.trim()

          if (description.length < meta.minChars || description.length > meta.maxChars) {
            console.warn(
              `  ⚠ [${++completed}/${allTasks.length}] ${label} (${description.length} chars — target ${meta.minChars}-${meta.maxChars}): ${description}`,
            )
          } else {
            console.log(
              `  ✓ [${++completed}/${allTasks.length}] ${label} (${description.length} chars): ${description}`,
            )
          }

          return { task, description }
        } catch (error) {
          completed++
          console.error(`  ✗ ${label}: ${error instanceof Error ? error.message : String(error)}`)
          return { task, description: null }
        }
      }),
    ),
  )

  if (apply) {
    for (const { task, description } of results) {
      if (description) {
        updateFrontmatterField(task.slug, task.fieldKey, description)
        const label = task.sectionSlug ? `${task.slug}#${task.sectionSlug}` : task.slug
        console.log(`    written ${task.fieldKey} to ${label}`)
      }
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const force = args.includes('--force')
  const config = await loadConfig(parseRoot(args))
  setToolPaths(config)
  const concurrency = resolveConcurrency(args, config)

  console.log(
    `Meta description generator ${apply ? '(APPLY mode)' : '(DRY RUN — use --apply to write)'} [concurrency: ${concurrency}]`,
  )
  console.log('')

  const llm = createLLM(config)
  const slugs = listCMSSlugs()
  const slugCompositions = getSlugCompositions()
  const compositionSources = new Set(Object.values(slugCompositions).flat())

  const isSkipped = createFieldFilter(config.tools.enrich.skipFields)
  const pageTasks = collectPageTasks(slugs, compositionSources, slugCompositions, force, isSkipped)
  const sectionTasks = collectSectionTasks(slugs, compositionSources, force)
  const allTasks = [...pageTasks, ...sectionTasks]

  if (allTasks.length === 0) {
    console.log('\nAll meta descriptions already exist. Use --force to overwrite.')
    return
  }

  console.log(
    `\n  ${pageTasks.length} page + ${sectionTasks.length} section descriptions to generate...\n`,
  )

  await processResults(allTasks, llm, config, concurrency, apply)

  console.log('')
  if (!apply) {
    console.log('Dry run complete. Use --apply to write meta descriptions to files.')
  } else {
    console.log('Done. Meta descriptions written to content files.')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
