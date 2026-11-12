import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  decodeRouteSlug,
  encodeRouteSlug,
  loadConfig,
  readSeoDefinitions,
} from '../src/node/index.js'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'krantho-seo-definitions-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

async function writeYaml(dir: string, filename: string, content: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, filename), content, 'utf-8')
}

// ---------------------------------------------------------------------------
// Directory loader tests
// ---------------------------------------------------------------------------

describe('readSeoDefinitions', () => {
  it('loads site scope with multiple entity files', async () => {
    const siteDir = join(tempDir, 'site')
    await writeYaml(
      siteDir,
      'professional-service.yaml',
      `
"@type": ProfessionalService
role: primary
properties:
  name: Acme
  telephone: "+47 22 00 00 00"
`,
    )
    await writeYaml(
      siteDir,
      'website.yaml',
      `
"@type": WebSite
properties: {}
`,
    )

    const config = readSeoDefinitions(tempDir)
    expect(config.site).toBeDefined()
    expect(config.site?.entities).toHaveLength(2)
    expect(config.site?.entities[0]?.['@type']).toBe('ProfessionalService')
    expect(config.site?.entities[0]?.role).toBe('primary')
    expect(config.site?.entities[0]?.properties['name']).toBe('Acme')
    expect(config.site?.entities[1]?.['@type']).toBe('WebSite')
  })

  it('loads collection scopes', async () => {
    const pagesDir = join(tempDir, 'collections', 'pages')
    await writeYaml(
      pagesDir,
      'article.yaml',
      `
"@type": Article
role: primary
properties: {}
`,
    )
    await writeYaml(
      pagesDir,
      'breadcrumb-list.yaml',
      `
"@type": BreadcrumbList
role: navigation
properties: {}
`,
    )

    const config = readSeoDefinitions(tempDir)
    expect(config.collections).toBeDefined()
    expect(config.collections?.['pages']?.entities).toHaveLength(2)
    expect(config.collections?.['pages']?.entities[0]?.['@type']).toBe('Article')
  })

  it('loads field mappings', async () => {
    const siteDir = join(tempDir, 'site')
    await writeYaml(
      siteDir,
      'professional-service.yaml',
      `
"@type": ProfessionalService
properties: {}
`,
    )
    await writeYaml(
      siteDir,
      '_field-mappings.yaml',
      `
Article.headline: title
Person.name: author-name
`,
    )

    const config = readSeoDefinitions(tempDir)
    expect(config.site?.fieldMappings).toEqual({
      'Article.headline': 'title',
      'Person.name': 'author-name',
    })
  })

  it("reads a scope's page structure from _structure", async () => {
    const docsDir = join(tempDir, 'collections', 'docs')
    await writeYaml(docsDir, 'article.yaml', '"@type": Article\nproperties: {}\n')
    await writeYaml(
      docsDir,
      '_structure.yaml',
      `
trail:
  - name: Docs
    url: /docs
kind: item
`,
    )

    const config = readSeoDefinitions(tempDir)
    expect(config.collections['docs']).toEqual({
      entities: [{ '@type': 'Article', properties: {} }],
      structure: { trail: [{ name: 'Docs', url: '/docs' }], kind: 'item' },
    })
  })

  it('refuses a malformed _structure file, naming it', async () => {
    const docsDir = join(tempDir, 'collections', 'docs')
    await writeYaml(docsDir, '_structure.yaml', 'trail:\n  - url: /docs\n')
    expect(() => readSeoDefinitions(tempDir)).toThrow('_structure.yaml')
  })

  it('loads JSON files', async () => {
    const siteDir = join(tempDir, 'site')
    await writeYaml(
      siteDir,
      'organization.json',
      JSON.stringify({
        '@type': 'Organization',
        properties: { name: 'Test' },
      }),
    )

    const config = readSeoDefinitions(tempDir)
    expect(config.site?.entities[0]?.['@type']).toBe('Organization')
    expect(config.site?.entities[0]?.properties['name']).toBe('Test')
  })

  it('loads route scopes with slug-encoded patterns', async () => {
    const routesDir = join(tempDir, 'routes')
    await writeYaml(
      routesDir,
      'services__strategic____WILD__.yaml',
      `
"@type": Service
role: primary
properties:
  category: Strategic Consulting
`,
    )

    const config = readSeoDefinitions(tempDir)
    expect(config.routes).toBeDefined()
    expect(config.routes?.['/services/strategic/*']?.entities[0]?.properties['category']).toBe(
      'Strategic Consulting',
    )
  })

  it('does not load document metadata from shared policy files', async () => {
    const docsDir = join(tempDir, 'documents', 'pages')
    await writeYaml(
      docsDir,
      'home.yaml',
      `
"@type": Article
properties:
  headline: Custom Home Title
`,
    )

    const config = readSeoDefinitions(tempDir)
    expect(config).not.toHaveProperty('documents')
  })

  it('disambiguates role.type.yaml filenames', async () => {
    const siteDir = join(tempDir, 'site')
    await writeYaml(
      siteDir,
      'author.person.yaml',
      `
"@type": Person
role: author
properties:
  name: Author Name
`,
    )
    await writeYaml(
      siteDir,
      'founder.person.yaml',
      `
"@type": Person
role: founder
properties:
  name: Founder Name
`,
    )

    const config = readSeoDefinitions(tempDir)
    const persons = config.site?.entities.filter((e) => e['@type'] === 'Person') ?? []
    expect(persons).toHaveLength(2)
    const roles = persons.map((p) => p.role).sort()
    expect(roles).toEqual(['author', 'founder'])
  })

  it('produces actionable error for malformed YAML', async () => {
    const siteDir = join(tempDir, 'site')
    await writeYaml(siteDir, 'bad.yaml', '{ invalid yaml:: }}}')

    expect(() => readSeoDefinitions(tempDir)).toThrow(/bad\.yaml/)
  })

  it('produces error for missing @type', async () => {
    const siteDir = join(tempDir, 'site')
    await writeYaml(
      siteDir,
      'missing-type.yaml',
      `
properties:
  name: Test
`,
    )

    expect(() => readSeoDefinitions(tempDir)).toThrow(/missing @type/)
  })

  it('defines nothing for a directory without scope directories', async () => {
    const emptyDir = join(tempDir, 'empty')
    await mkdir(emptyDir, { recursive: true })
    expect(readSeoDefinitions(emptyDir)).toEqual({
      site: null,
      collections: {},
      routes: {},
    })
  })

  it('defines nothing for a directory that does not exist', () => {
    expect(readSeoDefinitions(join(tempDir, 'missing')).site).toBeNull()
  })

  it('rejects a key an entity file does not allow', async () => {
    await writeYaml(join(tempDir, 'site'), 'org.yaml', "'@type': Organization\nnmae: Typo\n")
    expect(() => readSeoDefinitions(tempDir)).toThrow(/org\.yaml/)
  })
})

