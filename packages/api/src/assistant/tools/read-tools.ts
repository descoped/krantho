import { type ContentDocument, canGetContent, canQuery } from '@krantho/persistence'
import { buildSeoFieldMap, resolveSeoField } from '@krantho/seo-shared'
import { z } from 'zod'
import { getContent } from '../../handlers/get-content.js'
import { getSchema } from '../../handlers/get-schema.js'
import { listCollections } from '../../handlers/list-collections.js'
import { applyListLimit, parseLocaleParam, validateCollectionParam } from '../../validators.js'
import { callHandler, isSuccess, responseError } from '../call-handler.js'
import { listSections } from '../document-change.js'
import { truncate } from '../untrusted.js'
import { type AssistantTool, defineTool, type ToolRunContext } from './define-tool.js'
import { failure, localeOf, pathOf, refOf } from './support.js'

const always = (): boolean => true

/** One line per document in list and search results — titles are document text */
interface DocumentSummary {
  collection: string
  slug: string
  locale: string
  version: number
  status: string
  title: string
  snippet?: string | undefined
}

function summarize(doc: Pick<ContentDocument, 'meta' | 'fields'>): DocumentSummary {
  const { collection, slug, locale, version, status } = doc.meta
  const title = resolveSeoField(buildSeoFieldMap(Object.keys(doc.fields)), 'title', doc.fields)
  return { collection, slug, locale, version, status, title }
}

type JsonSchemaObject = {
  properties?: Record<string, Record<string, unknown>>
  required?: string[]
}

/** The JSON Schema of a collection's fields (code and runtime), or the handler's error */
async function collectionSchema(
  run: ToolRunContext,
  collection: string,
): Promise<{ ok: true; schema: JsonSchemaObject } | { ok: false; error: string }> {
  const response = await callHandler(getSchema, run.ctx, { params: { collection } })
  if (!isSuccess(response)) return { ok: false, error: responseError(response) }
  return { ok: true, schema: (response.body as { schema: JsonSchemaObject }).schema }
}

const listCollectionsTool = defineTool({
  name: 'list_collections',
  label: 'List collections',
  description: 'List the content collections of the site and the field names of each.',
  input: z.object({}),
  role: 'viewer',
  available: always,
  describe: () => 'Listing collections',
  async run(_input, run) {
    const response = await callHandler(listCollections, run.ctx, {})
    const names = (response.body as { collections: Array<{ name: string }> }).collections
    const collections: Array<{ name: string; fields: string[] }> = []
    for (const { name } of names) {
      const schema = await collectionSchema(run, name)
      collections.push({
        name,
        fields: schema.ok ? Object.keys(schema.schema.properties ?? {}) : [],
      })
    }
    return {
      result: { ok: true, collections },
      activity: { status: 'done', summary: 'Listed collections', documents: [] },
    }
  },
})

/** A JSON Schema property compacted to what the model needs to write a valid value */
function compactProperty(
  name: string,
  prop: Record<string, unknown>,
  required: ReadonlySet<string>,
): Record<string, unknown> {
  const compact: Record<string, unknown> = {
    name,
    type: prop.type ?? 'any',
    required: required.has(name),
  }
  for (const key of ['enum', 'maxLength', 'description'] as const) {
    if (prop[key] !== undefined) compact[key] = prop[key]
  }
  if (prop._runtime === true) compact.runtime = true
  return compact
}

const getSchemaTool = defineTool({
  name: 'get_schema',
  label: 'Read a schema',
  description:
    "Get a collection's fields with their types, whether each is required, allowed values and length limits.",
  input: z.object({ collection: z.string().min(1) }),
  role: 'viewer',
  available: always,
  describe: (input) => `Reading the ${input.collection} schema`,
  async run(input, run) {
    const schema = await collectionSchema(run, input.collection)
    if (!schema.ok) return failure(schema.error)
    const required = new Set(schema.schema.required ?? [])
    const fields = Object.entries(schema.schema.properties ?? {}).map(([name, prop]) =>
      compactProperty(name, prop, required),
    )
    return {
      result: { ok: true, collection: input.collection, fields },
      activity: { status: 'done', summary: `Read the ${input.collection} schema`, documents: [] },
    }
  },
})

const listDocumentsTool = defineTool({
  name: 'list_documents',
  label: 'List documents',
  description:
    'List the documents of one collection (current versions, drafts included), ordered by slug and then locale.',
  input: z.object({
    collection: z.string().min(1),
    status: z.enum(['draft', 'published']).optional(),
    limit: z.int().min(1).max(50).optional(),
    offset: z.int().min(0).optional(),
    locale: z.string().min(1).optional(),
  }),
  role: 'viewer',
  available: (ctx) => canQuery(ctx.adapter),
  describe: (input) => `Listing ${input.collection}`,
  async run(input, run) {
    const { adapter, config } = run.ctx
    const validated = validateCollectionParam(input.collection, run.ctx)
    if (!validated.isValid) return failure(responseError(validated.response))
    if (!canQuery(adapter)) return failure('Adapter does not support query')
    const page = await adapter.query({
      state: 'current',
      collections: [validated.collection],
      projection: 'summary',
      status: input.status,
      locale: parseLocaleParam(input.locale),
      limit: applyListLimit(input.limit ?? 20, config.content.list.maxLimit),
      offset: input.offset,
    })
    const items = page.items.map(summarize)
    return {
      result: {
        ok: true,
        hasMore: page.hasMore,
        items: run.frame(`${input.collection} list`, JSON.stringify(items)),
      },
      activity: { status: 'done', summary: `Listed ${input.collection}`, documents: [] },
    }
  },
})

