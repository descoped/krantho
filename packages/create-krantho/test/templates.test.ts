import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Framework, ProjectOptions } from '../src/prompts.js'
import { generateFiles } from '../src/scaffold.js'

function options(framework: Framework, auth: boolean): ProjectOptions {
  return {
    name: 'my-site',
    framework,
    ui: 'plain',
    auth,
    seo: false,
    sampleContent: false,
    packageManager: 'pnpm',
    port: 3000,
  }
}

function file(files: Map<string, string>, path: string): string {
  const content = files.get(path)
  if (content === undefined) throw new Error(`missing generated file ${path}`)
  return content
}

describe.each<Framework>(['nextjs', 'sveltekit'])('%s template auth', (framework) => {
  it('sets token mode in krantho.config.ts when auth is chosen', () => {
    const files = generateFiles(options(framework, true))

    expect(file(files, 'krantho.config.ts')).toContain(`auth: { mode: 'token' },`)
    expect(file(files, '.env')).toContain('KRANTHO_API_TOKEN=')
  })

  it('leaves auth out of krantho.config.ts and .env when auth is not chosen', () => {
    const files = generateFiles(options(framework, false))

    expect(file(files, 'krantho.config.ts')).not.toContain('auth:')
    expect(file(files, '.env')).not.toContain('KRANTHO_API_TOKEN')
  })
})

describe.each<[Framework, string]>([
  ['nextjs', `media: { provider: 'local' },`],
  ['sveltekit', `media: { provider: 'local', local: { dir: 'static/uploads' } },`],
])('%s template media', (framework, media) => {
  it('keeps media on local disk in krantho.config.ts', () => {
    const files = generateFiles(options(framework, false))

    expect(file(files, 'krantho.config.ts')).toContain(media)
  })
})

describe('sveltekit dev script', () => {
  it('loads .env into process.env so the token secret reaches the config resolver', () => {
    const pkg = JSON.parse(file(generateFiles(options('sveltekit', true)), 'package.json'))

    expect(pkg.scripts.dev).toContain('--env-file-if-exists=.env')
  })
})

describe.each<[Framework, string]>([
  ['nextjs', 'app/studio/[[...slug]]/route.ts'],
  ['sveltekit', 'src/routes/studio/[...path]/+server.ts'],
])('%s template Studio route', (framework, route) => {
  it('serves Studio at /studio, the address the closing message names', () => {
    const files = generateFiles(options(framework, false))
    const handler = framework === 'nextjs' ? 'createStudioRouteHandler' : 'createStudioHandler'

    expect(file(files, route)).toContain(`export const { GET } = ${handler}({ config })`)
    expect(file(files, route)).toContain("krantho.config'")
    expect(file(files, 'README.md')).toContain('/studio')
  })
})

describe.each<[Framework, string, string]>([
  ['nextjs', 'app/api/[...path]/route.ts', 'lib/krantho.ts'],
  ['sveltekit', 'src/routes/api/[...path]/+server.ts', 'src/lib/cms.ts'],
])('%s template collections', (framework, route, loader) => {
  it('shares one collections module between the API route and the page loader', () => {
    const files = generateFiles(options(framework, false))

    expect(file(files, 'krantho.collections.ts')).toContain('export const collections = {')
    expect(file(files, route)).toContain("krantho.collections'")
    expect(file(files, loader)).toContain('createContentLoader({ config, collections })')
  })

  it('gives the pages a structured data group when SEO is chosen, and nothing of it otherwise', () => {
    const withSeo = file(
      generateFiles({ ...options(framework, false), seo: true }),
      'krantho.collections.ts',
    )
    expect(withSeo).toContain('structuredDataMetadata,\n} from')
    expect(withSeo).toContain('seo: { archetype: structuredDataMetadata }')
    // Only pages render: the shared globals have nothing to describe to a search engine
    expect(withSeo.match(/archetype: structuredDataMetadata/g)).toHaveLength(1)

    const withoutSeo = file(generateFiles(options(framework, false)), 'krantho.collections.ts')
    expect(withoutSeo).not.toContain('structuredDataMetadata')
  })
})

describe.each<Framework>(['nextjs', 'sveltekit'])(
  '%s template Claude Code settings',
  (framework) => {
    it('registers the krantho marketplace from GitHub and enables the krantho plugin', () => {
      const settings = JSON.parse(
        file(generateFiles(options(framework, false)), '.claude/settings.json'),
      )

      expect(settings).toEqual({
        extraKnownMarketplaces: {
          krantho: { source: { source: 'github', repo: 'descoped/krantho' } },
        },
        enabledPlugins: { 'krantho@krantho': true },
      })
    })
  },
)

