import { defineKranthoConfig } from '@krantho/config'

/**
 * Site configuration — data only. Every value here can be overridden from the
 * environment; see `docs/configuration.md` for the variable behind each leaf.
 */
export default defineKranthoConfig({
  site: {
    domain: 'krantho.com',
    name: 'Krantho',
    language: 'en',
    baseUrl: 'https://krantho.com',
    // The site's identity, which its Organization and WebSite structured data carry
    description:
      'The project behind Krantho, a CMS library for content sites built in your own codebase.',
    logo: 'https://krantho.com/brand/mark.svg',
  },
  // The site's own Schema.org identity and collection archetypes, seeded into
  // the database on first boot; Studio's Structure edits them from there
  seo: {
    configDir: './krantho.seo',
    // Public by design: IndexNow reads it at https://krantho.com/<key>.txt
    indexNow: { key: '6e9b039df67df2677f9c10bae4f9ff52' },
  },
  // The API answers signed-in people only: pages read content in-process, and an unsigned
  // read of /api would return drafts, checkpoints and settings
  auth: {
    requireAuthForReads: true,
    // The repository's workflows read what editors changed in production (GET /api/changes)
    // with their GitHub identity token, so edits made between releases come back to git.
    // Only runs on master and on release tags are trusted, not feature branches or pull requests
    workload: {
      issuer: 'https://token.actions.githubusercontent.com',
      audience: 'https://krantho.com',
      subjects: [
        'repo:descoped/krantho:ref:refs/heads/master',
        'repo:descoped/krantho:ref:refs/tags/v*',
      ],
    },
  },
  // The Studio assistant, for signed-in editors, on the provider keys the deployment holds
  assistant: { enabled: true },
  // Pages stay cached until a content change invalidates them
  cache: { pages: 'next-isr' },
})
