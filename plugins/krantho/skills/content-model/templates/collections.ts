import { join } from 'node:path'
import { defineCollection } from '@krantho/schema'
import { z } from 'zod'

// Starter content templates. Copy the collections the site needs into its
// krantho.collections.ts, rename fields to the project's vocabulary, and delete
// the rest. Each schema is the form an editor fills in /studio; each routed
// collection has a page template in ./next/app/(site)/.

const dir = (name: string): string => join(process.cwd(), 'content', name)

const status = z.enum(['draft', 'published']).default('published')
/** A reference picker: stores the slug of a document in `collection` */
const ref = (collection: string) => z.string().describe(`ref:${collection}`)
/** A media picker: stores the id of a media library item */
const media = () => z.string().describe('media')
/** Keeps documents without a page of their own out of the sitemap */
const unlisted = z.boolean().default(false)

/** Site-wide documents read by the layout: `navigation`, `footer`, `announcement` */
const globals = defineCollection({
  name: 'globals',
  source: 'filesystem',
  directory: dir('globals'),
  schema: z.object({
    title: z.string(),
    // navigation and footer: "Label|/href" per entry, in order
    links: z.array(z.string()).optional(),
    'cta-label': z.string().optional(),
    'cta-href': z.string().optional(),
    // announcement: one short line above the header, shown while set
    message: z.string().optional(),
    'message-href': z.string().optional(),
    status,
  }),
})

/** Standalone pages at /<slug>: about, contact, legal */
const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: dir('pages'),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    'meta-description': z.string().optional(),
    status,
  }),
})

/** The landing page — one document, `home`, rendered at `/` */
const landing = defineCollection({
  name: 'landing',
  source: 'filesystem',
  directory: dir('landing'),
  // The section contract: the `##` sections the landing template designs, in order
  sections: ['Problem', 'Fit'],
  schema: z.object({
    title: z.string(),
    description: z.string(),
    'meta-description': z.string().optional(),
    eyebrow: z.string().optional(),
    headline: z.string(),
    subline: z.string(),
    'primary-label': z.string(),
    'primary-href': z.string(),
    'secondary-label': z.string().optional(),
    'secondary-href': z.string().optional(),
    // Its path is /landing/home by krantho's convention; / renders it instead
    'robots-index': unlisted,
    status,
  }),
})

/** Capabilities: cards on the landing page and a page each at /features/<slug> */
const features = defineCollection({
  name: 'features',
  source: 'filesystem',
  directory: dir('features'),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    benefit: z.string(),
    order: z.number().default(99),
    image: media().optional(),
    'image-alt': z.string().optional(),
    'docs-page': ref('docs').optional(),
    'meta-description': z.string().optional(),
    status,
  }),
})

/** Documentation at /docs/<slug>, grouped by area and ordered within it */
const docs = defineCollection({
  name: 'docs',
  source: 'filesystem',
  directory: dir('docs'),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    area: z.enum(['get-started', 'concepts', 'guides', 'reference']),
    order: z.number().default(99),
    level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    // docs slugs, shown as links before and after the page
    prerequisites: z.array(z.string()).optional(),
    next: z.array(z.string()).optional(),
    related: z.array(z.string()).optional(),
    status,
  }),
})

/** Code samples: variants that share `sample` form one tabbed block, one tab per stack */
const snippets = defineCollection({
  name: 'snippets',
  source: 'filesystem',
  directory: dir('snippets'),
  schema: z.object({
    title: z.string(),
    sample: z.string(),
    stack: z.enum(['next', 'sveltekit', 'express', 'any']),
    filename: z.string().optional(),
    language: z.string().default('ts'),
    order: z.number().default(99),
    'robots-index': unlisted,
    status,
  }),
})

/** Questions and answers: the title is the question, the body the answer */
const faq = defineCollection({
  name: 'faq',
  source: 'filesystem',
  directory: dir('faq'),
  schema: z.object({
    title: z.string(),
    topic: z.enum(['product', 'content', 'hosting']),
    order: z.number().default(99),
    'docs-page': ref('docs').optional(),
    'robots-index': unlisted,
    status,
  }),
})

/** Terms, shown together on /glossary */
const glossary = defineCollection({
  name: 'glossary',
  source: 'filesystem',
  directory: dir('glossary'),
  schema: z.object({
    title: z.string(),
    definition: z.string(),
    'docs-page': ref('docs').optional(),
    'robots-index': unlisted,
    status,
  }),
})

/** Release notes at /releases and /releases/<slug>; the slug is the version with dashes */
const releases = defineCollection({
  name: 'releases',
  source: 'filesystem',
  directory: dir('releases'),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    version: z.string(),
    // ISO date, quoted in frontmatter: '2026-01-31'
    date: z.string(),
    highlights: z.array(z.string()).optional(),
    status,
  }),
})

export const collections = {
  globals,
  pages,
  landing,
  features,
  docs,
  snippets,
  faq,
  glossary,
  releases,
}
