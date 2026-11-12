import { join } from 'path'
import {
  defineCollection,
  defineDocumentArchetype,
  defineMetadataArchetype,
  sharingMetadata,
  structuredDataMetadata,
} from '@krantho/schema'
import { z } from 'zod'

// These properties are separate from rendered fields and can be read as document.metadata.editorial.
const editorialMetadata = defineMetadataArchetype({
  id: 'example/editorial',
  label: 'Editorial',
  schema: z.object({
    author: z.string().describe('Who is responsible for this page.').optional(),
    reviewDate: z.iso.datetime().describe('When this page was last reviewed.').optional(),
  }),
})

// The collections this site serves — shared by the API handler and the page loader,
// so whichever a fresh deployment serves first imports the same content.

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: join(process.cwd(), '..', 'content', 'pages'),
  archetype: defineDocumentArchetype({
    id: 'site/pages',
    label: 'pages',
    fields: z.object({
      title: z.string(),
      description: z.string(),
    }),
    metadata: {
      editorial: { archetype: editorialMetadata },
      sharing: { archetype: sharingMetadata },
      seo: { archetype: structuredDataMetadata },
    },
  }),
})

const globals = defineCollection({
  name: 'globals',
  source: 'filesystem',
  directory: join(process.cwd(), '..', 'content', 'globals'),
  archetype: defineDocumentArchetype({
    id: 'site/globals',
    label: 'globals',
    fields: z.object({
      'logo-name': z.string().optional(),
      'logo-subtitle': z.string().optional(),
      'nav-home': z.string().optional(),
      'nav-about': z.string().optional(),
      'nav-services': z.string().optional(),
      'nav-fees': z.string().optional(),
      'nav-contact': z.string().optional(),
      'footer-title': z.string().optional(),
      'footer-description': z.string().optional(),
      'footer-copyright-text': z.string().optional(),
      'phone-title': z.string().optional(),
      'phone-number': z.string().optional(),
      'phone-subtitle': z.string().optional(),
      'email-title': z.string().optional(),
      'email-address': z.string().optional(),
      'email-subtitle': z.string().optional(),
      'location-title': z.string().optional(),
      'location-address': z.string().optional(),
      'location-subtitle': z.string().optional(),
      'hours-title': z.string().optional(),
      'hours-line1': z.string().optional(),
      'hours-line2': z.string().optional(),
      'booking-url': z.string().optional(),
      'booking-button-text': z.string().optional(),
    }),
    metadata: { sharing: { archetype: sharingMetadata } },
  }),
})

const services = defineCollection({
  name: 'services',
  source: 'filesystem',
  directory: join(process.cwd(), '..', 'content', 'services'),
  archetype: defineDocumentArchetype({
    id: 'site/services',
    label: 'services',
    fields: z.object({
      title: z.string(),
      description: z.string(),
      ingress: z.string(),
      order: z.number().optional(),
    }),
    metadata: {
      sharing: { archetype: sharingMetadata },
      seo: { archetype: structuredDataMetadata },
    },
  }),
})

export const collections = { pages, globals, services }
