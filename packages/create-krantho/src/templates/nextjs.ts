import type { ProjectOptions } from '../prompts.js'
import { KRANTHO_RANGE } from '../version.js'

export function generateNextjsFiles(options: ProjectOptions): Map<string, string> {
  const files = new Map<string, string>()

  files.set('package.json', packageJson(options))
  files.set('tsconfig.json', tsconfig())
  files.set('next.config.ts', nextConfig())
  files.set('krantho.config.ts', kranthoConfig(options))
  files.set('krantho.collections.ts', kranthoCollections(options))
  files.set('lib/krantho.ts', kranthoInit())
  files.set('app/api/[...path]/route.ts', apiRoute())
  files.set('app/studio/[[...slug]]/route.ts', studioRoute())
  files.set('app/layout.tsx', rootLayout(options))
  files.set('app/(site)/layout.tsx', siteLayout(options))
  files.set('app/(site)/[[...slug]]/page.tsx', page(options))
  files.set('app/globals.css', globalsCss(options))

  if (options.ui === 'tailwind') {
    files.set('postcss.config.mjs', postcssConfig())
  }

  return files
}

function packageJson(options: ProjectOptions): string {
  // `@krantho/next` is the one-install umbrella — it bundles server-next,
  // ui-react, studio, media-local, and seo so a single dependency provisions the
  // full stack. The packages the generated source imports *by name*
  // (config, server-next, ui-react, schema) are also listed
  // explicitly so the project resolves under a strict, non-hoisted
  // node_modules layout where transitive deps are not directly importable.
  const deps: Record<string, string> = {
    '@krantho/config': KRANTHO_RANGE,
    '@krantho/next': KRANTHO_RANGE,
    '@krantho/server-next': KRANTHO_RANGE,
    '@krantho/ui-react': KRANTHO_RANGE,
    '@krantho/schema': KRANTHO_RANGE,
    next: '^16.4.6',
    react: '^19.3.1',
    'react-dom': '^19.3.1',
    zod: '^4.6.7',
  }

  if (options.ui === 'tailwind') {
    deps.tailwindcss = '^4.3.5'
    deps['@tailwindcss/postcss'] = '^4.3.5'
  }

  if (options.ui === 'mui') {
    deps['@mui/material'] = '^9.5.0'
    deps['@emotion/react'] = '^11.14.0'
    deps['@emotion/styled'] = '^11.14.1'
  }

  const devDeps: Record<string, string> = {
    '@types/node': '^26.6.6',
    '@types/react': '^19.3.0',
    typescript: '^7.0.2',
  }

  const pkg = {
    name: options.name,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: `next dev --port ${options.port}`,
      build: 'next build',
      start: 'next start',
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
        compilerOptions: {
          target: 'ES2022',
          lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'preserve',
          incremental: true,
          plugins: [{ name: 'next' }],
          paths: { '@/*': ['./*'] },
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      },
      null,
      2,
    ) + '\n'
  )
}

function nextConfig(): string {
  return `import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'better-sqlite3',
    '@krantho/server',
    '@krantho/server-next',
  ],
  // Search engines look for /robots.txt and /sitemap.xml at the site root; the
  // krantho API builds both from the published content and site.baseUrl.
  async rewrites() {
    return [
      { source: '/robots.txt', destination: '/api/seo/robots.txt' },
      { source: '/sitemap.xml', destination: '/api/seo/sitemap' },
    ]
  },
}

export default nextConfig
`
}

function kranthoInit(): string {
  return `import { notFound } from 'next/navigation'
import { createContentLoader } from '@krantho/server-next'
import { getCMSContent, initServerLoader, NetworkError } from '@krantho/ui-react/server'
import type { CMSContent } from '@krantho/ui-react/server'
import config from '../krantho.config'
import { collections } from '../krantho.collections'

// Server-rendered pages read the database the API route opens: both resolve this
// app's configuration and open persistence through the same factory.
initServerLoader(createContentLoader({ config, collections }))

/** A page's published content; a document with no published version answers 404 */
export async function requirePublished(collection: string, slug: string): Promise<CMSContent> {
  try {
    return await getCMSContent(collection, slug)
  } catch (error) {
    if (error instanceof NetworkError && error.status === 404) notFound()
    throw error
  }
}

/** A global's published fields; none when it is not published */
export async function globalFields(slug: string): Promise<Record<string, unknown>> {
  try {
    return (await getCMSContent('globals', slug)).fields
  } catch {
    return {}
  }
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

function apiRoute(): string {
  return `import { createApiRouteHandlers } from '@krantho/server-next'
import config from '../../../krantho.config'
import { collections } from '../../../krantho.collections'

export const { GET, POST, PUT, DELETE } = createApiRouteHandlers({
  config,
  collections,
})
`
}

/** Studio, which the project tells its owner to open at /studio */
function studioRoute(): string {
  return `import { createStudioRouteHandler } from '@krantho/server-next'
import config from '../../../krantho.config'

export const { GET } = createStudioRouteHandler({ config })
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
  // Pages stay cached until a content change invalidates them
  cache: { pages: 'next-isr' },
  // Uploads go to public/uploads, which Next.js serves at /uploads
  media: { provider: 'local' },${authLines}
})
`
}

function rootLayout(options: ProjectOptions): string {
  return `import './globals.css'

export const metadata = {
  title: '${options.name}',
}

// The root layout reads no content: the build prerenders the 404 page through
// it, and the build cannot reach the database.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`
}

