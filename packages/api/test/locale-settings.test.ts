import { describe, expect, it } from 'vitest'
import { getLocaleSettings, updateLocaleSettings } from '../src/handlers/site-settings.js'
import { translationStatus } from '../src/handlers/translation-status.js'
import type { ApiRequest } from '../src/types.js'
import { admin, editor } from './assistant/auth.js'
import { testConfig, testContext, testStores } from './assistant/fixtures.js'

const nordic = testConfig({
  site: { language: 'nb', supportedLocales: ['nb', 'en', 'sv'], defaultLocale: 'nb' },
})

function request(method: string, body?: unknown): ApiRequest {
  return { method, path: '/api/settings/locales', params: {}, query: {}, body, headers: {} }
}

function put(supportedLocales: unknown) {
  const stores = testStores('nb')
  const ctx = testContext(admin, stores, nordic)
  return { stores, ctx, response: updateLocaleSettings(request('PUT', { supportedLocales }), ctx) }
}

describe('GET /api/settings/locales', () => {
  it('reports the configuration when nothing was chosen', async () => {
    const ctx = testContext(editor, testStores('nb'), nordic)

    expect(await getLocaleSettings(request('GET'), ctx)).toEqual({
      status: 200,
      body: {
        defaultLocale: 'nb',
        configuredLocales: ['nb', 'en', 'sv'],
        supportedLocales: ['nb', 'en', 'sv'],
        source: 'config',
      },
    })
  })

  it('reports the active locales an admin chose, and still the configured default', async () => {
    const stores = testStores('nb')
    const ctx = testContext(admin, stores, nordic)
    await updateLocaleSettings(request('PUT', { supportedLocales: ['nb', 'sv'] }), ctx)

    const { body } = await getLocaleSettings(request('GET'), ctx)

    expect(body).toMatchObject({
      defaultLocale: 'nb',
      configuredLocales: ['nb', 'en', 'sv'],
      supportedLocales: ['nb', 'sv'],
      source: 'database',
    })
  })

  it('keeps a chosen list within the configuration when the configuration changes', async () => {
    const stores = testStores('nb')
    // Chosen while the configuration listed da and its default was en
    await stores.settings.setSetting('supportedLocales', JSON.stringify(['en', 'da', 'sv']))
    const ctx = testContext(editor, stores, nordic)

    expect((await getLocaleSettings(request('GET'), ctx)).body).toMatchObject({
      defaultLocale: 'nb',
      supportedLocales: ['nb', 'en', 'sv'],
    })
    expect((await translationStatus(request('GET'), ctx)).body).toMatchObject({
      supportedLocales: ['nb', 'en', 'sv'],
    })
  })
})

describe('PUT /api/settings/locales', () => {
  it('stores the active locales and answers the configured default', async () => {
    const { stores, response } = put(['nb', 'en'])

    expect(await response).toEqual({
      status: 200,
      body: {
        defaultLocale: 'nb',
        configuredLocales: ['nb', 'en', 'sv'],
        supportedLocales: ['nb', 'en'],
        source: 'database',
      },
    })
    expect(await stores.settings.getSetting('supportedLocales')).toBe('["nb","en"]')
    expect(await stores.settings.getSetting('defaultLocale')).toBeNull()
  })

  it('refuses a locale the configuration does not list', async () => {
    const { stores, response } = put(['nb', 'fr'])

    const { status, body } = await response
    expect(status).toBe(400)
    expect(body).toEqual({
      error: 'fr is not in site.supportedLocales in the configuration (nb, en, sv)',
    })
    expect(await stores.settings.getSetting('supportedLocales')).toBeNull()
  })

  it('refuses a list without the default locale', async () => {
    const { status, body } = await put(['en', 'sv']).response

    expect(status).toBe(400)
    expect(body).toEqual({ error: 'The default locale nb must stay active' })
  })

  it('refuses an empty list', async () => {
    const { status, body } = await put([]).response

    expect(status).toBe(400)
    expect(body).toEqual({ error: 'At least one locale is required' })
  })

  it('refuses a locale named twice', async () => {
    const { status, body } = await put(['nb', 'en', 'en']).response

    expect(status).toBe(400)
    expect(body).toEqual({ error: 'The list names a locale more than once' })
  })

  it('refuses a body that is not a list of locale codes', async () => {
    expect((await put('nb').response).status).toBe(400)
    expect((await put(['nb', 3]).response).status).toBe(400)
  })

  it('does not accept a default locale in the body', async () => {
    const stores = testStores('nb')
    const ctx = testContext(admin, stores, nordic)

    const { body } = await updateLocaleSettings(
      request('PUT', { supportedLocales: ['nb', 'en'], defaultLocale: 'en' }),
      ctx,
    )

    expect(body).toMatchObject({ defaultLocale: 'nb' })
    expect(await stores.settings.getSetting('defaultLocale')).toBeNull()
  })

  it('is for admins only', async () => {
    const ctx = testContext(editor, testStores('nb'), nordic)

    const { status } = await updateLocaleSettings(request('PUT', { supportedLocales: ['nb'] }), ctx)

    expect(status).toBe(403)
  })
})

describe('GET /api/translations/status', () => {
  it('reports the configured default locale', async () => {
    const ctx = testContext(editor, testStores('nb'), nordic)

    const { body } = await translationStatus(request('GET'), ctx)

    expect(body).toMatchObject({ defaultLocale: 'nb', supportedLocales: ['nb', 'en', 'sv'] })
  })
})
