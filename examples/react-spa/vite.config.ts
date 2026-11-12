import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, join } from 'path'
import { seoPlugin } from './src/vite-plugin-seo'
import { kranthoPlugin } from '@krantho/server-node/vite'
import kranthoConfig from './krantho.config'
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

export default defineConfig({
  plugins: [
    react(),
    seoPlugin(),
    kranthoPlugin({
      config: kranthoConfig,
      collections: { pages, globals, services },
    }),
  ],
  resolve: {
    alias: {
      react: resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': resolve(__dirname, 'node_modules/react/jsx-runtime'),
      // Resolve @krantho/core to source (browser-safe after the barrel no longer
      // re-exports the node:fs content-resolver) so vite 8's oxc transformer works
      // on .ts rather than choking on the built dist/*.js.
      '@krantho/core': resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  // Already-built workspace dist/*.js needs no transform — keep it out of oxc.
  oxc: {
    exclude: [/\/packages\/[^/]+\/dist\//],
  },
  server: {
    port: 4006,
  },
})