function siteLayout(options: ProjectOptions): string {
  return `import { showPreviewBanner } from '@krantho/server-next'
import { globalFields } from '@/lib/krantho'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const navFm = await globalFields('navigation')
  const footerFm = await globalFields('footer')
  // An editor previewing drafts ("Preview on site" in Studio)
  const previewing = await showPreviewBanner()

  return (
    <>
      {previewing && (
        <p className="preview-banner">
          Previewing drafts — <a href="/api/preview/exit">Exit preview</a>
        </p>
      )}
      <header>
        <nav>
          <a href="/">
            <strong>{String(navFm['logo-name'] ?? '${options.name}')}</strong>
            {Boolean(navFm['logo-subtitle']) && <span> &mdash; {String(navFm['logo-subtitle'])}</span>}
          </a>
          <div>
            <a href="/">{String(navFm['nav-home'] ?? 'Home')}</a>
            <a href="/about">{String(navFm['nav-about'] ?? 'About')}</a>
          </div>
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        <p>{String(footerFm['footer-title'] ?? '${options.name}')}</p>
        {Boolean(footerFm['footer-description']) && <p>{String(footerFm['footer-description'])}</p>}
        <p>{String(footerFm['footer-copyright-text'] ?? '')}</p>
      </footer>
    </>
  )
}
`
}

function page(options: ProjectOptions): string {
  const seoImport = options.seo ? ', SeoJsonLd' : ''
  const seoComponent = options.seo ? `\n      <SeoJsonLd collection="pages" slug={slug} />` : ''

  return `import { notFound } from 'next/navigation'
import { CMSMarkdownServer${seoImport} } from '@krantho/ui-react/server'
import { requirePublished } from '@/lib/krantho'

// Every page of the \`pages\` collection. None is rendered at build — the build
// never reads the database. Each renders on its first request and stays cached
// until Studio changes what it shows (\`cache.pages: 'next-isr'\`).
export const revalidate = false

export function generateStaticParams(): { slug: string[] }[] {
  return []
}

interface PageProps {
  params: Promise<{ slug?: string[] | undefined }>
}

/** \`/\` is the home page; any other page is one path segment */
function pageSlug(path: string[] | undefined): string {
  if (!path) return 'home'
  const [name] = path
  if (path.length !== 1 || !name || name === 'home') notFound()
  return name
}

export default async function Page({ params }: PageProps) {
  const slug = pageSlug((await params).slug)
  const page = await requirePublished('pages', slug)

  return (
    <article>${seoComponent}
      <h1>{String(page.fields['title'] ?? slug)}</h1>
      <CMSMarkdownServer collection="pages" slug={slug} />
    </article>
  )
}
`
}

function globalsCss(options: ProjectOptions): string {
  if (options.ui === 'tailwind') {
    return `@import 'tailwindcss';

:root {
  --font-sans: system-ui, -apple-system, sans-serif;
  --color-primary: #2563eb;
  --color-text: #1a1a2e;
  --color-muted: #6b7280;
  --color-bg: #ffffff;
  --color-surface: #f9fafb;
  --color-border: #e5e7eb;
}

body {
  font-family: var(--font-sans);
  color: var(--color-text);
  background: var(--color-bg);
  margin: 0;
  line-height: 1.6;
}

header {
  @apply border-b border-gray-200 px-6 py-4;
}

header nav {
  @apply max-w-5xl mx-auto flex items-center justify-between;
}

header nav a {
  @apply text-inherit no-underline;
}

header nav div {
  @apply flex gap-4;
}

header nav div a:hover {
  @apply text-blue-600;
}

main {
  @apply max-w-3xl mx-auto px-6 py-12;
}

article h1 {
  @apply text-3xl font-bold mb-4;
}

article h2 {
  @apply text-xl font-semibold mt-8 mb-3;
}

article .intro {
  @apply text-lg text-gray-600 mb-8;
}

article ul {
  @apply list-disc pl-6 mb-4;
}

article li {
  @apply mb-1;
}

article a {
  @apply text-blue-600 underline;
}

footer {
  @apply border-t border-gray-200 px-6 py-8 text-center text-sm text-gray-500;
}
`
  }

  // Plain CSS or MUI — minimal base styles
  return `:root {
  --font-sans: system-ui, -apple-system, sans-serif;
  --color-primary: #2563eb;
  --color-text: #1a1a2e;
  --color-muted: #6b7280;
  --color-bg: #ffffff;
  --color-surface: #f9fafb;
  --color-border: #e5e7eb;
  --max-width: 48rem;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-sans);
  color: var(--color-text);
  background: var(--color-bg);
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

header nav a {
  color: inherit;
  text-decoration: none;
}

header nav div {
  display: flex;
  gap: 1rem;
}

header nav div a:hover {
  color: var(--color-primary);
}

main {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 3rem 1.5rem;
}

article h1 {
  font-size: 1.875rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

article h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 2rem;
  margin-bottom: 0.75rem;
}

article .intro {
  font-size: 1.125rem;
  color: var(--color-muted);
  margin-bottom: 2rem;
}

article ul {
  list-style: disc;
  padding-left: 1.5rem;
  margin-bottom: 1rem;
}

article li { margin-bottom: 0.25rem; }

article a {
  color: var(--color-primary);
  text-decoration: underline;
}

article strong { font-weight: 600; }

footer {
  border-top: 1px solid var(--color-border);
  padding: 2rem 1.5rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--color-muted);
}
`
}

function postcssConfig(): string {
  return `export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
`
}

function sortObject(obj: Record<string, string>): Record<string, string> {
  const sorted: Record<string, string> = {}
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key]
    // `key` came from `Object.keys(obj)` so it is guaranteed to be present —
    // but noUncheckedIndexedAccess treats the lookup as `string | undefined`.
    // Explicit guard instead of a non-null assertion keeps the check visible.
    if (value !== undefined) sorted[key] = value
  }
  return sorted
}
