import { join } from 'path'
import {
  defineCollection,
  defineDocumentArchetype,
  sharingMetadata,
  structuredDataMetadata,
} from '@krantho/schema'
import { z } from 'zod'

// The content templates behind krantho.com — shared by the API route and the page
// loader, so whichever a fresh deployment serves first imports the same content.
// Each schema is the form an editor fills in /studio; `path` is where a page
// template under app/(site)/ renders its documents (false: no page of their own),
// read by the sitemap, Preview on site, page refresh, JSON-LD and lib/routes.ts.
// `ref:<collection>` makes a field a reference picker, `media` a media picker,
// string arrays a tag input.

const dir = (name: string): string => join(process.cwd(), 'content', name)

const ref = (collection: string) => z.string().describe(`ref:${collection}`)
const stack = z.enum(['next', 'sveltekit', 'express', 'any'])

/** Site-wide documents: navigation, footer, announcement — read by the shell */
const globals = defineCollection({
  name: 'globals',
  source: 'filesystem',
  directory: dir('globals'),
  path: false,
  archetype: defineDocumentArchetype({
    id: 'site/globals',
    label: 'globals',
    fields: z.object({
      title: z.string(),
      // navigation: "Label|/href" per entry, in order
      links: z.array(z.string()).optional(),
      'cta-label': z.string().optional(),
      'cta-href': z.string().optional(),
      // announcement: a short line shown above the header when set
      message: z.string().optional(),
      'message-href': z.string().optional(),
      tagline: z.string().optional(),
    }),
    metadata: { sharing: { archetype: sharingMetadata } },
  }),
})

/** The landing page — one document, `home` */
const landing = defineCollection({
  name: 'landing',
  source: 'filesystem',
  directory: dir('landing'),
  path: '/',

  archetype: defineDocumentArchetype({
    id: 'site/landing',
    label: 'landing',
    fields: z.object({
      title: z.string(),
      description: z.string(),
      eyebrow: z.string().optional(),
      headline: z.string(),
      subline: z.string(),
      'primary-label': z.string(),
      'primary-href': z.string(),
      'secondary-label': z.string().optional(),
      'secondary-href': z.string().optional(),
      'hero-sample': z.string().optional(),
    }),
    sections: [
      'Install',
      'Problem',
      'How it works',
      'Capabilities',
      'Your stack, your host',
      'For editors',
      'Fit',
      'Questions',
      'Get started',
    ],
    metadata: {
      sharing: { archetype: sharingMetadata },
      seo: { archetype: structuredDataMetadata },
    },
  }),
})

/** Capabilities: cards on the landing page and a page each */
const features = defineCollection({
  name: 'features',
  source: 'filesystem',
  directory: dir('features'),
  path: '/features/:slug',

  archetype: defineDocumentArchetype({
    id: 'site/features',
    label: 'features',
    fields: z.object({
      title: z.string(),
      description: z.string(),
      benefit: z.string(),
      order: z.number().default(99),
      icon: z.enum([
        'content',
        'studio',
        'seo',
        'cache',
        'media',
        'database',
        'skills',
        'config',
        'frameworks',
      ]),
      'proof-sample': z.string().optional(),
      'docs-page': ref('docs').optional(),
    }),
    sections: ['Problem', 'Approach', 'Proof', 'Limits'],
    metadata: {
      sharing: { archetype: sharingMetadata },
      seo: { archetype: structuredDataMetadata },
    },
  }),
})

/** Supported frameworks: a page each */
const stacks = defineCollection({
  name: 'stacks',
  source: 'filesystem',
  directory: dir('stacks'),
  path: '/stacks/:slug',

  archetype: defineDocumentArchetype({
    id: 'site/stacks',
    label: 'stacks',
    fields: z.object({
      title: z.string(),
      description: z.string(),
      framework: stack,
      tagline: z.string(),
      packages: z.array(z.string()).optional(),
      'ui-packages': z.array(z.string()).optional(),
      order: z.number().default(99),
      'docs-page': ref('docs').optional(),
    }),
    sections: ['Install', 'Wire', 'Render', 'Deploy'],
    metadata: {
      sharing: { archetype: sharingMetadata },
      seo: { archetype: structuredDataMetadata },
    },
  }),
})

/** Hosting targets: the deploy matrix and a page each */
const hosts = defineCollection({
  name: 'hosts',
  source: 'filesystem',
  directory: dir('hosts'),
  path: '/deploy/:slug',

  archetype: defineDocumentArchetype({
    id: 'site/hosts',
    label: 'hosts',
    fields: z.object({
      title: z.string(),
      description: z.string(),
      kind: z.enum(['platform', 'cdn', 'server']),
      'cache-strategy': z.enum(['none', 'next-isr', 'cdn']),
      frameworks: z.array(z.string()).optional(),
      databases: z.array(z.string()).optional(),
      'media-stores': z.array(z.string()).optional(),
      order: z.number().default(99),
      'docs-page': ref('docs').optional(),
    }),
    sections: ['Set up', 'Configure', 'Cache', 'Verify'],
    metadata: {
      sharing: { archetype: sharingMetadata },
      seo: { archetype: structuredDataMetadata },
    },
  }),
})

