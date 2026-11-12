import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/api/vitest.config.ts',
      'packages/config/vitest.config.ts',
      'packages/create-krantho/vitest.config.ts',
      'packages/core/vitest.config.ts',
      'packages/persistence-contract/vitest.config.ts',
      'packages/persistence-fs/vitest.config.ts',
      'packages/persistence-sqlite/vitest.config.ts',
      'packages/persistence-postgres/vitest.config.ts',
      'packages/schema/vitest.config.ts',
      'packages/tools/vitest.config.ts',
      'packages/server/vitest.config.ts',
      'packages/server-next/vitest.config.ts',
      'packages/server-sveltekit/vitest.config.ts',
      'packages/server-node/vitest.config.ts',
      'packages/media-local/vitest.config.ts',
      'packages/media-vercel-blob/vitest.config.ts',
      'packages/media-s3/vitest.config.ts',
      'packages/media-gcs/vitest.config.ts',
      'packages/ai/vitest.config.ts',
      'packages/seo/vitest.config.ts',
      'packages/ui-react/vitest.config.ts',
      'packages/studio/vitest.config.ts',
      'krantho-site/vitest.config.ts',
    ],
  },
})
