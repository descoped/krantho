import type { ProjectOptions } from '../prompts.js'
import { KRANTHO_RANGE } from '../version.js'
import { sortObject } from './nextjs.js'

export function generateSveltekitFiles(options: ProjectOptions): Map<string, string> {
  const files = new Map<string, string>()

  files.set('package.json', packageJson(options))
  files.set('tsconfig.json', tsconfig())
  files.set('vite.config.ts', viteConfig(options))
  files.set('krantho.config.ts', kranthoConfig(options))
  files.set('krantho.collections.ts', kranthoCollections(options))
  files.set('src/app.html', appHtml(options))
  files.set('src/app.css', appCss(options))
  files.set('src/lib/cms.ts', cmsInit())
  files.set('src/routes/api/[...path]/+server.ts', apiHandler())
  files.set('src/routes/studio/[...path]/+server.ts', studioHandler())
  files.set('src/routes/sitemap.xml/+server.ts', seoRoute('/api/seo/sitemap'))
  files.set('src/routes/robots.txt/+server.ts', seoRoute('/api/seo/robots.txt'))
  files.set('src/routes/+layout.server.ts', layoutServer())
  files.set('src/routes/+layout.svelte', layoutSvelte(options))
  files.set('src/routes/+page.server.ts', homePageServer())
  files.set('src/routes/+page.svelte', homePage())
  files.set('src/routes/[slug]/+page.server.ts', dynamicPageServer())
  files.set('src/routes/[slug]/+page.svelte', dynamicPage())

  return files
}

function packageJson(options: ProjectOptions): string {
  // `@krantho/sveltekit` is the one-install umbrella — it bundles
  // server-sveltekit, ui-svelte, studio, media-local, and seo so a single
  // dependency provisions the full stack. The packages the generated source
  // imports *by name* (server-sveltekit, core, schema, persistence-sqlite) are
  // also listed explicitly so the project resolves under a strict, non-hoisted
  // node_modules layout where transitive deps are not directly importable.
  const deps: Record<string, string> = {
    '@krantho/config': KRANTHO_RANGE,
    '@krantho/sveltekit': KRANTHO_RANGE,
    '@krantho/server-sveltekit': KRANTHO_RANGE,
    '@krantho/core': KRANTHO_RANGE,
    '@krantho/schema': KRANTHO_RANGE,
    '@krantho/persistence-sqlite': KRANTHO_RANGE,
    '@sveltejs/adapter-auto': '^8.0.1',
    '@sveltejs/kit': '^3.2.0',
    svelte: '^5.57.3',
    zod: '^4.6.7',
  }

  if (options.ui === 'tailwind') {
    deps.tailwindcss = '^4.3.5'
    deps['@tailwindcss/vite'] = '^4.3.5'
  }

  const devDeps: Record<string, string> = {
    '@types/node': '^26.6.6',
    // SvelteKit 3 supports TypeScript 6
    typescript: '^6.0.3',
    vite: '^8.3.8',
  }

  const pkg = {
    name: options.name,
    version: '0.1.0',
    private: true,
    type: 'module',
    // SvelteKit's #lib: the project's own modules, by path under src/lib
    imports: { '#lib': './src/lib', '#lib/*': './src/lib/*' },
    scripts: {
      // Vite does not load .env into process.env for server code; the
      // config resolver reads KRANTHO_* from process.env, so load it here.
      dev: `node --env-file-if-exists=.env node_modules/vite/bin/vite.js dev --port ${options.port}`,
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: sortObject(deps),
    devDependencies: sortObject(devDeps),
  }

  return JSON.stringify(pkg, null, 2) + '\n'
}

function tsconfig(): string {
  return (
    JSON.stringify(
      {
        extends: '$app/tsconfig',
        include: ['src', '*'],
        compilerOptions: {
          allowJs: true,
          checkJs: true,
          esModuleInterop: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          skipLibCheck: true,
          sourceMap: true,
          strict: true,
        },
      },
      null,
      2,
    ) + '\n'
  )
}

function viteConfig(options: ProjectOptions): string {
  if (options.ui === 'tailwind') {
    return `import adapter from '@sveltejs/adapter-auto'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), sveltekit({ adapter: adapter() })]
})
`
  }
  return `import adapter from '@sveltejs/adapter-auto'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit({ adapter: adapter() })]
})
`
}

function appHtml(options: ProjectOptions): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${options.name}</title>
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
`
}

function appCss(options: ProjectOptions): string {
  if (options.ui === 'tailwind') {
    return `@import 'tailwindcss';

:root {
  --font-sans: system-ui, -apple-system, sans-serif;
  --color-primary: #2563eb;
  --color-text: #1a1a2e;
  --color-muted: #6b7280;
}

body {
  font-family: var(--font-sans);
  color: var(--color-text);
  margin: 0;
  line-height: 1.6;
}
`
  }

  return `:root {
  --font-sans: system-ui, -apple-system, sans-serif;
  --color-primary: #2563eb;
  --color-text: #1a1a2e;
  --color-muted: #6b7280;
  --color-border: #e5e7eb;
  --max-width: 48rem;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-sans);
  color: var(--color-text);
  line-height: 1.6;
}

