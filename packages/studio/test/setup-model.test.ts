import { PROVIDER_PRESETS } from '@krantho/ai'
import { describe, expect, it } from 'vitest'
import type { CollectionSchema, LLMSettings } from '../src/lib/api.js'
import {
  availableProviders,
  developerProviders,
  keySourceText,
  modelName,
  providerName,
  readyProviders,
  statusLine,
  testSentence,
} from '../src/setup/ai-model.js'
import { checkpointName, TRIGGER_LABELS } from '../src/setup/checkpoints-model.js'
import { collectionRows, schemaFields } from '../src/setup/collections-model.js'
import { deliveryState, emptyText, httpLabel, pageText } from '../src/setup/deliveries-model.js'
import { environmentRows } from '../src/setup/environment-tab.js'
import { fieldFormError, fieldOf, fieldTypeName, formOf } from '../src/setup/field-form.js'
import { addableLocales, addedLocale, removedLocale } from '../src/setup/locales-model.js'
import {
  FILL_MISSING,
  FORCE_REGENERATE,
  META_ONLY,
  stepPosition,
} from '../src/structure/fill-job.js'
import { llmReport, SAVED_LLM, UNCONFIGURED_LLM } from './fixtures/setup-api.js'
import { CATALOG, CONFIGS } from './fixtures/structure-data.js'

const COLLECTIONS = [
  { name: 'pages', source: 'database', pages: true, sections: [] },
  { name: 'services', source: 'database', pages: true, path: '/work/:slug', sections: [] },
  { name: 'globals', source: 'database', pages: false, path: false, sections: [] },
] as const

describe('Collections & schema', () => {
  const rows = collectionRows({
    collections: COLLECTIONS.map((c) => ({ ...c, directory: undefined })),
    configs: { state: 'ok', value: CONFIGS as never },
    catalog: { state: 'ok', value: CATALOG.types as never },
  })

  it('says where each collection renders, by core’s documentPath', () => {
    expect(rows.map((row) => row.rendersAt)).toEqual(['/:slug', '/work/:slug', null])
  })

  it('lists each archetype’s types and the rich results the catalog gives them', () => {
    expect(rows[0]?.types).toEqual(['Article', 'BreadcrumbList'])
    expect(rows[0]?.richResults).toEqual(['Article', 'Breadcrumb'])
    expect(rows[1]?.types).toEqual(['Service'])
    expect(rows[2]?.types).toEqual([])
  })

  it('reads unread settings as not known, never as none', () => {
    const [row] = collectionRows({
      collections: [{ ...COLLECTIONS[0], directory: undefined }],
      configs: { state: 'failed' },
      catalog: { state: 'off' },
    })
    expect(row?.types).toBeNull()
    expect(row?.richResults).toBeNull()
  })

  it('separates code fields from runtime ones, the runtime definitions kept', () => {
    const schema: CollectionSchema = {
      contract: {
        id: 'test/content',
        revision: 'test',
        label: 'Content',
        fields: {
          properties: {
            title: { type: 'string' },
            link: { type: 'string', format: 'uri' },
            teaser: { type: 'string', _runtime: true } as never,
          },
          required: ['title'],
        },
        metadata: {},
        body: 'optional',
        sections: [],
      },

      name: 'pages',
      source: 'database',
      schema: {
        properties: {
          title: { type: 'string' },
          link: { type: 'string', format: 'uri' },
          teaser: { type: 'string', _runtime: true } as never,
        },
        required: ['title'],
      },
    }
    const fields = schemaFields(schema, [{ name: 'teaser', type: 'textarea', required: true }])
    expect(fields.map((f) => [f.name, f.type, f.source, f.required])).toEqual([
      ['title', 'string', 'code', true],
      ['link', 'url', 'code', false],
      ['teaser', 'textarea', 'runtime', true],
    ])
  })
})

describe('field type names', () => {
  it('names the runtime field types in plain words, and code-defined types the same way; an unknown one reads as it is', () => {
    expect(fieldTypeName('string')).toBe('text (one line)')
    expect(fieldTypeName('textarea')).toBe('text (long)')
    expect(fieldTypeName('boolean')).toBe('yes/no')
    expect(fieldTypeName('reference')).toBe('link to a page')
    expect(fieldTypeName('integer')).toBe('number')
    expect(fieldTypeName('object')).toBe('group')
    expect(fieldTypeName('custom')).toBe('custom')
  })
})

describe('runtime field form', () => {
  it('sends only what applies to the type', () => {
    const form = {
      ...formOf(null),
      name: 'level',
      type: 'enum' as const,
      enumValues: 'a, b ,',
      min: '3',
    }
    expect(fieldOf(form)).toEqual({
      name: 'level',
      type: 'enum',
      required: false,
      enumValues: ['a', 'b'],
    })
    const number = {
      ...formOf(null),
      name: 'rank',
      type: 'number' as const,
      min: '1',
      defaultValue: '2',
    }
    expect(fieldOf(number)).toEqual({
      name: 'rank',
      type: 'number',
      required: false,
      min: 1,
      default: 2,
    })
  })

  it('refuses a missing or malformed name and a reference without its collection', () => {
    expect(fieldFormError(formOf(null))).toBe('A field needs a name.')
    expect(fieldFormError({ ...formOf(null), name: '1st' })).toMatch(/starts with a letter/)
    expect(fieldFormError({ ...formOf(null), name: 'author', type: 'reference' })).toMatch(
      /collection/,
    )
  })

  it('fills the form from a field being edited', () => {
    const form = formOf({ name: 'tags', type: 'enum', required: true, enumValues: ['x', 'y'] })
    expect(form).toMatchObject({ name: 'tags', required: true, enumValues: 'x, y' })
  })
})

