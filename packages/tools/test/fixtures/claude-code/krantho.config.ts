import { defineKranthoConfig } from '@krantho/config'

/** Fixture project that runs enrichment on the Claude subscription, as a developer's own machine does. */
export default defineKranthoConfig({
  site: {
    domain: 'claude-code.example',
    name: 'Claude Code Site',
    language: 'en',
    baseUrl: 'https://claude-code.example',
  },
  llm: {
    provider: 'claude-code',
  },
})
