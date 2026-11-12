import { canReadPublished } from '@krantho/persistence'
import { z } from 'zod'
import { buildLlmsTxt, loadLlmsTxtSnapshot } from '../../handlers/seo-llms-txt.js'
import { getMergedSchema } from '../../merged-schema.js'
import { sha256Hex } from '../pending-action.js'
import { type AssistantTool, defineTool, type ToolOutcome } from './define-tool.js'
import { canWriteDrafts } from './draft-tools.js'
import { type PreparedDraft, prepareDraft, proposeDrafts, writeDraft } from './draft-write.js'
import { declaresString, type FaqEntry, faqFit } from './faq-fit.js'
import { exactDocument, failure, localeOf, pathOf, proposal } from './support.js'

/** Fields that hold an answer-ready summary, in order of preference */
const SUMMARY_FIELDS = ['answer-summary', 'tldr', 'summary'] as const

/** Output the user can use by hand when nothing can be written */
function proposedByHand(
  reason: string,
  title: string,
  items: Array<{ label: string; text: string }>,
): ToolOutcome {
  return {
    result: { ok: true, proposed: true, reason },
    activity: { status: 'proposed', summary: title, documents: [], proposal: { title, items } },
  }
}

const answerSummaryTool = defineTool({
  name: 'answer_summary',
  label: 'Write an answer summary',
  description:
    "Save an answer-ready summary of a document: 40 to 60 words that stand alone, state facts, and answer the page's main question. Write the summary yourself from the document you read.",
  input: z.object({
    collection: z.string().min(1),
    slug: z.string().min(1),
    locale: z.string().min(1).optional(),
    basedOnVersion: z.int().positive(),
    summary: z.string().min(20).max(700),
  }),
  role: 'editor',
  available: canWriteDrafts,
  describe: (input) => `Writing an answer summary for ${pathOf(input)}`,
  async run(input, run) {
    const locale = localeOf(run.ctx, input.locale)
    const path = pathOf(input)
    const current = await exactDocument(run.ctx, input.collection, input.slug, locale)
    if (!current) return failure(`${path} does not exist in locale ${locale}`)
    if (current.meta.version !== input.basedOnVersion) {
      return failure(
        `${path} is at v${current.meta.version}, not v${input.basedOnVersion}; read it again`,
      )
    }

    const collectionDef = run.ctx.contentConfig.collections.get(input.collection)
    const schema = collectionDef ? await getMergedSchema(collectionDef, run.ctx.adapter) : null
    const field = SUMMARY_FIELDS.find((name) => schema && declaresString(schema, name))
    if (!field) {
      return proposedByHand(
        `The ${input.collection} collection has no answer-summary field, so the summary is shown to the user to use by hand. An admin can add an answer-summary field in the schema editor.`,
        `Answer summary for ${path}`,
        [{ label: 'Summary', text: input.summary }],
      )
    }

    const outcome = await writeDraft(run, {
      ref: { collection: input.collection, slug: input.slug, locale },
      current,
      fields: { ...current.fields, [field]: input.summary },
      body: current.body,
    })
    if (outcome.result['ok'] !== true || outcome.result['pending']) return outcome
    return { ...outcome, result: { ...outcome.result, field } }
  },
})

/** Validate every candidate as a new draft; the first failure stops the batch */
async function prepareFaqDrafts(
  run: Parameters<typeof prepareDraft>[0],
  collection: string,
  locale: string,
  candidates: ReadonlyArray<{ slug: string; fields: Record<string, unknown>; body: string }>,
): Promise<{ ok: true; drafts: PreparedDraft[] } | { ok: false; outcome: ToolOutcome }> {
  const drafts: PreparedDraft[] = []
  for (const candidate of candidates) {
    const prepared = await prepareDraft(run, {
      ref: { collection, slug: candidate.slug, locale },
      current: null,
      fields: candidate.fields,
      body: candidate.body,
    })
    if (!prepared.ok) return prepared
    drafts.push(prepared.draft)
  }
  return { ok: true, drafts }
}

