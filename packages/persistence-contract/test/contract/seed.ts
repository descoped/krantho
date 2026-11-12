import type { IPersistenceAdapter, QueryReader } from '@krantho/persistence'
import { canWriteContent } from '@krantho/persistence'

/** One document of a seed, and the state the seeding leaves it in */
export interface ContractDocument {
  collection: string
  slug: string
  locale?: string
  fields: Record<string, unknown>
  body: string
  state: 'published' | 'draft' | 'archived' | 'deleted' | 'published-with-newer-draft'
  /** The fields of the draft saved after publishing, for `published-with-newer-draft` */
  newerDraftFields?: Record<string, unknown>
}

export type ContractSeed = readonly ContractDocument[]

/** What a factory hands the suite: a seeded adapter and how to close it */
export interface ContractFixture {
  adapter: QueryReader
  close(): Promise<void> | void
}

/** Builds an adapter holding exactly the seed (see {@link seedAdapter}) */
export type ContractFactory = (seed: ContractSeed) => Promise<ContractFixture>

/**
 * What the adapter under test can hold. A file is one version of one document, so an
 * adapter over files has no history: no version ahead of the live one, and one document
 * per slug. The cases of `history` run only on adapters that keep versions.
 */
export interface ContractTraits {
  history: boolean
}

/**
 * The seed most cases read: two collections, two locales, and a document in each
 * state, with non-ASCII text in a body and in fields. Every slug is unique within its
 * collection, so a file per document holds it.
 *
 * Current documents (not deleted): pages/en alpha bravo charlie delta fifty, pages/nb
 * alpha-nb, posts/en p1 p2 p3. Live: pages/en alpha charlie, pages/nb alpha-nb,
 * posts/en p1 p3. `rank` is unique and one digit, `kind` ties within a collection.
 */
export const CONTRACT_SEED: ContractSeed = [
  {
    collection: 'pages',
    slug: 'alpha',
    locale: 'en',
    fields: { title: 'Alpha', rank: 3, kind: 'x' },
    body: 'Alpha body mentions Ørret in a river.\n\nSecond   paragraph.',
    state: 'published',
  },
  {
    collection: 'pages',
    slug: 'bravo',
    locale: 'en',
    fields: { title: 'Bravo', rank: 1, kind: 'x' },
    body: 'Bravo draft body, 100 percent.',
    state: 'draft',
  },
  {
    collection: 'pages',
    slug: 'charlie',
    locale: 'en',
    fields: { title: 'Charlie live', rank: 2, kind: 'x' },
    body: 'Charlie live body.',
    state: 'published',
  },
  {
    collection: 'pages',
    slug: 'delta',
    locale: 'en',
    fields: { title: 'Delta', rank: 4, kind: 'x' },
    body: 'Delta archived body.',
    state: 'archived',
  },
  {
    collection: 'pages',
    slug: 'echo',
    locale: 'en',
    fields: { title: 'Echo', rank: 0, kind: 'x' },
    body: 'Echo deleted body.',
    state: 'deleted',
  },
  {
    collection: 'pages',
    slug: 'fifty',
    locale: 'en',
    fields: { title: 'Fifty', rank: 5, kind: 'x' },
    body: 'Fifty draft body, 100% sure.',
    state: 'draft',
  },
  {
    collection: 'pages',
    slug: 'alpha-nb',
    locale: 'nb',
    fields: { title: 'Ørret og Æsj', rank: 6, kind: 'x' },
    body: 'Norsk tekst.',
    state: 'published',
  },
  {
    collection: 'posts',
    slug: 'p1',
    locale: 'en',
    fields: { title: 'Post one', rank: 7, kind: 'y' },
    body: 'First post.',
    state: 'published',
  },
  {
    collection: 'posts',
    slug: 'p2',
    locale: 'en',
    fields: { title: 'Post two', rank: 8, kind: 'y' },
    body: 'Second post.',
    state: 'draft',
  },
  {
    collection: 'posts',
    slug: 'p3',
    locale: 'en',
    fields: { title: 'Post three', rank: 9, kind: 'y' },
    body: 'Third post.',
    state: 'published',
  },
]