const CODE = {
  site: { domain: 'example.org', name: 'Example', language: 'en', baseUrl: 'https://example.org' },
}

describe('loadConfig', () => {
  it('should load the same instance for the same code, directory and environment', () => {
    const code = { ...CODE }
    const env = { KRANTHO_SITE_LOGO: 'https://example.org/logo.png' }
    const first = loadConfig({ code, env, cwd: tempDir })
    expect(loadConfig({ code, env: { ...env }, cwd: tempDir })).toBe(first)
    expect(loadConfig({ code, env: {}, cwd: tempDir })).not.toBe(first)
  })

  it('should read the site identity from code and the environment', () => {
    const config = loadConfig({
      code: { site: { ...CODE.site, description: 'Example builds things.' } },
      env: {
        KRANTHO_SITE_LOGO: 'https://example.org/logo.png',
        KRANTHO_SITE_SAME_AS: 'https://github.com/example,https://x.com/example',
      },
      cwd: tempDir,
    })
    expect(config.site.logo).toBe('https://example.org/logo.png')
    expect(config.site.description).toBe('Example builds things.')
    expect(config.site.sameAs).toEqual(['https://github.com/example', 'https://x.com/example'])
    expect(config.sources.get('site.logo')).toBe('env')
  })

  it('should reject an identity value that is not an absolute URL, naming the variable', () => {
    expect(() =>
      loadConfig({ code: { ...CODE }, env: { KRANTHO_SITE_LOGO: 'logo.png' }, cwd: tempDir }),
    ).toThrow(/KRANTHO_SITE_LOGO \(site\.logo\): must be an absolute URL/)
  })

  it('should load the SEO definition files into the instance', async () => {
    await writeYaml(join(tempDir, 'seo', 'site'), 'organization.yaml', "'@type': Organization\n")
    await writeYaml(
      join(tempDir, 'seo', 'collections', 'posts'),
      'article.yaml',
      "'@type': Article\n",
    )
    const config = loadConfig({ code: { ...CODE, seo: { configDir: 'seo' } }, cwd: tempDir })
    expect(config.seo.definitions.site?.entities).toEqual([
      { '@type': 'Organization', properties: {} },
    ])
    expect(config.seo.definitions.collections['posts']?.entities[0]?.['@type']).toBe('Article')
    expect(config.sources.get('seo.definitions')).toBe('file')
  })

  it('should have no definitions without a definition directory', () => {
    const config = loadConfig({ code: { ...CODE }, cwd: tempDir })
    expect(config.seo.definitions).toEqual({
      site: null,
      collections: {},
      routes: {},
    })
  })
})

describe('encodeRouteSlug / decodeRouteSlug', () => {
  it('round-trips literal patterns', () => {
    const pattern = '/services/consulting'
    expect(decodeRouteSlug(encodeRouteSlug(pattern))).toBe(pattern)
  })

  it('round-trips single-wildcard patterns', () => {
    const pattern = '/services/strategic/*'
    expect(decodeRouteSlug(encodeRouteSlug(pattern))).toBe(pattern)
  })

  it('round-trips multi-wildcard patterns', () => {
    const pattern = '/services/**'
    expect(decodeRouteSlug(encodeRouteSlug(pattern))).toBe(pattern)
  })

  it('encodes to filesystem-safe slugs', () => {
    expect(encodeRouteSlug('/services/strategic/*')).toBe('services__strategic____WILD__')
    expect(encodeRouteSlug('/services/**')).toBe('services____GLOB__')
  })

  it('round-trips patterns with hyphens in segments', () => {
    const pattern = '/about-us/our-team/*'
    expect(decodeRouteSlug(encodeRouteSlug(pattern))).toBe(pattern)
  })
})