function entryItems(entries: readonly FaqEntry[]): Array<{ label: string; text: string }> {
  return entries.map((entry) => ({ label: entry.question, text: entry.answer }))
}

const faqFromDocumentTool = defineTool({
  name: 'faq_from_document',
  label: 'Create FAQ entries',
  description:
    'Turn questions and answers you wrote from a document into FAQ entries, one draft document per entry in the collection the user chose. Ask the user which collection when they have not said. Always proposed to the user.',
  input: z.object({
    sourceCollection: z.string().min(1),
    sourceSlug: z.string().min(1),
    targetCollection: z.string().min(1),
    locale: z.string().min(1).optional(),
    entries: z
      .array(
        z.object({ question: z.string().min(1).max(300), answer: z.string().min(1).max(2000) }),
      )
      .min(1)
      .max(20),
  }),
  role: 'editor',
  available: canWriteDrafts,
  describe: (input) => `Preparing FAQ entries in ${input.targetCollection}`,
  async run(input, run) {
    const locale = localeOf(run.ctx, input.locale)
    const source = { collection: input.sourceCollection, slug: input.sourceSlug }
    if (!(await exactDocument(run.ctx, source.collection, source.slug, locale))) {
      return failure(`${pathOf(source)} does not exist in locale ${locale}`)
    }

    const fit = await faqFit(run.ctx, input.targetCollection, input.entries, locale)
    const title = `FAQ entries from ${pathOf(source)}`
    if (!fit.ok) {
      return proposedByHand(
        `${fit.reason}. The entries are shown to the user.`,
        title,
        entryItems(input.entries),
      )
    }

    const prepared = await prepareFaqDrafts(run, input.targetCollection, locale, fit.candidates)
    if (!prepared.ok) return prepared.outcome
    const count = prepared.drafts.length
    return proposeDrafts(
      run,
      prepared.drafts,
      `Create ${count} FAQ ${count === 1 ? 'entry' : 'entries'} in ${input.targetCollection}`,
      `Proposed ${count} FAQ ${count === 1 ? 'entry' : 'entries'} — needs your confirmation`,
    )
  },
})

const regenerateLlmsTxtTool = defineTool({
  name: 'regenerate_llms_txt',
  label: 'Regenerate llms.txt',
  description:
    "Regenerate the site's llms.txt from its live pages, optionally with a site summary and link descriptions you wrote. Proposed to the user with the current and the new text.",
  input: z.object({
    summary: z.string().min(1).max(500).optional(),
    descriptions: z
      .array(
        z.object({
          collection: z.string().min(1),
          slug: z.string().min(1),
          description: z.string().min(1).max(300),
        }),
      )
      .max(200)
      .optional(),
  }),
  role: 'admin',
  available: (ctx) => ctx.siteSettingsAdapter !== undefined && canReadPublished(ctx.adapter),
  describe: () => 'Regenerating llms.txt',
  async run(input, run) {
    const descriptions = new Map(
      (input.descriptions ?? []).map((d) => [`${d.collection}/${d.slug}`, d.description] as const),
    )
    const text = await buildLlmsTxt(run.ctx, { summary: input.summary, descriptions })
    const snapshot = await loadLlmsTxtSnapshot(run.ctx)
    const served = snapshot ?? (await buildLlmsTxt(run.ctx))
    if (text === served) {
      return {
        result: { ok: true, unchanged: true },
        activity: { status: 'done', summary: 'llms.txt is unchanged', documents: [] },
      }
    }

    return proposal(
      run,
      { kind: 'save_llms_txt', beforeHash: sha256Hex(snapshot ?? ''), text },
      { title: 'Save the new llms.txt', confirmLabel: 'Save llms.txt', destructive: false },
      {
        summary: 'Proposed a new llms.txt — needs your confirmation',
        documents: [],
        proposal: {
          title: 'llms.txt',
          items: [
            { label: 'Current', text: served },
            { label: 'Proposed', text },
          ],
        },
      },
    )
  },
})

/** Answer-engine tools */
export const AEO_TOOLS: readonly AssistantTool[] = [
  answerSummaryTool,
  faqFromDocumentTool,
  regenerateLlmsTxtTool,
]