/** The Krantho Developer Documentation */
const docs = defineCollection({
  name: 'docs',
  source: 'filesystem',
  directory: dir('docs'),
  path: '/docs/:slug',
  archetype: defineDocumentArchetype({
    id: 'site/docs',
    label: 'docs',
    fields: z.object({
      title: z.string(),
      description: z.string(),
      area: z.enum(['get-started', 'concepts', 'guides', 'deploy', 'reference', 'skills']),
      order: z.number().default(99),
      level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
      stacks: z.array(z.string()).optional(),
      since: z.string().optional(),
      prerequisites: z.array(z.string()).optional(),
      next: z.array(z.string()).optional(),
      related: z.array(z.string()).optional(),
    }),
    metadata: {
      sharing: { archetype: sharingMetadata },
      seo: { archetype: structuredDataMetadata },
    },
  }),
})

/** Code samples, written once and embedded anywhere with {{sample:<name>}} */
const snippets = defineCollection({
  name: 'snippets',
  source: 'filesystem',
  directory: dir('snippets'),
  path: false,
  archetype: defineDocumentArchetype({
    id: 'site/snippets',
    label: 'snippets',
    fields: z.object({
      title: z.string(),
      sample: z.string(),
      stack,
      filename: z.string().optional(),
      language: z.string().default('ts'),
      order: z.number().default(99),
    }),
    metadata: {
      sharing: { archetype: sharingMetadata },
      seo: { archetype: structuredDataMetadata },
    },
  }),
})

/** Questions and answers, shown on product and docs pages (FAQPage) */
const faq = defineCollection({
  name: 'faq',
  source: 'filesystem',
  directory: dir('faq'),
  path: false,
  archetype: defineDocumentArchetype({
    id: 'site/faq',
    label: 'faq',
    fields: z.object({
      title: z.string(),
      topic: z.enum(['product', 'content', 'seo', 'hosting', 'studio', 'skills']),
      order: z.number().default(99),
      'docs-page': ref('docs').optional(),
    }),
    metadata: {
      sharing: { archetype: sharingMetadata },
      seo: { archetype: structuredDataMetadata },
    },
  }),
})

/** Terms used across the site and docs */
const glossary = defineCollection({
  name: 'glossary',
  source: 'filesystem',
  directory: dir('glossary'),
  path: false,
  archetype: defineDocumentArchetype({
    id: 'site/glossary',
    label: 'glossary',
    fields: z.object({
      title: z.string(),
      definition: z.string(),
      'docs-page': ref('docs').optional(),
    }),
    metadata: {
      sharing: { archetype: sharingMetadata },
      seo: { archetype: structuredDataMetadata },
    },
  }),
})

/** A release version: MAJOR.MINOR.PATCH, with an optional pre-release (semver.org) */
export const RELEASE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** Release notes: the changelog */
const releases = defineCollection({
  name: 'releases',
  source: 'filesystem',
  directory: dir('releases'),
  // Every release is an entry on the one /changelog page (pages/changelog), at its anchor
  path: false,

  archetype: defineDocumentArchetype({
    id: 'site/releases',
    label: 'releases',
    fields: z.object({
      title: z.string(),
      description: z.string(),
      // The release this entry describes, MAJOR.MINOR.PATCH (its tag is vMAJOR.MINOR.PATCH);
      // notes from before the first release have none
      version: z.string().regex(RELEASE_VERSION, 'a release version: MAJOR.MINOR.PATCH').optional(),
      date: z.string(),
      highlights: z.array(z.string()).optional(),
    }),
    sections: ['Added', 'Changed', 'Fixed'],
    metadata: {
      sharing: { archetype: sharingMetadata },
      seo: { archetype: structuredDataMetadata },
    },
  }),
})

/** Standalone pages: about, agent skills, legal */
const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: dir('pages'),
  path: '/:slug',
  archetype: defineDocumentArchetype({
    id: 'site/pages',
    label: 'pages',
    fields: z.object({
      title: z.string(),
      description: z.string(),
      eyebrow: z.string().optional(),
    }),
    metadata: {
      sharing: { archetype: sharingMetadata },
      seo: { archetype: structuredDataMetadata },
    },
  }),
})

export const collections = {
  globals,
  landing,
  features,
  stacks,
  hosts,
  docs,
  snippets,
  faq,
  glossary,
  releases,
  pages,
}