describe('Locales', () => {
  const settings = {
    defaultLocale: 'en',
    configuredLocales: ['en', 'no', 'sv'],
    supportedLocales: ['en', 'no'],
    source: 'database' as const,
  }

  it('offers the configured locales that are not active, and adds one to the active list', () => {
    expect(addableLocales(settings)).toEqual(['sv'])
    expect(addedLocale(settings, 'sv')).toEqual(['en', 'no', 'sv'])
  })

  it('offers nothing when every configured locale is active', () => {
    expect(addableLocales({ ...settings, supportedLocales: ['en', 'no', 'sv'] })).toEqual([])
  })

  it('removes any locale but the default', () => {
    expect(removedLocale(settings, 'no')).toEqual(['en'])
    expect(removedLocale(settings, 'en')).toBe(settings.supportedLocales)
  })
})

describe('AI provider', () => {
  const settings = (
    on: Record<string, 'environment' | 'configuration' | 'saved'>,
    active?: string,
  ) => llmReport(on, active) as LLMSettings

  it('names an AI the way a person knows it, from the presets of @krantho/ai', () => {
    expect(providerName('openai')).toBe(PROVIDER_PRESETS.openai.label)
    expect(providerName('openai')).toBe('ChatGPT')
    expect(providerName('unknown')).toBe('unknown')
  })

  it('says whether AI help is on and which AI does it', () => {
    expect(statusLine(UNCONFIGURED_LLM as LLMSettings)).toBe(
      'AI help is off. Add a key below to turn it on.',
    )
    expect(statusLine(SAVED_LLM as LLMSettings)).toBe('AI help is on, using Claude.')
    expect(modelName(SAVED_LLM as LLMSettings)).toBe(
      `Claude · ${PROVIDER_PRESETS.anthropic.defaultModel}`,
    )
    expect(modelName(UNCONFIGURED_LLM as LLMSettings)).toBe('The AI')
  })

  it('splits what is on from what a key turns on, and keeps the developer ones apart', () => {
    const both = settings({ openai: 'environment', anthropic: 'saved' }, 'openai')
    expect(readyProviders(both).map((entry) => entry.provider)).toEqual(['openai', 'anthropic'])
    expect(availableProviders(both).map((entry) => entry.provider)).toEqual(['gemini'])
    expect(developerProviders(both).map((entry) => entry.provider)).toEqual([
      'claude-code',
      'openrouter',
      'ollama',
    ])
  })

  it('says where a key comes from in plain words, never the variable', () => {
    expect(keySourceText('saved')).toBe('Key saved here, encrypted.')
    expect(keySourceText('environment')).toBe('Set up by your developer.')
    expect(keySourceText('configuration')).toBe('Set up by your developer.')
    expect(keySourceText(null)).toBe('Runs on your own computer.')
  })

  it('answers a test in a sentence a person can act on', () => {
    expect(testSentence('openai', { success: true })).toBe('ChatGPT works: it answered.')
    expect(testSentence('openai', { success: false, error: '401 Incorrect API key' })).toBe(
      'ChatGPT did not accept the key. Check that you copied all of it.',
    )
    expect(testSentence('gemini', { success: false, error: 'network down' })).toBe(
      'Gemini did not answer: network down.',
    )
  })

  it('runs Fill missing SEO and Meta only without force, Force regenerate with it', () => {
    expect(FILL_MISSING).toEqual({ steps: ['meta-descriptions', 'archetype'], force: false })
    expect(META_ONLY).toEqual({ steps: ['meta-descriptions'], force: false })
    expect(FORCE_REGENERATE).toEqual({ steps: ['meta-descriptions', 'archetype'], force: true })
    expect(stepPosition(META_ONLY, 'meta-descriptions')).toBe('step 1 of 1')
  })
})

describe('Integrations', () => {
  const base = { id: 1, url: 'u', event: 'publish', status: 503, nextRetryAt: null, createdAt: '' }

  it('reads a delivery’s state by the API’s rule', () => {
    expect(deliveryState({ ...base, attempts: 1, deliveredAt: '2026-10-01' })).toBe('delivered')
    expect(deliveryState({ ...base, attempts: 4, deliveredAt: null })).toBe('pending')
    expect(deliveryState({ ...base, attempts: 5, deliveredAt: null })).toBe('failed')
  })

  it('labels the answer, the empty page and the paging', () => {
    expect(httpLabel(0)).toBe('Network error')
    expect(httpLabel(null)).toBe('—')
    expect(emptyText('failed')).toBe('No delivery has failed.')
    expect(pageText(0, 25)).toBeNull()
    expect(pageText(1, 26)).toBe('Page 2 of 2')
  })
})

describe('Checkpoints and Environment', () => {
  it('names a checkpoint by its number and name, and what took it', () => {
    expect(checkpointName({ version: 3, name: 'Before relaunch' })).toBe('v3 · Before relaunch')
    expect(checkpointName({ version: 4, name: null })).toBe('v4')
    expect(TRIGGER_LABELS['pre-restore']).toBe('Before a restore')
  })

  it('lists what the server reports, the framework and schema version only when known', () => {
    const rows = environmentRows({
      persistence: 'sqlite',
      framework: null,
      authMode: 'token',
      schemaVersion: null,
      features: { webhookDeliveries: 'enabled' },
    })
    expect(rows).toEqual([
      { name: 'Persistence', value: 'sqlite' },
      { name: 'Auth', value: 'token' },
      { name: 'Webhook Deliveries', value: 'enabled' },
    ])
  })
})