const searchDocumentsTool = defineTool({
  name: 'search_documents',
  label: 'Search documents',
  description: 'Search every collection for documents whose slug, fields or body contain the text.',
  input: z.object({
    query: z.string().min(1),
    limit: z.int().min(1).max(20).optional(),
    locale: z.string().min(1).optional(),
  }),
  role: 'viewer',
  available: (ctx) => canQuery(ctx.adapter),
  describe: (input) => `Searching for "${truncate(input.query, 40)}"`,
  async run(input, run) {
    const { adapter, config, contentConfig } = run.ctx
    if (!canQuery(adapter)) return failure('Adapter does not support query')
    const text = input.query.trim()
    const { minQueryLength } = config.content.search
    if (text.length < minQueryLength) {
      return failure(`Search query must be at least ${minQueryLength} characters`)
    }
    const page = await adapter.query({
      state: 'current',
      collections: [...contentConfig.collections.keys()],
      projection: 'summary',
      match: { text, in: ['slug', 'fields', 'body'] },
      locale: parseLocaleParam(input.locale),
      limit: input.limit ?? 10,
    })
    const items = page.items.map((hit) => ({ ...summarize(hit), snippet: hit.snippet ?? '' }))
    return {
      result: {
        ok: true,
        hasMore: page.hasMore,
        items: run.frame('search results', JSON.stringify(items)),
      },
      activity: {
        status: 'done',
        summary: `Searched for "${truncate(input.query, 40)}"`,
        documents: [],
      },
    }
  },
})

/** Room left for a frame's tags and the JSON escaping around them */
const FRAME_OVERHEAD = 200

/**
 * A document as the model reads it: every document string framed, no
 * `changedBy`, and the body cut to what fits in one tool result.
 */
export function documentView(
  run: ToolRunContext,
  doc: ContentDocument,
): { result: Record<string, unknown>; bodyTruncated: boolean } {
  const { collection, slug, version, status } = doc.meta
  const source = `${pathOf(doc.meta)} v${version}`
  const result: Record<string, unknown> = {
    ok: true,
    ref: refOf(doc),
    version,
    status,
    fields: run.frame(`${source} fields`, JSON.stringify(doc.fields)),
    sections: run.frame(`${source} section headings`, JSON.stringify(listSections(doc.body))),
    bodyChars: doc.body.length,
  }
  const used = JSON.stringify(result).length + FRAME_OVERHEAD
  const budget = Math.max(0, run.ctx.config.assistant.limits.toolResultChars - used)
  const body = truncate(doc.body, budget)
  const bodyTruncated = body.length < doc.body.length
  result.body = run.frame(`${collection}/${slug} v${version} body`, body)
  result.bodyTruncated = bodyTruncated
  return { result, bodyTruncated }
}

const getDocumentTool = defineTool({
  name: 'get_document',
  label: 'Read a document',
  description:
    "Read a document's current version (drafts included): fields, body, section headings and version. Read before changing a document.",
  input: z.object({
    collection: z.string().min(1),
    slug: z.string().min(1),
    locale: z.string().min(1).optional(),
  }),
  role: 'viewer',
  available: (ctx) => canGetContent(ctx.adapter),
  describe: (input) => `Reading ${pathOf(input)}`,
  async run(input, run) {
    const locale = localeOf(run.ctx, input.locale)
    const response = await callHandler(getContent, run.ctx, {
      params: { collection: input.collection, slug: input.slug },
      query: { locale },
    })
    if (!isSuccess(response)) return failure(responseError(response))

    const doc = response.body as ContentDocument
    const { result } = documentView(run, doc)
    if (doc.meta.locale !== locale) {
      result.fallbackFrom = locale
      result.note = `There is no ${locale} version; this is the ${doc.meta.locale} version. Writes to ${locale} cannot use it.`
    }
    return {
      result,
      activity: {
        status: 'done',
        summary: `Read ${pathOf(input)} (v${doc.meta.version})`,
        documents: [refOf(doc)],
      },
    }
  },
})

/** Tools that read content */
export const READ_TOOLS: readonly AssistantTool[] = [
  listCollectionsTool,
  getSchemaTool,
  listDocumentsTool,
  searchDocumentsTool,
  getDocumentTool,
]
