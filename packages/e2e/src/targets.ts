import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** How a target renders an editor's draft of a page: none when it renders no drafts */
export type PreviewKind = 'draft-mode' | 'signed-url' | null

/**
 * The collection the cross-target specs write documents to: one whose documents render as
 * pages at `/<index>/<slug>`, grounded in the target's own templates.
 */
export interface TargetPages {
  /** The collection's name */
  collection: string
  /** Where a document of the collection renders */
  path: (slug: string) => string
  /** Every field the collection's schema requires, for a new document with this title */
  fields: (title: string) => Record<string, unknown>
  /** A text field the document's page renders and marks in a preview, beside `title` */
  shown: string
  /** A schema field the document's page does not render, so nothing marks it */
  unmarked: string
  /** The `pages` document that lists the collection: its index page */
  index: string
  /** The link on a document's page back to the index, by its accessible name */
  indexLink: RegExp
}

/** A site the suite runs against: one Playwright project, served by its production build */
export interface E2eTarget {
  /** The Playwright project name */
  name: string
  /** The target's directory, relative to the repository root */
  dir: string
  /** The e2e port: the target's dev port plus 100 */
  port: number
  /** The command that starts the target's server on its e2e port, run in `dir` */
  command: string
  /** Settings the server needs to answer on its e2e port, beside the harness's own */
  env: Record<string, string>
  /** How the target previews drafts (§9 of the Studio spec) */
  preview: PreviewKind
  /** Where the target serves its sitemap */
  sitemap: string
  /**
   * Whether the target's pages render the published content from krantho. react-spa renders
   * JSON generated from the markdown files at build time, so a publish never reaches its pages.
   */
  rendersPublished: boolean
  /** The collection the cross-target specs write to */
  pages: TargetPages
}

/** The shared example content's services: `/services/<slug>`, back to the list by "All Services" */
const SERVICES: TargetPages = {
  collection: 'services',
  path: (slug) => `/services/${slug}`,
  fields: (title) => ({
    title,
    description: `${title}, as search results describe it`,
    ingress: `${title} ingress`,
  }),
  shown: 'ingress',
  unmarked: 'description',
  index: 'services',
  indexLink: /All Services/,
}

/** krantho.com's features: `/features/<slug>`, its hero eyebrow links back to the list */
const FEATURES: TargetPages = {
  collection: 'features',
  path: (slug) => `/features/${slug}`,
  fields: (title) => ({
    title,
    description: `${title}, as search results describe it`,
    benefit: `${title} benefit`,
    icon: 'content',
  }),
  shown: 'benefit',
  unmarked: 'description',
  index: 'features',
  indexLink: /^Features$/,
}

/** adapter-node reads its port from PORT and, behind no proxy, the site's origin from ORIGIN */
function nodeAdapterEnv(port: number): Record<string, string> {
  return { PORT: String(port), ORIGIN: `http://localhost:${port}` }
}

export const TARGETS: readonly E2eTarget[] = [
  {
    name: 'nextjs-shadcn',
    dir: 'examples/nextjs-shadcn',
    port: 4102,
    command: 'pnpm exec next start --port 4102',
    env: {},
    preview: 'draft-mode',
    sitemap: '/api/seo/sitemap',
    rendersPublished: true,
    pages: SERVICES,
  },
  {
    name: 'nextjs-mui',
    dir: 'examples/nextjs-mui',
    port: 4101,
    command: 'pnpm exec next start --port 4101',
    env: {},
    preview: 'draft-mode',
    sitemap: '/api/seo/sitemap',
    rendersPublished: true,
    pages: SERVICES,
  },
  {
    name: 'sveltekit-tailwind',
    dir: 'examples/sveltekit-tailwind',
    port: 4103,
    command: 'node build',
    env: nodeAdapterEnv(4103),
    preview: 'signed-url',
    sitemap: '/sitemap.xml',
    rendersPublished: true,
    pages: SERVICES,
  },
  {
    name: 'sveltekit-shadcn',
    dir: 'examples/sveltekit-shadcn',
    port: 4104,
    command: 'node build',
    env: nodeAdapterEnv(4104),
    preview: 'signed-url',
    sitemap: '/sitemap.xml',
    rendersPublished: true,
    pages: SERVICES,
  },
  {
    name: 'react-ssr',
    dir: 'examples/react-ssr',
    port: 4105,
    // The production server: `NODE_ENV=production` renders from the built `dist/`
    command: 'pnpm run preview',
    env: { PORT: '4105' },
    preview: 'signed-url',
    sitemap: '/sitemap.xml',
    rendersPublished: true,
    pages: SERVICES,
  },
  {
    name: 'react-spa',
    dir: 'examples/react-spa',
    port: 4106,
    // The API and Studio are served by the krantho Vite plugin, which runs in the dev
    // server only: react-spa has no production server for them. Its build writes the
    // content JSON and the sitemap the dev server serves from `public/`.
    command: 'node node_modules/vite/bin/vite.js --port 4106 --strictPort',
    env: {},
    preview: null,
    sitemap: '/sitemap.xml',
    rendersPublished: false,
    pages: SERVICES,
  },
  {
    name: 'krantho-site',
    dir: 'krantho-site',
    port: 4110,
    command: 'pnpm exec next start --port 4110',
    // Served from localhost, so the pages a run publishes are not announced to IndexNow under krantho.com
    env: { KRANTHO_ASSISTANT_ENABLED: 'true', KRANTHO_SITE_BASE_URL: 'http://localhost:4110' },
    preview: 'draft-mode',
    sitemap: '/sitemap.xml',
    rendersPublished: true,
    pages: FEATURES,
  },
]

