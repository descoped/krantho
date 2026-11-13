import type { LLMAdapter } from '@krantho/ai'
import { canGetContent } from '@krantho/persistence'
import { buildSeoFieldMap } from '@krantho/seo-shared'
import { z } from 'zod'
import { resolveAdapter } from '../../handlers/llm-resolve.js'
import { proposeArchetypeProperties } from '../../handlers/seo-enrich-archetype.js'
import { generateMetaDescription, prepareMetaDescription } from '../../handlers/seo-enrich-meta.js'
import { loadGetTypeProperties } from '../../handlers/seo-enrich-runner.js'
import { getMergedSchema } from '../../merged-schema.js'
import { validateDocumentSeo } from '../../seo-validation.js'
import type { ApiContext } from '../../types.js'
import {
  type AssistantTool,
  defineTool,
  type ToolOutcome,
  type ToolRunContext,
} from './define-tool.js'
import { canWriteDrafts } from './draft-tools.js'
import { writeDraft } from './draft-write.js'
import { exactDocument, failure, localeOf, pathOf, proposal, refOf } from './support.js'

/** An LLM adapter whose completions count toward the chat request's token budget */
function counted(llm: LLMAdapter, run: ToolRunContext): LLMAdapter {
  return {
    supportsJsonSchema: llm.supportsJsonSchema,
    async complete(prompt, options) {
      const result = await llm.complete(prompt, options)
      run.spend(result.usage)
      return result
    },
  }
}

const documentInput = z.object({
  collection: z.string().min(1),
  slug: z.string().min(1),
  locale: z.string().min(1).optional(),
})

/** Nothing to do for this document, and why */
function skipped(path: string, reason: string): ToolOutcome {
  return {
    result: { ok: true, skipped: true, reason },
    activity: { status: 'done', summary: `Skipped ${path}: ${reason}`, documents: [] },
  }
}

const seoValidateTool = defineTool({
  name: 'seo_validate',
  label: 'Check SEO',
  description:
    "Check a document's current version for SEO: title and meta description length against the site's limits, whether its structured data conforms to Schema.org, and what each reader (Google, Bing) needs for its features. Explain the findings to the user, grouped by reader.",
  input: documentInput,
  role: 'viewer',
  available: (ctx) => canGetContent(ctx.adapter),
  describe: (input) => `Checking the SEO of ${pathOf(input)}`,
  async run(input, run) {
    const locale = localeOf(run.ctx, input.locale)
    const findings = await validateDocumentSeo(run.ctx, input.collection, input.slug, locale)
    const errors = findings.filter((finding) => finding.severity === 'error').length
    const warnings = findings.filter((finding) => finding.severity === 'warning').length
    return {
      result: { ok: true, findings },
      activity: {
        status: 'done',
        summary: `Checked the SEO of ${pathOf(input)}: ${errors} errors, ${warnings} warnings`,
        documents: [{ collection: input.collection, slug: input.slug, locale }],
        findings,
      },
    }
  },
})

/** The field the collection's schema keeps a document's description in */
async function descriptionField(ctx: ApiContext, collection: string): Promise<string | null> {
  const collectionDef = ctx.contentConfig.collections.get(collection)
  if (!collectionDef) return null
  const schema = await getMergedSchema(collectionDef, ctx.adapter)
  return buildSeoFieldMap(Object.keys(schema.shape)).description
}

const seoFillMetaTool = defineTool({
  name: 'seo_fill_meta_description',
  label: 'Write a meta description',
  description:
    'Generate a meta description for a document that has none and save it as a draft. An existing description is never replaced here; to rewrite one, use update_draft.',
  input: documentInput,
  role: 'admin',
  available: canWriteDrafts,
  describe: (input) => `Writing a meta description for ${pathOf(input)}`,
  async run(input, run) {
    const locale = localeOf(run.ctx, input.locale)
    const path = pathOf(input)
    const current = await exactDocument(run.ctx, input.collection, input.slug, locale)
    if (!current) return failure(`${path} does not exist in locale ${locale}`)

    const source = await prepareMetaDescription(
      input,
      current,
      run.ctx.seoConfigAdapter ?? null,
      false,
    )
    if ('skip' in source) return skipped(path, source.skip)
    const field = await descriptionField(run.ctx, input.collection)
    if (!field) return failure(`The ${input.collection} collection has no description field`)

    const llm = counted(await resolveAdapter(run.ctx), run)
    const description = await generateMetaDescription(
      source.text,
      llm,
      run.ctx.config.site,
      run.ctx.config.seo.enrichment.meta,
    )
    const outcome = await writeDraft(run, {
      ref: { collection: input.collection, slug: input.slug, locale },
      current,
      fields: { ...current.fields, [field]: description },
      body: current.body,
    })
    if (outcome.result.ok !== true || outcome.result.pending) return outcome
    // Generated from the document's text, so it reaches the model framed like that text
    return {
      ...outcome,
      result: { ...outcome.result, field, description: run.frame(path, description) },
    }
  },
})

const seoFillArchetypeTool = defineTool({
  name: 'seo_fill_archetype_properties',
  label: 'Fill Schema.org properties',
  description:
    "Generate values for the Schema.org properties of a document's archetype that are still unset. Always proposed to the user; existing values are never replaced.",
  input: z.object({ collection: z.string().min(1), slug: z.string().min(1) }),
  role: 'admin',
  available: (ctx) => ctx.seoConfigAdapter !== undefined && canGetContent(ctx.adapter),
  describe: (input) => `Generating Schema.org properties for ${pathOf(input)}`,
  async run(input, run) {
    const { ctx } = run
    const path = pathOf(input)
    const current = await exactDocument(ctx, input.collection, input.slug, localeOf(ctx, undefined))
    if (!current || !ctx.seoConfigAdapter) return failure(`${path} does not exist`)
    const getTypeProperties = await loadGetTypeProperties()
    if (!getTypeProperties) return failure('Schema.org properties need the @krantho/seo package')

    const llm = counted(await resolveAdapter(ctx), run)
    const limits = ctx.config.seo.enrichment.archetype
    const generated = await proposeArchetypeProperties(
      input,
      current,
      llm,
      ctx.seoConfigAdapter,
      ctx.config.site,
      limits,
      false,
      getTypeProperties,
    )
    if ('skip' in generated) return skipped(path, generated.skip)
    const entries = Object.entries(generated.add)
    if (entries.length === 0) return skipped(path, 'The model generated no values')

    const { configId, schemaTypes, add, baseVersion, locale } = generated
    return proposal(
      run,
      { kind: 'save_seo_properties', configId, schemaTypes, add, baseVersion, locale },
      {
        title: `Add ${entries.length} Schema.org properties to ${path}`,
        confirmLabel: 'Save properties',
        destructive: false,
      },
      {
        summary: `Proposed Schema.org properties for ${path} — needs your confirmation`,
        documents: [refOf(current)],
        proposal: {
          title: `${schemaTypes.join(', ')} properties`,
          items: entries.map(([label, text]) => ({ label, text })),
        },
      },
    )
  },
})

/** SEO tools */
export const SEO_TOOLS: readonly AssistantTool[] = [
  seoValidateTool,
  seoFillMetaTool,
  seoFillArchetypeTool,
]