header {
  border-bottom: 1px solid var(--color-border);
  padding: 1rem 1.5rem;
}

header nav {
  max-width: var(--max-width);
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

header a { color: inherit; text-decoration: none; }
header nav .links { display: flex; gap: 1rem; }
header nav .links a:hover { color: var(--color-primary); }

main {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 3rem 1.5rem;
}

h1 { font-size: 1.875rem; font-weight: 700; margin-bottom: 1rem; }
h2 { font-size: 1.25rem; font-weight: 600; margin-top: 2rem; margin-bottom: 0.75rem; }

.intro { font-size: 1.125rem; color: var(--color-muted); margin-bottom: 2rem; }

footer {
  border-top: 1px solid var(--color-border);
  padding: 2rem 1.5rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--color-muted);
}
`
}

function cmsInit(): string {
  return `import { renderContent } from '@krantho/core'
import { createContentLoader } from '@krantho/server-sveltekit'
import config from '../../krantho.config'
import { collections } from '../../krantho.collections'

// Pages read the live (published) version of each document from the database
// the API route opens: both resolve this app's configuration.
const loader = createContentLoader({ config, collections })

/** A published document, rendered for a page */
export interface PageContent {
  fields: Record<string, unknown>
  html: string
}

/** The published version of a document; null when it has none */
export async function loadContent(collection: string, slug: string): Promise<PageContent | null> {
  const doc = await loader.getPublished({ collection, slug })
  if (!doc) return null
  const { html } = await renderContent(doc.fields, doc.body)
  return { fields: doc.fields, html }
}
`
}

/** With SEO chosen, a page's own structured data is a group of its metadata, edited in Data mode */
function kranthoCollections(options: ProjectOptions): string {
  const seoSlot = options.seo ? ', seo: { archetype: structuredDataMetadata }' : ''
  const imports = options.seo
    ? `import {
  defineCollection,
  defineDocumentArchetype,
  sharingMetadata,
  structuredDataMetadata,
} from '@krantho/schema'`
    : "import { defineCollection, defineDocumentArchetype, sharingMetadata } from '@krantho/schema'"
  return `import { join } from 'path'
${imports}
import { z } from 'zod'

// The collections this site serves — shared by the API route and the page loader,
// so whichever a fresh deployment serves first imports the same content.

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: join(process.cwd(), 'content', 'pages'),
  archetype: defineDocumentArchetype({
    id: 'site/pages', label: 'Page',
    fields: z.object({
    title: z.string(),
    description: z.string(),

    }),
    metadata: { sharing: { archetype: sharingMetadata }${seoSlot} },
  }),
})

const globals = defineCollection({
  name: 'globals',
  source: 'filesystem',
  directory: join(process.cwd(), 'content', 'globals'),
  archetype: defineDocumentArchetype({
    id: 'site/globals', label: 'Shared content',
    fields: z.object({
    'logo-name': z.string().optional(),
    'logo-subtitle': z.string().optional(),
    'nav-home': z.string().optional(),
    'nav-about': z.string().optional(),
    'footer-title': z.string().optional(),
    'footer-description': z.string().optional(),
    'footer-copyright-text': z.string().optional(),
    }),
    metadata: { sharing: { archetype: sharingMetadata } },
  }),
})

export const collections = { pages, globals }
`
}

/**
 * A root route search engines look for (/sitemap.xml, /robots.txt), answered
 * by the krantho API, which builds it from the published content and site.baseUrl
 */
function seoRoute(apiPath: string): string {
  return `import type { RequestHandler } from '@sveltejs/kit'

// Search engines look for this file at the site root; the krantho API builds it.
export const GET: RequestHandler = ({ fetch }) => fetch('${apiPath}')
`
}

function apiHandler(): string {
  return `import { createApiHandlers } from '@krantho/server-sveltekit'
