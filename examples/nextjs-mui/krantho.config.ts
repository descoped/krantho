import { defineKranthoConfig } from '@krantho/config'

/**
 * Site configuration — data only. Every value here can be overridden from the
 * environment; see `docs/configuration.md` for the variable behind each leaf.
 * Collections live in krantho.collections.ts; plugins are wiring in the route
 * file. Media files go to the store named by `media.provider`.
 */
export default defineKranthoConfig({
  site: {
    domain: 'localhost',
    name: 'Krantho Example',
    language: 'en',
    baseUrl: 'http://localhost:4001',
    supportedLocales: ['en', 'no'],
    defaultLocale: 'en',
  },
  media: {
    provider: 'local',
    local: { dir: 'public/uploads' },
    maxFileSize: 50 * 1024 * 1024,
  },
  seo: {
    configDir: './krantho.seo',
  },
  // Studio's assistant answers once an AI provider is set in Setup › AI provider
  assistant: { enabled: true },
  // Pages stay cached until a content change invalidates them
  cache: { pages: 'next-isr' },
})
