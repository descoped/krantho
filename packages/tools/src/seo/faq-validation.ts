/**
 * FAQ validation — checks existing Q&A answers against current CMS facts.
 *
 * Extracted from enrich-faq.ts for single-responsibility separation.
 */

import type { LLMAdapter } from '@krantho/ai'
import { structuredComplete } from '@krantho/ai'
import { findSection, splitSections } from '@krantho/core'
import { readCMSContent } from '../shared/cms-reader'
import type { createLimiter } from '../shared/concurrency'
import { ENRICH_MAX_TOKENS } from '../shared/llm'
import { cleanMarkdown } from '../shared/markdown-utils'
import type { SiteConfig } from '../shared/site-config'
import type { RouteGroup } from './types'

const VALIDATION_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['OK', 'UPDATE'] },
    updatedAnswer: { type: ['string', 'null'] },
  },
  required: ['status', 'updatedAnswer'],
}

export interface ValidationResult {
  groupIdx: number
  qaIdx: number
  updated?: string | undefined
}

interface ValidationTask {
  groupIdx: number
  qaIdx: number
  question: string
  answer: string
  route: string
}

/** Get current business facts for validation */
function getCurrentFacts(): string {
  const contact = readCMSContent('contact')
  const fees = readCMSContent('fees')
  const fm = contact.frontmatter
  const feesFm = fees.frontmatter

  return [
    `Phone: ${String(fm['phone-number'] || '')}`,
    `Email: ${String(fm['email-address'] || '')}`,
    `Address: ${String(fm['location-title'] || '')}, ${String(fm['location-address'] || '')}`,
    `Opening hours: ${String(fm['hours-line1'] || '')}, ${String(fm['hours-line2'] || '')}`,
    `Response time: from contact page — ${cleanMarkdown(findSection(splitSections(contact.content), 'practical-information')?.markdown ?? '').slice(0, 200)}`,
    `Pricing: ${Object.entries(feesFm)
      .filter(([k]) => k.startsWith('service-'))
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ')}`,
  ].join('\n')
}

function buildValidationPrompt(
  question: string,
  answer: string,
  currentFacts: string,
  config: SiteConfig,
): string {
  const { domain, siteDescription } = config
  return `You are a fact-checker for ${siteDescription} (${domain}).
Flag an answer only when a fact in it is wrong: phone number, email, price, address or opening hours.
A correct answer passes unchanged. A correction changes the wrong fact and leaves wording, style and length as they are.

Current facts:
${currentFacts}

FAQ to check:
Q: ${question}
A: ${answer}

If the answer is correct, set status to "OK" and updatedAnswer to null.
If there are incorrect facts, set status to "UPDATE" and write the corrected answer in updatedAnswer (only the incorrect facts fixed, the rest unchanged).`
}

/** Validate existing Q&A answers against current facts */
export async function runValidation(
  routeGroups: RouteGroup[],
  limit: ReturnType<typeof createLimiter>,
  config: SiteConfig,
  llm: LLMAdapter,
): Promise<{ results: ValidationResult[]; taskCount: number }> {
  console.log('Phase 2: Validating existing Q&A...')
  const currentFacts = getCurrentFacts()
  const skipRoutes = new Set(config.enrichSkipRoutes)

  const tasks: ValidationTask[] = []
  for (let gi = 0; gi < routeGroups.length; gi++) {
    const group = routeGroups[gi]
    if (!group || skipRoutes.has(group.target)) continue
    for (let qi = 0; qi < group.questions.length; qi++) {
      const qa = group.questions[qi]
      if (!qa) continue
      tasks.push({
        groupIdx: gi,
        qaIdx: qi,
        question: qa.question,
        answer: qa.answer,
        route: group.target,
      })
    }
  }

  let completed = 0

  const results = await Promise.all(
    tasks.map((task) =>
      limit(async (): Promise<ValidationResult> => {
        try {
          const prompt = buildValidationPrompt(task.question, task.answer, currentFacts, config)
          const data = await structuredComplete<{ status: string; updatedAnswer: string | null }>(
            llm,
            prompt,
            VALIDATION_SCHEMA,
            { maxTokens: ENRICH_MAX_TOKENS },
          )

          completed++

          if (data.status === 'UPDATE' && data.updatedAnswer) {
            console.log(
              `  ⚠ [${completed}/${tasks.length}] ${task.route}: "${task.question.slice(0, 50)}..."`,
            )
            return { groupIdx: task.groupIdx, qaIdx: task.qaIdx, updated: data.updatedAnswer }
          }

          console.log(
            `  ✓ [${completed}/${tasks.length}] ${task.route}: "${task.question.slice(0, 50)}..."`,
          )
          return { groupIdx: task.groupIdx, qaIdx: task.qaIdx }
        } catch (error) {
          completed++
          console.error(
            `  ✗ ${task.route}: validation failed — ${error instanceof Error ? error.message : String(error)}`,
          )
          return { groupIdx: task.groupIdx, qaIdx: task.qaIdx }
        }
      }),
    ),
  )

  return { results, taskCount: tasks.length }
}
