import type { ProjectOptions } from '../prompts.js'
import { KRANTHO_RANGE } from '../version.js'
import { sortObject } from './nextjs.js'
import { generateStaticAppFiles } from './nextjs-static-app.js'
import { generateStaticContentFiles } from './static-content.js'

/**
 * A static documentation site: Next.js writes every page to `out/` at build
 * time from the markdown in `content/docs`, and a GitHub Actions workflow
 * publishes it to GitHub Pages. No database, API or Studio.
 */
export function generateNextjsStaticFiles(options: ProjectOptions): Map<string, string> {
  const files = new Map<string, string>([
    ['package.json', packageJson(options)],
    ['tsconfig.json', tsconfig()],
    ['next.config.ts', nextConfig()],
    ['krantho.config.ts', kranthoConfig(options)],
    ['krantho.collections.ts', kranthoCollections()],
    ['lib/krantho.ts', kranthoInit()],
  ])
  for (const [path, content] of generateStaticAppFiles()) files.set(path, content)
  for (const [path, content] of generateStaticContentFiles(options)) files.set(path, content)
  return files
}

function packageJson(options: ProjectOptions): string {
  const deps: Record<string, string> = {
    '@krantho/config': KRANTHO_RANGE,
    '@krantho/schema': KRANTHO_RANGE,
    '@krantho/seo': KRANTHO_RANGE,
    '@krantho/static': KRANTHO_RANGE,
    '@krantho/ui-react': KRANTHO_RANGE,
    next: '^16.4.6',
    react: '^19.3.1',
    'react-dom': '^19.3.1',
    zod: '^4.6.7',
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
    // The Pages workflow installs with the same package manager
    ...(options.packageManagerSpec ? { packageManager: options.packageManagerSpec } : {}),
    scripts: {
      dev: `next dev --port ${options.port}`,
      build: 'next build',
    },
    dependencies: sortObject(deps),
    devDependencies: sortObject(devDeps),
  }
  return `${JSON.stringify(pkg, null, 2)}\n`
}

function tsconfig(): string {
  const config = {
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
      jsx: 'react-jsx',
      incremental: true,
      plugins: [{ name: 'next' }],
    },
    include: [
      'next-env.d.ts',
      '**/*.ts',
      '**/*.tsx',
      '.next/types/**/*.ts',
      '.next/dev/types/**/*.ts',
    ],
    exclude: ['node_modules', 'out'],
  }
  return `${JSON.stringify(config, null, 2)}\n`
}

function nextConfig(): string {
  return `import { resolveConfig } from '@krantho/config'
import { basePathOf } from '@krantho/static/base-path'
import type { NextConfig } from 'next'
import kranthoConfig from './krantho.config'

// \`next build\` writes the site to out/ as static files. They are served under
// the path of site.baseUrl: /<repository> on a GitHub Pages project site, and
// none on a custom domain. Each page is a folder (about/index.html), which
// every static host serves at /about/.
const nextConfig: NextConfig = {
  output: 'export',
  basePath: basePathOf(resolveConfig(kranthoConfig, process.env).site.baseUrl),
  trailingSlash: true,
  images: { unoptimized: true },
  // Loaded by Node at build, not bundled: they load optional packages on demand
  serverExternalPackages: ['@krantho/static', '@krantho/server'],
}

export default nextConfig
`
}

function kranthoConfig(options: ProjectOptions): string {
  return `import { defineKranthoConfig } from '@krantho/config'

/**
 * Site configuration. Every value can be overridden from the environment: the
 * GitHub Pages workflow sets KRANTHO_SITE_BASE_URL to the address Pages serves
 * the site at, and its path is the path every page is served under.
 */
export default defineKranthoConfig({
  site: {
    domain: 'localhost',
    name: '${options.name}',
    description: 'Documentation for ${options.name}.',
    language: 'en',
    baseUrl: 'http://localhost:${options.port}',
  },
  // The markdown files are the content: no database, every page written at build
  persistence: { provider: 'filesystem' },
  cache: { pages: 'none' },
  // The structured data each page carries
  seo: { identity: 'WebSite', collections: { docs: ['TechArticle'] } },
})
`
}

function kranthoCollections(): string {
  return `import { join } from 'node:path'
import { defineCollection, defineDocumentArchetype } from '@krantho/schema'
import { z } from 'zod'

// One markdown file per page in content/docs. index.md is the home page, and
// every other file is served at /<file name>/. The path ends in a slash: each
// page is a folder in the static output.
const docs = defineCollection({
  name: 'docs',
  source: 'filesystem',
  directory: join(process.cwd(), 'content', 'docs'),
  path: '/:slug/',
  archetype: defineDocumentArchetype({
    id: 'site/docs',
    label: 'Docs',
    fields: z.object({
      title: z.string(),
      description: z.string(),
      group: z.string().describe('The sidebar group the page is listed under').optional(),
      order: z.number().describe("The page's place in its group").optional(),
    }),
  }),
})

export const collections = { docs }
`
}

function kranthoInit(): string {
  return `import { createStaticSite } from '@krantho/static'
import { initServerLoader } from '@krantho/ui-react/server'
import config from '../krantho.config'
import { collections } from '../krantho.collections'

// Pages read the markdown in content/docs through the site's loader. Links and
// images in the markdown that start at the site's root (/setup/) get the path
// the site is served under, as next/link does for the site's own links.
export const site = createStaticSite({ config, collections })
initServerLoader(site.loader, { basePath: site.basePath })

/** A docs page as the sidebar and the pager list it */
export interface DocLink {
  slug: string
  title: string
  href: string
  group: string
}

/** The address of a docs page: index.md is the home page */
export function docHref(slug: string): string {
  return slug === 'index' ? '/' : \`/\${slug}/\`
}

const orderOf = (fields: Record<string, unknown>): number =>
  typeof fields.order === 'number' ? fields.order : Number.MAX_SAFE_INTEGER

/**
 * The published docs pages in reading order: the home page, then each group
 * where its first page falls, and the pages of a group by \`order\`, then title
 */
export async function docLinks(): Promise<DocLink[]> {
  const docs = await site.loader.listPublishedSummaries('docs')
  const sorted = [...docs].sort(
    (a, b) =>
      orderOf(a.fields) - orderOf(b.fields) ||
      String(a.fields.title).localeCompare(String(b.fields.title)),
  )
  const groups: string[] = []
  for (const doc of sorted) {
    const group = typeof doc.fields.group === 'string' ? doc.fields.group : ''
    if (!groups.includes(group)) groups.push(group)
  }
  const links = sorted.map((doc) => ({
    slug: doc.slug,
    title: String(doc.fields.title),
    href: docHref(doc.slug),
    group: typeof doc.fields.group === 'string' ? doc.fields.group : '',
  }))
  const home = links.filter((link) => link.slug === 'index')
  const rest = links.filter((link) => link.slug !== 'index')
  return [...home, ...groups.flatMap((group) => rest.filter((link) => link.group === group))]
}
`
}