/** The seed of the history cases: a live version with a newer draft, and one slug in two locales */
export const HISTORY_SEED: ContractSeed = [
  {
    collection: 'pages',
    slug: 'live-draft',
    locale: 'en',
    fields: { title: 'Live', rank: 9 },
    body: 'Live body.',
    state: 'published-with-newer-draft',
    newerDraftFields: { title: 'Newer', rank: 0 },
  },
  {
    collection: 'pages',
    slug: 'dual',
    locale: 'en',
    fields: { title: 'Dual en', rank: 5 },
    body: 'English.',
    state: 'published',
  },
  {
    collection: 'pages',
    slug: 'dual',
    locale: 'nb',
    fields: { title: 'Dual nb', rank: 6 },
    body: 'Norsk.',
    state: 'published',
  },
]

/** Three bodies whose match sits near the start, 80 characters in, and deep inside */
export const SNIPPET_SEED: ContractSeed = [
  {
    collection: 'pages',
    slug: 'near-start',
    fields: { title: 'Near start' },
    body: `${'a'.repeat(10)}STARTMARK${'b'.repeat(300)}`,
    state: 'draft',
  },
  {
    collection: 'pages',
    slug: 'at-edge',
    fields: { title: 'At edge' },
    body: `${'a'.repeat(80)}EDGEMARK${'b'.repeat(300)}`,
    state: 'draft',
  },
  {
    collection: 'pages',
    slug: 'deep',
    fields: { title: 'Deep' },
    body: `${'a'.repeat(200)}DEEPMARK${'b'.repeat(200)}`,
    state: 'draft',
  },
]

/**
 * Numbers whose text order differs from their numeric order, a text value and a missing
 * one: a field sort puts the missing value first, then numbers numerically, then text.
 */
export const SORT_SEED: ContractSeed = [
  {
    collection: 'pages',
    slug: 'ten',
    fields: { title: 'Ten', order: 10 },
    body: '',
    state: 'draft',
  },
  {
    collection: 'pages',
    slug: 'two',
    fields: { title: 'Two', order: 2 },
    body: '',
    state: 'draft',
  },
  {
    collection: 'pages',
    slug: 'one',
    fields: { title: 'One', order: 1 },
    body: '',
    state: 'draft',
  },
  { collection: 'pages', slug: 'none', fields: { title: 'None' }, body: '', state: 'draft' },
  {
    collection: 'pages',
    slug: 'word',
    fields: { title: 'Word', order: 'first' },
    body: '',
    state: 'draft',
  },
]

/** Two bodies that differ by a backslash in the text a match looks for */
export const TEXT_SEED: ContractSeed = [
  {
    collection: 'pages',
    slug: 'windows',
    fields: { title: 'Windows' },
    body: 'Open C:\\dir\\file now.',
    state: 'draft',
  },
  {
    collection: 'pages',
    slug: 'plain',
    fields: { title: 'Plain' },
    body: 'Open the dir file now.',
    state: 'draft',
  },
]

/** Write the seed through the adapter's own write path */
export async function seedAdapter(adapter: IPersistenceAdapter, seed: ContractSeed): Promise<void> {
  if (!canWriteContent(adapter)) throw new Error('The adapter under test cannot write content')
  for (const doc of seed) {
    const base = { collection: doc.collection, slug: doc.slug, locale: doc.locale ?? 'en' }
    const write = { ...base, fields: doc.fields, body: doc.body }
    if (doc.state === 'archived') await adapter.writeContent({ ...write, publication: 'archive' })
    else if (doc.state === 'draft') await adapter.writeContent(write)
    else await adapter.writeContent({ ...write, publication: 'publish' })
    if (doc.state === 'deleted') {
      await adapter.deleteContent(base.collection, base.slug, base.locale)
    }
    if (doc.state === 'published-with-newer-draft') {
      await adapter.writeContent({ ...write, fields: doc.newerDraftFields ?? doc.fields })
    }
  }
}
