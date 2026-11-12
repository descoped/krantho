import { PROVIDER_PRESETS, type Provider } from '@krantho/ai'
import { installApi, json, type Route } from './site-api.js'
import { type FillGate, fillRoutes } from './structure-api.js'
import { CATALOG, CONFIGS } from './structure-data.js'

// ---------------------------------------------------------------------------
// The routes Setup reads and writes, answered as the real handlers answer
// (packages/api/src/handlers): locales and coverage, the AI provider and
// enrichment, the schema and runtime fields, webhook deliveries and Retry,
// checkpoints, user accounts. State lives in `SetupState`, so a write shows
// on the next read.
// ---------------------------------------------------------------------------

type Routes = Record<string, Route>

export interface SetupState {
  locales: {
    defaultLocale: string
    configuredLocales: string[]
    supportedLocales: string[]
    source: 'config' | 'database'
  }
  llm: LlmReport
  runtimeFields: Array<Record<string, unknown>>
  deliveries: Array<Record<string, unknown>>
  checkpoints: Array<Record<string, unknown>>
  users: Array<Record<string, unknown>>
  /** Every write's `METHOD /path` and body, in order */
  sent: Array<{ key: string; body: unknown }>
}

/** The variable that sets each provider's key, as `GET /api/settings/llm` reports it */
const KEY_VARIABLES: Record<string, string> = {
  anthropic: 'KRANTHO_LLM_ANTHROPIC_API_KEY',
  'claude-code': 'KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN',
  openai: 'KRANTHO_LLM_OPENAI_API_KEY',
  gemini: 'KRANTHO_LLM_GEMINI_API_KEY',
  openrouter: 'KRANTHO_LLM_OPENROUTER_API_KEY',
  ollama: '',
}

type KeySource = 'environment' | 'configuration' | 'saved'

export interface LlmReportProvider {
  provider: string
  ready: boolean
  active: boolean
  keySource: KeySource | null
  env: string
  model: string | null
  baseUrl: string | null
}

export interface LlmReport {
  configured: boolean
  provider: string | null
  model: string | null
  providers: LlmReportProvider[]
  assistantProvider: string | null
}

/**
 * `GET /api/settings/llm` as the handler reports it: every provider with whether it is on,
 * the one in use, and where each key comes from. `on` names the providers with a key.
 */
export function llmReport(
  on: Record<string, KeySource | null> = {},
  active: string | null = Object.keys(on)[0] ?? null,
  assistantProvider: string | null = null,
): LlmReport {
  const providers = Object.keys(KEY_VARIABLES).map((provider) => ({
    provider,
    ready: provider in on,
    active: provider === active,
    keySource: on[provider] ?? null,
    env: KEY_VARIABLES[provider] ?? '',
    model: null,
    baseUrl: null,
  }))
  return {
    configured: active !== null,
    provider: active,
    model: active ? (PROVIDER_PRESETS[active as Provider]?.defaultModel ?? null) : null,
    providers,
    assistantProvider,
  }
}

/** `GET /api/settings/llm` with no key anywhere */
export const UNCONFIGURED_LLM = llmReport()

/** One provider on with a key saved here, in use */
export const SAVED_LLM = llmReport({ anthropic: 'saved' })

const delivery = (id: number, attempts: number, deliveredAt: string | null, status: number) => ({
  id,
  url: 'https://hooks.example.test/publish',
  event: 'publish',
  status,
  attempts,
  nextRetryAt: null,
  createdAt: `2026-10-0${id}T08:00:00.000Z`,
  deliveredAt,
})

