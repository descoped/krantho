import type { ContentSection, PersistenceSection, SiteSection } from '@krantho/config'
import { describe, expect, it, vi } from 'vitest'
import { createAdapter, postgresClientOptions } from '../src/persistence.js'

// An app that selects postgres without installing the optional peers
vi.mock('@krantho/persistence-postgres', () => {
  throw new Error("Cannot find package '@krantho/persistence-postgres'")
})

describe('postgresClientOptions', () => {
  it('passes nothing when no leaf is set, so the driver keeps its own defaults', () => {
    expect(postgresClientOptions({ url: 'postgres://localhost/db' })).toEqual({})
  })

  it('maps the pool leaves onto the driver options', () => {
    expect(
      postgresClientOptions({
        url: 'postgres://localhost/db',
        maxConnections: 2,
        prepare: false,
        idleTimeoutSec: 20,
      }),
    ).toEqual({ max: 2, prepare: false, idle_timeout: 20 })
  })
})

describe('createAdapter with the postgres provider', () => {
  it('names the packages the app must add when they are missing', async () => {
    const persistence = {
      provider: 'postgres',
      postgres: { url: 'postgres://localhost/db' },
    } as PersistenceSection
    const site = { defaultLocale: 'nb' } as SiteSection
    const content = { defaultStatus: { filesystem: 'published' } } as ContentSection
    await expect(createAdapter(persistence, site, content, new Map())).rejects.toThrow(
      /@krantho\/persistence-postgres or postgres could not be loaded/,
    )
  })
})