/** The target a Playwright project runs */
export function targetNamed(name: string): E2eTarget {
  const target = TARGETS.find((candidate) => candidate.name === name)
  if (!target) throw new Error(`No e2e target is named ${name}`)
  return target
}

/**
 * The targets this run starts a server for: the projects named on the command line
 * (`--project <name...>`), else every target. Playwright starts every `webServer` whichever
 * projects run, so a run of one project would otherwise need every target built.
 */
export function selectedTargets(argv: readonly string[] = process.argv): readonly E2eTarget[] {
  const named = argv.flatMap((arg, at) => {
    if (arg.startsWith('--project=')) return [arg.slice('--project='.length)]
    if (arg !== '--project') return []
    // Like Playwright's own option, `--project` takes every value up to the next option
    const rest = argv.slice(at + 1)
    const end = rest.findIndex((value) => value.startsWith('-'))
    return end === -1 ? rest : rest.slice(0, end)
  })
  if (named.length === 0) return TARGETS
  return TARGETS.filter((target) => named.includes(target.name))
}

/** The environment variable holding this run's temporary directory */
const RUN_DIR_ENV = 'E2E_KRANTHO_RUN_DIR'

/**
 * True in the process that opens the run: the Playwright runner, loading the config before
 * any server starts. Workers load the config too, but inherit the run's directory.
 */
export const opensRun = process.env[RUN_DIR_ENV] === undefined

/**
 * The run's temporary directory, created once by the Playwright runner when it
 * loads the config. Workers inherit it through the environment, so every
 * process of one run sees the same directory.
 */
function runDir(): string {
  const existing = process.env[RUN_DIR_ENV]
  if (existing) return existing
  const created = mkdtempSync(join(tmpdir(), 'krantho-e2e-'))
  process.env[RUN_DIR_ENV] = created
  return created
}

/** The data directory a target's server runs on (`KRANTHO_PATHS_DATA_DIR`) */
export function dataDirFor(targetName: string): string {
  return join(runDir(), targetName)
}

/**
 * Variables a target's server must not inherit from the runner: the developer's or CI's own
 * krantho settings (the language-model credentials among them: every provider's own variable
 * is a `KRANTHO_` one), sign-in, other language-model credentials, and the port, host, origin
 * and mode a server reads — a target sets its own in `env`.
 */
const INHERITED_SETTINGS =
  /^(KRANTHO_|OIDC_|ANTHROPIC_|OPENAI_|GEMINI_|GOOGLE_|OPENROUTER_)|^(PORT|HOST|ORIGIN|NODE_ENV)$/

/**
 * Drop those variables from this process's environment. Playwright starts every web server
 * from the runner's `process.env` plus the server's own `env`, so the target then runs on
 * the runner's environment minus these, plus the harness's settings only.
 */
export function dropInheritedSettings(): void {
  for (const name of Object.keys(process.env)) {
    if (INHERITED_SETTINGS.test(name)) delete process.env[name]
  }
}

/** Files and folders Next writes beside its build output for every page it renders and caches */
const NEXT_PAGE_ENTRY = /^(.*?)(\.prefetch\.rsc|\.html|\.rsc|\.meta|\.body|\.segments)$/

/**
 * Remove the page and data cache a Next.js build collected while serving an earlier run, so
 * no page rendered against an old database is served against this run's fresh one. The build
 * itself stays: `.next/cache` goes, and under `.next/server/app` every page entry the build
 * did not prerender (the routes in `prerender-manifest.json`) goes. A target that is not a
 * Next.js build is left alone.
 */
export function clearNextPageCache(targetDir: string): void {
  const nextDir = join(targetDir, '.next')
  const manifestPath = join(nextDir, 'prerender-manifest.json')
  if (!existsSync(manifestPath)) return

  rmSync(join(nextDir, 'cache'), { recursive: true, force: true })

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    routes?: Record<string, unknown>
  }
  const prerendered = new Set(Object.keys(manifest.routes ?? {}))
  const appDir = join(nextDir, 'server', 'app')
  if (!existsSync(appDir)) return

  const stale = readdirSync(appDir, { recursive: true, encoding: 'utf8' })
    .map((entry) => entry.split('\\').join('/'))
    .filter((entry) => !entry.includes('.segments/'))
    .filter((entry) => {
      const match = NEXT_PAGE_ENTRY.exec(entry)
      if (!match?.[1]) return false
      const route = match[1] === 'index' ? '/' : `/${match[1]}`
      return !prerendered.has(route)
    })
  for (const entry of stale) rmSync(join(appDir, entry), { recursive: true, force: true })
}
