import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// server.ts mounts the krantho API and Studio, in development and in production
// alike; Vite only builds and serves the React app.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // One React for the app and the linked packages it imports as source
    // (../theme, @krantho/ui-react): pnpm resolves each one's react peer on its
    // own, and a second copy leaves hooks without a dispatcher.
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': resolve(__dirname, 'src'),
      // Resolve @krantho/* to TS source (which has tsconfigs) so vite 8's oxc
      // transformer doesn't choke on the built dist/*.js (TSCONFIG_ERROR).
      // Top-level alias applies to both client and SSR (vite 8 removed
      // ssr.resolve.alias).
      '@krantho/ui-react': resolve(__dirname, '../../packages/ui-react/src/index.ts'),
      // A subpath before its package: aliases match by prefix, in order
      '@krantho/core/marks': resolve(__dirname, '../../packages/core/src/marks.ts'),
      '@krantho/core': resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  // vite 8's oxc transformer loads a tsconfig per file and errors (TSCONFIG_ERROR)
  // on the workspace packages' built dist/*.js (no tsconfig applies to them). Those
  // files are already JS and need no transform — exclude them from oxc.
  oxc: {
    exclude: [/\/packages\/[^/]+\/dist\//],
  },
  ssr: {
    // Node-only @krantho packages are externalized so their built dist/*.js is
    // imported as-is in SSR rather than run through vite's oxc transformer.
    // Externalized, @krantho/server-node is the very copy server.ts imports: the
    // page loader and renderCachedPage share one @krantho/server, and with it
    // the page request scope that records each read's cache tags.
    external: ['@krantho/config', '@krantho/schema', '@krantho/server-node'],
  },
})
