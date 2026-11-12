import { defineKranthoConfig } from '@krantho/config'

/** Fixture project: what a site's own `krantho.config.ts` looks like to the tools. */
export default defineKranthoConfig({
  site: {
    domain: 'fixture.example',
    name: 'Fixture Site',
    language: 'en',
    baseUrl: 'https://fixture.example',
  },
  llm: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    openai: { apiKey: 'sk-from-file' },
  },
  tools: {
    concurrency: 3,
  },
})
