import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineCollection, defineConfig } from '@krantho/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { autoImport, type ImportableAdapter } from '../src/import.js'

let contentDir: string

beforeEach(() => {
  contentDir = mkdtempSync(join(tmpdir(), 'krantho-import-dates-'))
  mkdirSync(join(contentDir, 'pages'))
  writeFileSync(join(contentDir, 'pages', 'about.md'), '---\ntitle: About\n---\nAbout us\n')
  writeFileSync(join(contentDir, 'pages', 'team.md'), '---\ntitle: Team\n---\nThe team\n')
})

afterEach(() => {
  rmSync(contentDir, { recursive: true, force: true })
})

/** An empty database that records what each import was dated */
function recordingAdapter(): {
  adapter: ImportableAdapter
  dated: Map<string, string | undefined>
} {
  const dated = new Map<string, string | undefined>()
  const adapter: ImportableAdapter = {
    listSlugs: async () => [],
    upsertFromFile: async (_collection, slug, _f, _b, _h, _s, _path, _locale, modifiedAt) => {
      dated.set(slug, modifiedAt)
    },
  }
  return { adapter, dated }
}

describe('autoImport', () => {
  const contentConfig = (): ReturnType<typeof defineConfig> =>
    defineConfig({
      collections: {
        pages: defineCollection({
          name: 'pages',
          source: 'filesystem',
          schema: z.object({ title: z.string() }),
          directory: join(contentDir, 'pages'),
        }),
      },
    })

  it('dates each imported file by when it last changed, and the rest by the import', async () => {
    const { adapter, dated } = recordingAdapter()
    const dateOf = (filePath: string): string | undefined =>
      filePath.endsWith('about.md') ? '2026-01-02T03:04:05.000Z' : undefined

    expect(await autoImport(adapter, contentConfig(), dateOf)).toBe(2)
    expect(dated.get('about')).toBe('2026-01-02T03:04:05.000Z')
    expect(dated.get('team')).toBeUndefined()
  })

  it('dates every file by the import without content dates', async () => {
    const { adapter, dated } = recordingAdapter()

    await autoImport(adapter, contentConfig())
    expect([...dated.values()]).toEqual([undefined, undefined])
  })
})