export function initialState(): SetupState {
  return {
    locales: {
      defaultLocale: 'en',
      configuredLocales: ['en', 'no'],
      supportedLocales: ['en', 'no'],
      source: 'config',
    },
    llm: { ...UNCONFIGURED_LLM },
    runtimeFields: [
      { name: 'subtitle', type: 'string', required: false, description: 'A line under the title' },
    ],
    deliveries: [delivery(1, 1, '2026-10-01 08:00:01', 200), delivery(2, 5, null, 503)],
    checkpoints: [
      {
        id: 1,
        version: 1,
        name: 'Before relaunch',
        trigger: 'manual',
        createdAt: '2026-10-01T09:00:00.000Z',
      },
    ],
    users: [
      {
        id: 'u-admin',
        email: 'ada@example.test',
        name: 'Ada',
        roles: ['admin'],
        isActive: true,
        oidcIssuer: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'u-eddie',
        email: 'eddie@example.test',
        name: 'Eddie',
        roles: ['editor'],
        isActive: true,
        oidcIssuer: 'https://id.example.test',
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
      },
    ],
    sent: [],
  }
}

function record(state: SetupState, key: string, route: Route): Route {
  return (body, url) => {
    state.sent.push({ key, body })
    return route(body, url)
  }
}

/** `GET/PUT /api/settings/locales` and `GET /api/translations/status` */
function localeRoutes(state: SetupState): Routes {
  return {
    'GET /api/settings/locales': () => json(state.locales),
    'PUT /api/settings/locales': record(state, 'PUT /api/settings/locales', (body) => {
      const { supportedLocales } = body as Pick<SetupState['locales'], 'supportedLocales'>
      state.locales = { ...state.locales, supportedLocales, source: 'database' }
      return json(state.locales)
    }),
    'GET /api/translations/status': () =>
      json({
        supportedLocales: state.locales.supportedLocales,
        defaultLocale: state.locales.defaultLocale,
        collections: [
          {
            collection: 'pages',
            total: 2,
            items: [
              { slug: 'about', locales: ['en', 'no'], missing: [] },
              { slug: 'pricing', locales: ['en'], missing: ['no'] },
            ],
          },
        ],
      }),
  }
}

interface LlmSave {
  provider?: string
  model?: string
  apiKey?: string
  baseUrl?: string
  use?: boolean
}

/** What the API reports after a save: the key turns that provider on; what was in use stays in use */
function savedLlm(
  before: LlmReport,
  { provider = '', model, apiKey, baseUrl, use }: LlmSave,
): LlmReport {
  const on: Record<string, KeySource | null> = {}
  for (const entry of before.providers) if (entry.ready) on[entry.provider] = entry.keySource
  if (apiKey) on[provider] = on[provider] ?? 'saved'
  if (provider === 'ollama' && use) on[provider] = null
  const active = use || !before.provider ? provider : before.provider
  const next = llmReport(on, active, before.assistantProvider)
  for (const entry of next.providers) {
    const was = before.providers.find((candidate) => candidate.provider === entry.provider)
    entry.model = entry.provider === provider ? model || null : (was?.model ?? null)
    entry.baseUrl = entry.provider === provider ? baseUrl || null : (was?.baseUrl ?? null)
  }
  return next
}

/** What the API reports after Remove: the key saved for that provider is gone, and it is no longer in use */
function removedLlm(before: LlmReport, provider: string): LlmReport {
  const on: Record<string, KeySource | null> = {}
  for (const entry of before.providers) {
    if (entry.ready && !(entry.provider === provider && entry.keySource === 'saved')) {
      on[entry.provider] = entry.keySource
    }
  }
  const stays = before.provider !== provider || provider in on
  return llmReport(
    on,
    stays ? before.provider : (Object.keys(on)[0] ?? null),
    before.assistantProvider,
  )
}

