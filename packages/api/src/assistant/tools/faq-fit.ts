import { canQuery } from '@krantho/persistence'
import { type ZodObject, type ZodRawShape, z } from 'zod'
import { getMergedSchema } from '../../merged-schema.js'
import type { ApiContext } from '../../types.js'

/** One question and its answer */
export interface FaqEntry {
  question: string
  answer: string
}

/** A new document one FAQ entry becomes */
export interface FaqCandidate {
  slug: string
  fields: Record<string, unknown>
  body: string
}

export type FaqFit = { ok: true; candidates: FaqCandidate[] } | { ok: false; reason: string }

/** Whether the schema declares `key` as a string field */
export function declaresString(schema: ZodObject<ZodRawShape>, key: string): boolean {
  const field = schema.shape[key]
  if (!field) return false
  try {
    return z.toJSONSchema(field, { unrepresentable: 'any' })['type'] === 'string'
  } catch {
    return false
  }
}

const SLUG_MAX = 60

/** The question as a slug: lowercased, accents removed, runs of other characters as `-` */
export function questionSlug(question: string): string {
  const slug = question
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '')
  return slug || 'question'
}

/** A slug not in `taken`: the base, else the base with `-2`, `-3`, … */
function uniqueSlug(base: string, taken: Set<string>): string {
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
  taken.add(slug)
  return slug
}

/** The slugs the target collection already uses in this locale */
async function takenSlugs(
  ctx: ApiContext,
  collection: string,
  locale: string,
): Promise<Set<string>> {
  if (!canQuery(ctx.adapter)) return new Set()
  const page = await ctx.adapter.query({
    state: 'current',
    collections: [collection],
    projection: 'meta',
    locale,
  })
  return new Set(page.items.map((meta) => meta.slug))
}

/** The fields and body of one entry in a collection with these declared fields */
function candidateFor(schema: ZodObject<ZodRawShape>, entry: FaqEntry): Omit<FaqCandidate, 'slug'> {
  const hasAnswer = declaresString(schema, 'answer')
  const fields: Record<string, unknown> = { question: entry.question }
  if (hasAnswer) fields['answer'] = entry.answer
  if (declaresString(schema, 'title')) fields['title'] = entry.question
  if ('status' in schema.shape) fields['status'] = 'draft'
  return { fields, body: hasAnswer ? '' : entry.answer }
}

/**
 * Whether FAQ entries fit a collection: it must declare `question` as a string,
 * and each entry's fields must pass its schema. The answer goes to an `answer`
 * field when declared, else to the body; `title` is the question. Each entry
 * gets a slug unique in the collection and in the batch.
 */
export async function faqFit(
  ctx: ApiContext,
  collection: string,
  entries: readonly FaqEntry[],
  locale: string,
): Promise<FaqFit> {
  const collectionDef = ctx.contentConfig.collections.get(collection)
  if (!collectionDef) return { ok: false, reason: `Collection "${collection}" not found` }
  const schema = await getMergedSchema(collectionDef, ctx.adapter)
  if (!declaresString(schema, 'question')) {
    return { ok: false, reason: `The ${collection} collection has no question field` }
  }

  const candidates = entries.map((entry) => candidateFor(schema, entry))
  const failing = new Set<string>()
  for (const candidate of candidates) {
    const parsed = schema.safeParse(candidate.fields)
    if (!parsed.success) for (const issue of parsed.error.issues) failing.add(issue.path.join('.'))
  }
  if (failing.size > 0) {
    const fields = [...failing].join(', ')
    return { ok: false, reason: `Entries do not fit ${collection}; it needs: ${fields}` }
  }

  const taken = await takenSlugs(ctx, collection, locale)
  return {
    ok: true,
    candidates: candidates.map((candidate, i) => ({
      ...candidate,
      slug: uniqueSlug(questionSlug(entries[i]?.question ?? ''), taken),
    })),
  }
}
