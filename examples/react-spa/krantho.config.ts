import { defineKranthoConfig } from '@krantho/config'

/**
 * Site configuration — data only. Every value here can be overridden from the
 * environment; see `docs/configuration.md` for the variable behind each leaf.
 * Collections and plugins are wiring and live in `vite.config.ts`. Media files
 * go to the store named by `media.provider`.
 */
export default defineKranthoConfig({
  site: {
    domain: 'localhost',
    name: 'Krantho Example',
    language: 'en',
    baseUrl: 'http://localhost:4006',
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
})
