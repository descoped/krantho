import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // better-sqlite3 (pulled in transitively via @krantho/persistence-sqlite by
  // the krantho server the API route and the page loads run) uses __filename,
  // which breaks when vite bundles it into the ESM SSR output. Keep the
  // Node-only packages external so they load via Node's CommonJS resolver at
  // runtime.
  ssr: {
    external: [
      'better-sqlite3',
      '@krantho/persistence-sqlite',
      '@krantho/persistence',
      '@krantho/core',
      '@krantho/schema',
      '@krantho/api',
      '@krantho/server-sveltekit',
    ],
  },
})
