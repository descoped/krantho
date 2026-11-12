import { defineKranthoConfig } from '@krantho/config'

/** Fixture project that declares no LLM block: provider and key come from elsewhere. */
export default defineKranthoConfig({
  site: {
    domain: 'keyless.example',
    name: 'Keyless Site',
    language: 'en',
    baseUrl: 'https://keyless.example',
  },
})
