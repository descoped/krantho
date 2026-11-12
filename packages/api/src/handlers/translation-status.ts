import { canQuery, type DocumentMeta } from '@krantho/persistence'
import { activeLocales } from '../active-locales.js'
import { groupByCollection } from '../group-by-collection.js'
import type { ApiHandler } from '../types.js'

interface TranslationItem {
  slug: string
  locales: string[]
  missing: string[]
}

interface CollectionStatus {
  collection: string
  total: number
  items: TranslationItem[]
}

/**
 * The locales each slug exists in. Slugs keep the order of the documents, which `query`
 * reads by slug; each slug's locales are the supported locales first, in their order, then
 * any other locale it has, in the order they were read.
 */
function localesOfSlugs(
  documents: readonly DocumentMeta[],
  supportedLocales: readonly string[],
): Map<string, Set<string>> {
  const read = new Map<string, Set<string>>()
  for (const meta of documents) {
    const locales = read.get(meta.slug) ?? new Set<string>()
    locales.add(meta.locale)
    read.set(meta.slug, locales)
  }
  const localesBySlug = new Map<string, Set<string>>()
  for (const [slug, locales] of read) {
    const supported = supportedLocales.filter((locale) => locales.has(locale))
    const others = [...locales].filter((locale) => !supportedLocales.includes(locale))
    localesBySlug.set(slug, new Set([...supported, ...others]))
  }
  return localesBySlug
}

/**
 * GET /api/translations/status — translation coverage per collection.
 *
 * Returns which items exist in which locales and which are missing. One adapter `query`
 * reads every collection and locale.
 */
export const translationStatus: ApiHandler = async (_req, ctx) => {
  const { defaultLocale } = ctx.config.site
  const supportedLocales = (await activeLocales(ctx)).locales

  if (supportedLocales.length <= 1) {
    return {
      status: 200,
      body: {
        supportedLocales,
        defaultLocale,
        collections: [],
        message: 'Single-locale site — no translation tracking needed',
      },
    }
  }

  if (!canQuery(ctx.adapter)) {
    return { status: 501, body: { error: 'Adapter does not support query' } }
  }

  const names = [...ctx.contentConfig.collections.values()].map((collection) => collection.name)
  const { items: metas } = await ctx.adapter.query({
    state: 'current',
    projection: 'meta',
    collections: names,
  })
  const documents = groupByCollection(metas, names, (meta) => meta.collection)

  const collections: CollectionStatus[] = names.map((name) => {
    const localesBySlug = localesOfSlugs(documents.get(name) ?? [], supportedLocales)
    const items: TranslationItem[] = [...localesBySlug].map(([slug, locales]) => ({
      slug,
      locales: [...locales],
      missing: supportedLocales.filter((l) => !locales.has(l)),
    }))
    return { collection: name, total: items.length, items }
  })

  return {
    status: 200,
    body: { supportedLocales, defaultLocale, collections },
  }
}
