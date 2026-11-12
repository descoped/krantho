import { DOCUMENT_SEO_METADATA_SCHEMA } from '@krantho/seo-shared'
import { z } from 'zod'
import { defineDocumentArchetype, defineMetadataArchetype } from './archetypes.js'

export const editorialMetadata = defineMetadataArchetype({
  id: 'krantho/editorial',
  label: 'Editorial',
  schema: z.object({ byline: z.string().min(1).describe('The name readers see as the author.') }),
})

export const publicationMetadata = defineMetadataArchetype({
  id: 'krantho/publication',
  label: 'Publication',
  schema: z.object({
    date: z.iso.datetime().describe('When the page is published.'),
  }),
})

export const classificationMetadata = defineMetadataArchetype({
  id: 'krantho/classification',
  label: 'Topics',
  schema: z.object({ tags: z.array(z.string()).optional(), category: z.string().optional() }),
})

/** Sharing is optional authored content. A site may use it without enabling SEO. */
export const sharingMetadata = defineMetadataArchetype({
  id: 'krantho/sharing',
  label: 'Search and sharing',
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    image: z.string().describe('media').optional(),
    canonicalUrl: z.url().optional(),
    index: z.boolean().optional(),
    follow: z.boolean().optional(),
  }),
})

/**
 * A page's own structured data: the Schema.org graph the editor's Data mode
 * edits, versioned with the page. Declare it as the `seo` slot.
 */
export const structuredDataMetadata = defineMetadataArchetype({
  id: 'krantho/structured-data',
  label: 'Structured data',
  schema: z.fromJSONSchema(DOCUMENT_SEO_METADATA_SCHEMA) as z.ZodObject,
})

export const websiteContent = defineDocumentArchetype({
  id: 'krantho/website-content',
  label: 'Website content',
  fields: z.object({ title: z.string(), summary: z.string().optional() }),
  metadata: {
    classification: { archetype: classificationMetadata },
    sharing: { archetype: sharingMetadata },
  },
})

export const blogContent = defineDocumentArchetype({
  id: 'krantho/blog-post',
  label: 'Blog post',
  fields: z.object({ title: z.string(), excerpt: z.string().optional() }),
  body: 'required',
  metadata: {
    editorial: { archetype: editorialMetadata, required: true },
    publication: { archetype: publicationMetadata },
    classification: { archetype: classificationMetadata },
    sharing: { archetype: sharingMetadata },
  },
})