/** The AI provider: read, saved, tested and removed */
function llmRoutes(state: SetupState): Routes {
  return {
    'GET /api/settings/llm': () => json(state.llm),
    'PUT /api/settings/llm': record(state, 'PUT /api/settings/llm', (body) => {
      state.llm = savedLlm(state.llm, body as LlmSave)
      return json(state.llm)
    }),
    'DELETE /api/settings/llm': record(state, 'DELETE /api/settings/llm', (_body, url) => {
      const provider = url.searchParams.get('provider') ?? ''
      state.llm = removedLlm(state.llm, provider)
      return json(state.llm)
    }),
    'POST /api/settings/llm/test': record(state, 'POST /api/settings/llm/test', (body) => {
      const provider = (body as { provider?: string }).provider ?? ''
      return json({
        success: true,
        provider,
        model: PROVIDER_PRESETS[provider as Provider]?.defaultModel ?? 'a model',
        usage: { inputTokens: 9, outputTokens: 1 },
      })
    }),
  }
}

/** `GET /api/schema/pages`: the code fields as JSON Schema, the runtime ones marked `_runtime` */
function schemaOf(state: SetupState): Record<string, unknown> {
  const runtime = Object.fromEntries(
    state.runtimeFields.map((field) => [field['name'], { type: 'string', _runtime: true }]),
  )
  return {
    contract: {
      id: 'test/content',
      revision: 'test',
      label: 'Content',
      fields: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The page title' },
          status: { type: 'string', enum: ['draft', 'published'], default: 'draft' },
          ...runtime,
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
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The page title' },
        status: { type: 'string', enum: ['draft', 'published'], default: 'draft' },
        ...runtime,
      },
      required: ['title'],
    },
  }
}

function schemaRoutes(state: SetupState): Routes {
  const routes: Routes = {
    'GET /api/schema/pages': () => json(schemaOf(state)),
    'GET /api/schema/pages/runtime': () =>
      json({ collection: 'pages', fields: state.runtimeFields, updatedAt: null }),
    'GET /api/schema/pages/export': () =>
      json({
        collection: 'pages',
        code: 'export const pagesSchema = z.object({\n  title: z.string(),\n})',
      }),
    'PUT /api/schema/pages/fields': record(state, 'PUT /api/schema/pages/fields', (body) => {
      const field = body as Record<string, unknown>
      state.runtimeFields = [
        ...state.runtimeFields.filter((f) => f['name'] !== field['name']),
        field,
      ]
      return json({ message: 'Field saved', field })
    }),
  }
  for (const name of ['subtitle', 'teaser']) {
    routes[`DELETE /api/schema/pages/fields/${name}`] = record(state, `DELETE ${name}`, () => {
      state.runtimeFields = state.runtimeFields.filter((f) => f['name'] !== name)
      return json({ message: 'Field deleted', field: name })
    })
  }
  return routes
}

/** `GET /api/webhooks/deliveries` filtered as the SQLite adapter filters, and Retry */
function deliveryRoutes(state: SetupState): Routes {
  const failed = (d: Record<string, unknown>): boolean =>
    d['deliveredAt'] === null && Number(d['attempts']) >= 5
  const matches: Record<string, (d: Record<string, unknown>) => boolean> = {
    pending: (d) => d['deliveredAt'] === null && !failed(d),
    delivered: (d) => d['deliveredAt'] !== null,
    failed,
  }
  return {
    'GET /api/webhooks/deliveries': (_body, url) => {
      const status = url.searchParams.get('status') ?? ''
      const deliveries = state.deliveries.filter((d) => matches[status]?.(d) ?? true)
      return json({ deliveries, total: deliveries.length })
    },
    'POST /api/webhooks/deliveries/2/retry': record(state, 'POST retry 2', () => {
      const requeued = {
        ...state.deliveries[1],
        attempts: 4,
        nextRetryAt: '2026-10-03T10:00:00.000Z',
      }
      state.deliveries = [state.deliveries[0] ?? {}, requeued]
      return json({ delivery: requeued }, 202)
    }),
  }
}

