/**
 * FAQ generation — creates new Q&A pairs for pages below minimum threshold.
 *
 * Extracted from enrich-faq.ts for single-responsibility separation.
 */

import type { LLMAdapter } from '@krantho/ai'
import { structuredComplete } from '@krantho/ai'
import type { createLimiter } from '../shared/concurrency'
import { ENRICH_MAX_TOKENS } from '../shared/llm'
import { createFieldFilter } from '../shared/markdown-utils'
import type { FrontmatterFallback } from '../shared/page-content'
import { getPageContent } from '../shared/page-content'
import type { SiteConfig } from '../shared/site-config'
import type { RouteGroup } from './types'

const GENERATION_SCHEMA = {
  type: 'object',
  properties: {
    pairs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
        },
        required: ['question', 'answer'],
      },
    },
  },
  required: ['pairs'],
}

/** Frontmatter fallback that filters the configured skip fields and includes key names */
function faqFrontmatterFallback(isSkipped: (key: string) => boolean): FrontmatterFallback {
  return (fm) => {
    const values: string[] = []
    for (const [key, value] of Object.entries(fm)) {
      if (isSkipped(key)) continue
      if (typeof value !== 'string') continue
      if (value.startsWith('http') || value.length < 3) continue
      values.push(`${key}: ${value}`)
    }
    return values.join('\n')
  }
}

function buildGenerationPrompt(
  route: string,
  count: number,
  existingQA: { question: string; answer: string }[],
  pageContent: string,
  config: SiteConfig,
): string {
  const existingList = existingQA.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n')

  const { domain, siteDescription, language } = config
  return `You are an SEO expert for ${siteDescription} (${domain}).
Generate ${count} new FAQ questions and answers based on the page content below.

Rules:
- Questions should be what a real user would search for
- Answers use only information found in the page content; do not invent prices,
  methods or details, because the answers are published as the business's own statements
- Answer directly and briefly
- Language: ${language}
- Do not repeat existing questions

Page: ${route}

Existing Q&A (do not repeat these):
${existingList || '(none)'}

Page content:
${pageContent}

Generate exactly ${count} new Q&A pairs.`
}

interface GenerationTask {
  groupIdx: number
  route: string
  needed: number
  existingQA: { question: string; answer: string }[]
  pageContent: string
}

/** Generate new Q&A for pages below minimum */
export async function runGeneration(
  routeGroups: RouteGroup[],
  limit: ReturnType<typeof createLimiter>,
  apply: boolean,
  config: SiteConfig,
  llm: LLMAdapter,
  enrich: { faqMinPerRoute: number; skipFields: readonly string[] },
): Promise<number> {
  const minPerRoute = enrich.faqMinPerRoute
  const fallback = faqFrontmatterFallback(createFieldFilter(enrich.skipFields))
  console.log('Phase 3: Enriching pages below minimum...')
  const skipRoutes = new Set(config.enrichSkipRoutes)

  const tasks: GenerationTask[] = []

  for (let gi = 0; gi < routeGroups.length; gi++) {
    const group = routeGroups[gi]
    if (!group || skipRoutes.has(group.target)) continue

    const ownCount = group.questions.length
    if (ownCount >= minPerRoute) {
      console.log(`  ✓ ${group.target}: ${ownCount} Q&A (meets minimum)`)
      continue
    }

    const needed = minPerRoute - ownCount
    const pageContent = getPageContent(group.target, fallback)

    if (pageContent.length < 20) {
      console.log(`  - ${group.target}: insufficient content, skipping`)
      continue
    }

    console.log(`  → ${group.target}: ${ownCount} Q&A, will generate ${needed} more...`)
    tasks.push({
      groupIdx: gi,
      route: group.target,
      needed,
      existingQA: group.questions,
      pageContent,
    })
  }

  let addedCount = 0

  if (tasks.length > 0) {
    const genResults = await Promise.all(
      tasks.map((task) =>
        limit(async () => {
          try {
            const prompt = buildGenerationPrompt(
              task.route,
              task.needed,
              task.existingQA,
              task.pageContent,
              config,
            )
            const data = await structuredComplete<{
              pairs: { question: string; answer: string }[]
            }>(llm, prompt, GENERATION_SCHEMA, { maxTokens: ENRICH_MAX_TOKENS })

            for (const pair of data.pairs) {
              console.log(`    + ${task.route} Q: ${pair.question}`)
            }

            return { groupIdx: task.groupIdx, pairs: data.pairs }
          } catch (error) {
            console.error(
              `  ✗ ${task.route}: generation failed — ${error instanceof Error ? error.message : String(error)}`,
            )
            return { groupIdx: task.groupIdx, pairs: [] as { question: string; answer: string }[] }
          }
        }),
      ),
    )

    for (const result of genResults) {
      if (apply) {
        const targetGroup = routeGroups[result.groupIdx]
        if (targetGroup) {
          for (const pair of result.pairs) {
            targetGroup.questions.push(pair)
            addedCount++
          }
        }
      } else {
        addedCount += result.pairs.length
      }
    }
  }

  return addedCount
}
