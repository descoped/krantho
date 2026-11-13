import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// A Node server (`node build`) that runs in any container or VM; on Vercel,
// which runs functions rather than a Node server, Vercel's own adapter. The
// code is the same on every host, and the CDN in front of it is chosen by
// configuration at deploy time — see README.md.
const { default: adapter } = await import(
  process.env.VERCEL ? '@sveltejs/adapter-vercel' : '@sveltejs/adapter-node'
)

export default defineConfig({
  plugins: [tailwindcss(), sveltekit({ adapter: adapter() })],
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