import config from '../../../../krantho.config'
import { collections } from '../../../../krantho.collections'

export const { GET, POST, PUT, DELETE } = createApiHandlers({
  config,
  collections,
})
`
}

/** Studio, which the project tells its owner to open at /studio */
function studioHandler(): string {
  return `import { createStudioHandler } from '@krantho/server-sveltekit'
import config from '../../../../krantho.config'

export const { GET } = createStudioHandler({ config })
`
}

function kranthoConfig(options: ProjectOptions): string {
  const authLines = options.auth
    ? `
  // Token mode — the secret comes from KRANTHO_API_TOKEN in the environment.
  auth: { mode: 'token' },`
    : ''

  return `import { defineKranthoConfig } from '@krantho/config'

/**
 * Site configuration — data only. Every value here can be overridden from the
 * environment; \`KRANTHO_SITE_BASE_URL\` overrides \`site.baseUrl\`, and so on.
 * Collections live in krantho.collections.ts; plugins are wiring in the route
 * file. The media file store is chosen by \`media.provider\`.
 */
export default defineKranthoConfig({
  site: {
    domain: 'localhost',
    name: '${options.name}',
    language: 'en',
    baseUrl: 'http://localhost:${options.port}',
    supportedLocales: ['en'],
    defaultLocale: 'en',
  },
  // Uploads go to static/uploads, which SvelteKit serves at /uploads
  media: { provider: 'local', local: { dir: 'static/uploads' } },${authLines}
})
`
}

function layoutServer(): string {
  return `import { loadContent } from '#lib/cms.ts'

export async function load() {
  const nav = await loadContent('globals', 'navigation')
  const footer = await loadContent('globals', 'footer')
  return {
    nav: nav?.fields ?? {},
    footer: footer?.fields ?? {},
  }
}
`
}

function layoutSvelte(options: ProjectOptions): string {
  const tailwindImport =
    options.ui === 'tailwind' ? `  import '../app.css'\n` : `  import '../app.css'\n`

  return `<script lang="ts">
${tailwindImport}  import type { Snippet } from 'svelte'

  interface Props {
    data: {
      nav: Record<string, unknown>
      footer: Record<string, unknown>
    }
    children: Snippet
  }

  let { data, children }: Props = $props()
  const nav = $derived(data.nav)
  const footer = $derived(data.footer)
</script>

<header>
  <nav>
    <a href="/">
      <strong>{nav['logo-name'] ?? '${options.name}'}</strong>
      {#if nav['logo-subtitle']}
        <span> &mdash; {nav['logo-subtitle']}</span>
      {/if}
    </a>
    <div class="links">
      <a href="/">{nav['nav-home'] ?? 'Home'}</a>
      <a href="/about">{nav['nav-about'] ?? 'About'}</a>
    </div>
  </nav>
</header>

<main>
  {@render children()}
</main>

<footer>
  <p>{footer['footer-title'] ?? '${options.name}'}</p>
  {#if footer['footer-description']}
    <p>{footer['footer-description']}</p>
  {/if}
  <p>{footer['footer-copyright-text'] ?? ''}</p>
</footer>
`
}

function homePageServer(): string {
  return `import { loadContent } from '#lib/cms.ts'
import { error } from '@sveltejs/kit'

export async function load() {
  const page = await loadContent('pages', 'home')
  if (!page) error(404, 'Page not found')
  return {
    fields: page.fields,
    html: page.html,
  }
}
`
}

function homePage(): string {
  return `<script lang="ts">
  interface Props {
    data: {
      fields: Record<string, unknown>
      html: string
    }
  }

  let { data }: Props = $props()
  const fm = $derived(data.fields)
</script>

<article>
  <h1>{fm['title'] ?? 'Home'}</h1>
  <div class="prose">{@html data.html}</div>
</article>
`
}

function dynamicPageServer(): string {
  return `import { loadContent } from '#lib/cms.ts'
import { error } from '@sveltejs/kit'

export async function load({ params }: { params: { slug: string } }) {
  const page = await loadContent('pages', params.slug)
  if (!page) error(404, 'Page not found')
  return {
    fields: page.fields,
    html: page.html,
  }
}
`
}

function dynamicPage(): string {
  return `<script lang="ts">
  interface Props {
    data: {
      fields: Record<string, unknown>
      html: string
    }
  }

  let { data }: Props = $props()
  const fm = $derived(data.fields)
</script>

<article>
  <h1>{fm['title'] ?? 'Page'}</h1>
  <div class="prose">{@html data.html}</div>
</article>
`
}