/** Checkpoints: list, create, restore (taking the safety checkpoint first) and delete */
function checkpointRoutes(state: SetupState): Routes {
  const create = (name: string | null, trigger: string): Record<string, unknown> => {
    const version = state.checkpoints.length + 1
    const created = { id: version, version, name, trigger, createdAt: '2026-10-03T10:00:00.000Z' }
    state.checkpoints = [created, ...state.checkpoints]
    return created
  }
  return {
    'GET /api/checkpoints': () => json({ checkpoints: state.checkpoints }),
    'POST /api/checkpoints': record(state, 'POST /api/checkpoints', (body) =>
      json(create((body as { name?: string }).name ?? null, 'manual'), 201),
    ),
    'POST /api/checkpoints/1/restore': record(state, 'POST restore 1', () => {
      create('pre-restore-v1', 'pre-restore')
      return json({ restored: state.checkpoints.at(-1), message: 'Restored from checkpoint v1' })
    }),
    'DELETE /api/checkpoints/1': record(state, 'DELETE checkpoint 1', () => {
      state.checkpoints = state.checkpoints.filter((c) => c['version'] !== 1)
      return json({ deleted: true, version: 1 })
    }),
  }
}

/** User accounts: list, create, update (role, active) and delete */
function userRoutes(state: SetupState): Routes {
  const routes: Routes = {
    'GET /api/users': () => json({ users: state.users, total: state.users.length }),
    'POST /api/users': record(state, 'POST /api/users', (body) => {
      const { email, name, role } = body as Record<string, string | undefined>
      const user = {
        id: 'u-new',
        email,
        name: name ?? null,
        roles: [role ?? 'viewer'],
        oidcSubject: null,
        oidcIssuer: null,
        isActive: true,
        createdAt: '',
        updatedAt: '',
      }
      state.users = [...state.users, user]
      return json(user, 201)
    }),
  }
  for (const id of ['u-admin', 'u-eddie', 'u-new']) {
    routes[`PUT /api/users/${id}`] = record(state, `PUT /api/users/${id}`, (body) => {
      const changes = body as { role?: string; isActive?: boolean; name?: string }
      state.users = state.users.map((user) =>
        user['id'] !== id
          ? user
          : {
              ...user,
              ...(changes.name !== undefined ? { name: changes.name } : {}),
              ...(changes.role ? { roles: [changes.role] } : {}),
              ...(changes.isActive !== undefined ? { isActive: changes.isActive } : {}),
            },
      )
      return json(state.users.find((user) => user['id'] === id))
    })
  }
  return routes
}

export interface SetupApiOptions {
  role?: 'admin' | 'editor' | 'viewer' | undefined
  authMode?: 'none' | 'token' | undefined
  features?: Record<string, string> | undefined
  state?: SetupState | undefined
  /** Holds enrichment jobs running until released */
  gate?: FillGate | undefined
  /** More answers, ahead of Setup's own */
  routes?: Routes | undefined
}

const ALL_FEATURES = {
  seo: 'enabled',
  localization: 'enabled',
  runtimeSchema: 'enabled',
  webhookDeliveries: 'enabled',
  checkpoints: 'enabled',
}

/** Install the fake API for Setup; returns its state, which every write changes */
export function installSetupApi(options: SetupApiOptions = {}): SetupState {
  const state = options.state ?? initialState()
  const features = options.features ?? ALL_FEATURES
  const authMode = options.authMode ?? 'none'
  const routes: Routes = {
    // Enrichment's jobs; the AI provider below answers from the state instead
    ...fillRoutes(state.sent, options.gate),
    'GET /api/capabilities': () =>
      json({ persistence: 'sqlite', framework: 'next', authMode, schemaVersion: 12, features }),
    'GET /api/seo/config': () => json({ configs: CONFIGS }),
    'GET /api/seo/catalog': () => json(CATALOG),
    ...localeRoutes(state),
    ...llmRoutes(state),
    ...schemaRoutes(state),
    ...deliveryRoutes(state),
    ...checkpointRoutes(state),
    ...userRoutes(state),
    ...options.routes,
  }
  installApi({ features, role: options.role, routes })
  return state
}
