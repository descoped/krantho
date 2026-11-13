import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemorySeoConfigAdapter } from '../src/memory-seo-config.js'
import type { SeoSeedConfig } from '../src/seo-config-io.js'
import { applySeedConfig, exportSeoConfig, importSeoConfig } from '../src/seo-config-io.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'krantho-seo-test-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

async function writeYaml(dir: string, filename: string, content: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, filename), content, 'utf-8')
}

// ---------------------------------------------------------------------------
// Seed application tests
// ---------------------------------------------------------------------------

describe('applySeedConfig', () => {
  it('seeds all scopes', async () => {
    const adapter = new MemorySeoConfigAdapter()
    const config: SeoSeedConfig = {
      site: { entities: [{ '@type': 'Organization', properties: { name: 'Test' } }] },
      collections: {
        pages: { entities: [{ '@type': 'Article', properties: {} }] },
      },
      routes: {
        '/services/*': { entities: [{ '@type': 'Service', properties: {} }] },
      },
    }

    const result = await applySeedConfig(adapter, config)
    expect(result.scopesImported).toBe(3)
    expect(result.entitiesImported).toBe(3)
    expect(await adapter.getConfig('site')).not.toBeNull()
    expect(await adapter.getConfig('collection:pages')).not.toBeNull()
    expect(await adapter.getConfig('route:/services/*')).not.toBeNull()
  })

  it('seed mode preserves existing rows', async () => {
    const adapter = new MemorySeoConfigAdapter()
    await adapter.saveConfig({
      id: 'site',
      scope: 'site',
      config: { entities: [{ '@type': 'Organization', properties: { name: 'Existing' } }] },
    })

    await applySeedConfig(
      adapter,
      {
        site: { entities: [{ '@type': 'Organization', properties: { name: 'New' } }] },
      },
      'seed',
    )

    const config = await adapter.getConfig('site')
    expect(config?.config.entities[0]?.properties.name).toBe('Existing')
  })

  it('overwrite mode replaces existing rows', async () => {
    const adapter = new MemorySeoConfigAdapter()
    await adapter.saveConfig({
      id: 'site',
      scope: 'site',
      config: { entities: [{ '@type': 'Organization', properties: { name: 'Existing' } }] },
    })

    await applySeedConfig(
      adapter,
      {
        site: { entities: [{ '@type': 'Organization', properties: { name: 'New' } }] },
      },
      'overwrite',
    )

    const config = await adapter.getConfig('site')
    expect(config?.config.entities[0]?.properties.name).toBe('New')
  })
})

// ---------------------------------------------------------------------------
// Export tests
// ---------------------------------------------------------------------------

describe('exportSeoConfig', () => {
  it('exports all scopes to files', async () => {
    const adapter = new MemorySeoConfigAdapter()
    await adapter.saveConfig({
      id: 'site',
      scope: 'site',
      config: {
        entities: [
          { '@type': 'ProfessionalService', role: 'primary', properties: { name: 'Acme' } },
          { '@type': 'Person', role: 'founder', properties: { name: 'Jane' } },
        ],
      },
    })
    await adapter.saveConfig({
      id: 'collection:pages',
      scope: 'collection',
      config: { entities: [{ '@type': 'Article', properties: {} }] },
    })

    const result = await exportSeoConfig(adapter, tempDir)
    expect(result.scopesExported).toBe(2)
    expect(result.entitiesExported).toBe(3)
    expect(result.filesWritten.length).toBe(3)

    // Verify file content
    const siteFile = await readFile(
      join(tempDir, 'site', '00-primary.professional-service.yaml'),
      'utf-8',
    )
    expect(siteFile).toContain('ProfessionalService')
    expect(siteFile).toContain('Acme')
  })

  it('exports field mappings', async () => {
    const adapter = new MemorySeoConfigAdapter()
    await adapter.saveConfig({
      id: 'site',
      scope: 'site',
      config: {
        entities: [{ '@type': 'Organization', properties: {} }],
        fieldMappings: { 'Article.headline': 'title' },
      },
    })

    await exportSeoConfig(adapter, tempDir)

    const mappings = await readFile(join(tempDir, 'site', '_field-mappings.yaml'), 'utf-8')
    expect(mappings).toContain('Article.headline')
  })

  it('rejects document metadata as a shared policy export', async () => {
    const adapter = new MemorySeoConfigAdapter()
    await adapter.saveConfig({
      id: 'doc:pages/home',
      scope: 'document',
      config: { entities: [] },
    })

    await expect(exportSeoConfig(adapter, tempDir)).rejects.toThrow('Unknown scope ID format')
  })
})

// ---------------------------------------------------------------------------
// Import error path tests
// ---------------------------------------------------------------------------

describe('importSeoConfig error paths', () => {
  it('handles a non-existent source directory gracefully (imports nothing)', async () => {
    const adapter = new MemorySeoConfigAdapter()
    const nonExistent = join(tempDir, 'does-not-exist')
    const result = await importSeoConfig(adapter, nonExistent, { mode: 'overwrite' })
    expect(result.scopesImported).toBe(0)
    expect(result.entitiesImported).toBe(0)
    expect(await adapter.listConfigs()).toHaveLength(0)
  })

  it('rejects when a YAML file contains invalid content', async () => {
    const siteDir = join(tempDir, 'site')
    await writeYaml(siteDir, 'broken.yaml', '{ invalid yaml:: }}}')

    const adapter = new MemorySeoConfigAdapter()
    await expect(importSeoConfig(adapter, tempDir, { mode: 'overwrite' })).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Round-trip tests
// ---------------------------------------------------------------------------

describe('round-trip: export → import → compare', () => {
  it('produces identical state', async () => {
    const db1 = new MemorySeoConfigAdapter()
    await db1.saveConfig({
      id: 'site',
      scope: 'site',
      config: {
        entities: [
          {
            '@type': 'ProfessionalService',
            role: 'primary',
            properties: { name: 'Acme', telephone: '+47 22 00 00 00' },
          },
          { '@type': 'Person', role: 'founder', properties: { name: 'Jane' } },
        ],
        fieldMappings: { 'Person.name': 'author-name' },
      },
    })
    await db1.saveConfig({
      id: 'collection:pages',
      scope: 'collection',
      config: { entities: [{ '@type': 'Article', properties: {} }] },
    })

    // Export from db1
    await exportSeoConfig(db1, tempDir)

    // Import into db2
    const db2 = new MemorySeoConfigAdapter()
    await importSeoConfig(db2, tempDir, { mode: 'overwrite' })

    // Compare
    const db1Configs = (await db1.listConfigs()).sort((a, b) => a.id.localeCompare(b.id))
    const db2Configs = (await db2.listConfigs()).sort((a, b) => a.id.localeCompare(b.id))

    expect(db2Configs.length).toBe(db1Configs.length)
    for (let i = 0; i < db1Configs.length; i++) {
      const c1 = db1Configs[i]!
      const c2 = db2Configs[i]!
      expect(c2.id).toBe(c1.id)
      expect(c2.scope).toBe(c1.scope)
      expect(c2.config.entities.length).toBe(c1.config.entities.length)
      for (let j = 0; j < c1.config.entities.length; j++) {
        expect(c2.config.entities[j]?.['@type']).toBe(c1.config.entities[j]?.['@type'])
        expect(c2.config.entities[j]?.role).toBe(c1.config.entities[j]?.role)
        expect(c2.config.entities[j]?.properties).toEqual(c1.config.entities[j]?.properties)
      }
      if (c1.config.fieldMappings) {
        expect(c2.config.fieldMappings).toEqual(c1.config.fieldMappings)
      }
    }
  })
})