describe('pnpm build approval', () => {
  it('allows better-sqlite3 to build under pnpm 10 and pnpm 11 or later', () => {
    const settings = file(generateFiles(options('nextjs', false)), 'pnpm-workspace.yaml')

    expect(settings).toContain('onlyBuiltDependencies:\n  - better-sqlite3\n')
    expect(settings).toContain('allowBuilds:\n  better-sqlite3: true\n')
  })

  it('writes no pnpm settings for another package manager', () => {
    const files = generateFiles({ ...options('sveltekit', false), packageManager: 'npm' })

    expect(files.has('pnpm-workspace.yaml')).toBe(false)
  })
})

describe('nextjs template sitemap and robots.txt', () => {
  it('serves both at the site root from the krantho API', () => {
    const config = file(generateFiles(options('nextjs', false)), 'next.config.ts')

    expect(config).toContain("{ source: '/robots.txt', destination: '/api/seo/robots.txt' }")
    expect(config).toContain("{ source: '/sitemap.xml', destination: '/api/seo/sitemap' }")
  })
})

describe('sveltekit template sitemap and robots.txt', () => {
  it('serves both at the site root from the krantho API', () => {
    const files = generateFiles(options('sveltekit', false))

    expect(file(files, 'src/routes/sitemap.xml/+server.ts')).toContain("fetch('/api/seo/sitemap')")
    expect(file(files, 'src/routes/robots.txt/+server.ts')).toContain(
      "fetch('/api/seo/robots.txt')",
    )
  })
})

describe.each<Framework>(['nextjs', 'sveltekit', 'nextjs-static'])(
  '%s template krantho versions',
  (framework) => {
    it('depends on the krantho release the scaffolder belongs to', () => {
      const own = JSON.parse(
        readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
      ) as {
        version: string
      }
      const deps = JSON.parse(file(generateFiles(options(framework, false)), 'package.json'))
        .dependencies as Record<string, string>

      const krantho = Object.entries(deps).filter(([name]) => name.startsWith('@krantho/'))
      expect(krantho.length).toBeGreaterThan(0)
      for (const [, range] of krantho) expect(range).toBe(`^${own.version}`)
    })
  },
)

describe('nextjs-static template', () => {
  const files = generateFiles({
    ...options('nextjs-static', false),
    packageManagerSpec: 'pnpm@12.1.0',
  })

  it('builds the site to static files under the path of its address', () => {
    const config = file(files, 'next.config.ts')

    expect(config).toContain("output: 'export'")
    expect(config).toContain(
      'basePath: basePathOf(resolveConfig(kranthoConfig, process.env).site.baseUrl)',
    )
    expect(config).toContain('trailingSlash: true')
    expect(file(files, 'krantho.config.ts')).toContain("persistence: { provider: 'filesystem' }")
    expect(file(files, 'krantho.collections.ts')).toContain("path: '/:slug/'")
  })

  it('has no API, Studio or database', () => {
    const paths = [...files.keys()]

    expect(
      paths.some((path) => path.startsWith('app/api/') || path.startsWith('app/studio/')),
    ).toBe(false)
    expect(paths.some((path) => path.startsWith('content/pages/'))).toBe(false)
    const deps = JSON.parse(file(files, 'package.json')).dependencies as Record<string, string>
    expect(Object.keys(deps)).toContain('@krantho/static')
    expect(Object.keys(deps)).not.toContain('@krantho/next')
    expect(files.has('.env')).toBe(false)
  })

  it('renders markdown links between files as the site’s addresses', () => {
    expect(file(files, 'lib/krantho.ts')).toContain('initServerLoader(site.loader, site.rendering)')
    expect(file(files, 'app/globals.css')).toContain('.prose table')
  })

  it('publishes to GitHub Pages from the whole history, with the address Pages gives', () => {
    const workflow = file(files, '.github/workflows/pages.yml')

    expect(workflow).toContain('fetch-depth: 0')
    expect(workflow).toContain('uses: pnpm/action-setup@v6')
    expect(workflow).toContain('KRANTHO_SITE_BASE_URL: ${{ steps.pages.outputs.base_url }}')
    expect(workflow).toContain('uses: actions/upload-pages-artifact@v5')
    expect(workflow).toContain('uses: actions/deploy-pages@v5')
    expect(JSON.parse(file(files, 'package.json')).packageManager).toBe('pnpm@12.1.0')
  })

  it('installs with npm in the workflow of an npm project', () => {
    const npm = generateFiles({ ...options('nextjs-static', false), packageManager: 'npm' })
    const workflow = file(npm, '.github/workflows/pages.yml')

    expect(workflow).toContain('run: npm ci')
    expect(workflow).not.toContain('pnpm/action-setup')
    expect(JSON.parse(file(npm, 'package.json')).packageManager).toBeUndefined()
  })

  it('writes the sitemap, llms.txt and robots.txt at build', () => {
    for (const route of [
      'app/sitemap.xml/route.ts',
      'app/llms.txt/route.ts',
      'app/robots.txt/route.ts',
    ]) {
      expect(file(files, route)).toContain("export const dynamic = 'force-static'")
    }
  })
})
