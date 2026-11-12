import { z } from 'zod'
import { envNameFor, leafByPath } from './leaves.js'
import { LLM_PROVIDERS } from './llm-providers.js'
import { WEBHOOK_EVENTS } from './webhook-events.js'

/**
 * Validation for the fully merged tree.
 *
 * The schema carries no defaults — `defaults.ts` owns those and `derive.ts`
 * fills the computed ones, so by the time zod sees the object every leaf is
 * present. Unknown keys are rejected so a typo in `krantho.config.ts` is a
 * startup error rather than a silently ignored setting.
 */

const seoEntitySchema = z.strictObject({
  '@type': z.string().min(1),
  '@id': z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  properties: z.record(z.string(), z.unknown()),
})

const seoStructureSchema = z.strictObject({
  trail: z
    .array(z.strictObject({ name: z.string().min(1), url: z.string().min(1).optional() }))
    .optional(),
  kind: z.string().min(1).optional(),
})

export const seoScopeSchema = z.strictObject({
  entities: z.array(seoEntitySchema),
  fieldMappings: z.record(z.string(), z.string()).optional(),
  structure: seoStructureSchema.optional(),
})

const webhookSchema = z.strictObject({
  url: z.url({ protocol: /^https?$/, message: 'must be an absolute http or https URL' }),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'must list at least one event'),
  secret: z.string().min(1).optional(),
})

const unknownProviderMessage = (issue: { input?: unknown }): string =>
  `unknown provider ${JSON.stringify(issue.input)}; expected one of: ${LLM_PROVIDERS.join(', ')}`

const pathsSchema = z.strictObject({
  dataDir: z.string().min(1),
  contentDir: z.string().min(1),
  seoGeneratedDir: z.string().min(1),
})

const persistenceSchema = z.strictObject({
  provider: z.enum(['sqlite', 'postgres', 'filesystem']),
  sqlite: z.strictObject({
    path: z.string().min(1),
    busyTimeoutMs: z.int().nonnegative(),
    walRetries: z.int().positive(),
    walRetryDelayMs: z.int().nonnegative(),
  }),
  postgres: z.strictObject({
    url: z.string().min(1).optional(),
    maxConnections: z.int().positive().optional(),
    prepare: z.boolean().optional(),
    idleTimeoutSec: z.int().nonnegative().optional(),
  }),
  filesystem: z.strictObject({
    contentPath: z.string().min(1),
  }),
})

/** The slice of the tree a process that only opens the database needs */
export const persistenceTreeSchema = z.strictObject({
  paths: pathsSchema,
  persistence: persistenceSchema,
})

export const kranthoConfigSchema = z.strictObject({
  site: z.strictObject({
    domain: z.string().min(1, 'is required'),
    name: z.string().min(1, 'is required'),
    language: z.string().min(2, 'must be a locale code such as "en"'),
    baseUrl: z.string().url('must be an absolute URL'),
    supportedLocales: z.array(z.string().min(2)).min(1, 'must list at least one locale'),
    defaultLocale: z.string().min(2),
    logo: z.string().url('must be an absolute URL').optional(),
    description: z.string().min(1).optional(),
    alternateName: z.string().min(1).optional(),
    sameAs: z.array(z.string().url('must be an absolute URL')),
  }),

  paths: pathsSchema,

  persistence: persistenceSchema,

  content: z.strictObject({
    cache: z.strictObject({
      enabled: z.boolean(),
      ttlMs: z.int().nonnegative(),
      maxEntries: z.int().positive(),
    }),
    atNotation: z.boolean(),
    watch: z.boolean(),
    defaultStatus: z.strictObject({
      filesystem: z.string().min(1),
    }),
    list: z.strictObject({
      maxLimit: z.int().positive().optional(),
    }),
    search: z.strictObject({
      minQueryLength: z.int().positive(),
      defaultLimit: z.int().positive(),
      maxLimit: z.int().positive(),
    }),
    versions: z.strictObject({ keep: z.int().positive() }),
    lock: z.strictObject({ leaseMs: z.int().positive() }),
  }),

  cache: z.strictObject({
    pages: z.enum(['none', 'next-isr', 'cdn']),
    cdn: z.strictObject({
      provider: z.enum(['none', 'vercel', 'cloudfront', 'gcp']),
      sMaxAgeSec: z.int().positive(),
      staleWhileRevalidateSec: z.int().nonnegative(),
      tagHeader: z.string().regex(/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/, 'must be an HTTP header name'),
      cloudfront: z.strictObject({
        distributionId: z.string().min(1).optional(),
      }),
      gcp: z.strictObject({
        project: z.string().min(1).optional(),
        urlMap: z.string().min(1).optional(),
        accessToken: z.string().min(1).optional(),
      }),
    }),
    shared: z.enum(['none', 'database']),
  }),

  auth: z.strictObject({
    mode: z.enum(['none', 'token', 'oidc']),
    requireAuthForReads: z.boolean(),
    token: z.strictObject({
      secret: z.string().min(1).optional(),
      email: z.string().min(1),
      role: z.string().min(1),
    }),
    jwtSecret: z.string().min(1).optional(),
    oidc: z.strictObject({
      issuer: z.string().min(1).optional(),
      clientId: z.string().min(1).optional(),
      clientSecret: z.string().min(1).optional(),
      redirectUri: z.string().min(1).optional(),
      postLogoutUri: z.string().min(1),
      scopes: z.array(z.string().min(1)).min(1),
      signup: z.enum(['open', 'closed']),
      studioEntry: z.enum(['login', 'redirect']),
      adminEmails: z.array(z.string().min(1)),
      newUserRole: z.string().min(1),
    }),
    workload: z.strictObject({
      issuer: z.string().min(1).optional(),
      audience: z.string().min(1).optional(),
      subjects: z.array(z.string().min(1)),
    }),
    session: z.strictObject({
      accessTtlSec: z.int().positive(),
      refreshTtlSec: z.int().positive(),
      cookiePrefix: z.string().min(1),
      secure: z.enum(['auto', 'always', 'never']),
      sameSite: z.enum(['lax', 'strict', 'none']),
    }),
    trustProxy: z.boolean(),
  }),

  secrets: z.strictObject({
    provider: z.enum(['local']),
    local: z.strictObject({
      key: z.string().min(32, 'must be at least 32 characters').optional(),
    }),
  }),

  media: z.strictObject({
    provider: z.enum(['local', 'vercel-blob', 's3', 'gcs']).optional(),
    local: z.strictObject({
      dir: z.string().min(1),
      urlPrefix: z.string().min(1),
    }),
    vercelBlob: z.strictObject({
      token: z.string().min(1).optional(),
    }),
    s3: z.strictObject({
      bucket: z.string().min(1).optional(),
      region: z.string().min(1).optional(),
      endpoint: z.string().url('must be an absolute URL').optional(),
      forcePathStyle: z.boolean(),
      publicUrl: z.string().url('must be an absolute URL').optional(),
      accessKeyId: z.string().min(1).optional(),
      secretAccessKey: z.string().min(1).optional(),
    }),
    gcs: z.strictObject({
      bucket: z.string().min(1).optional(),
      publicUrl: z.string().url('must be an absolute URL').optional(),
      credentials: z.string().min(1).optional(),
    }),
    maxFileSize: z.int().positive(),
    allowedMimeTypes: z.array(z.string().min(1)),
    image: z.strictObject({
      maxWidth: z.int().positive(),
      quality: z.strictObject({
        jpeg: z.int().min(1).max(100),
        webp: z.int().min(1).max(100),
        avif: z.int().min(1).max(100),
        normalize: z.int().min(1).max(100),
      }),
      presets: z.record(z.string(), z.int().positive().nullable()),
      cache: z.strictObject({
        maxEntries: z.int().positive(),
        maxMb: z.int().positive(),
        ttiSec: z.int().positive(),
      }),
    }),
  }),

  llm: z.strictObject({
    provider: z.string().min(1),
    model: z.string().min(1).optional(),
    baseUrl: z.string().min(1).optional(),
    anthropic: z.strictObject({ apiKey: z.string().min(1).optional() }),
    openai: z.strictObject({ apiKey: z.string().min(1).optional() }),
    gemini: z.strictObject({ apiKey: z.string().min(1).optional() }),
    openrouter: z.strictObject({ apiKey: z.string().min(1).optional() }),
    claudeCode: z.strictObject({ authToken: z.string().min(1).optional() }),
    profiles: z.record(
      z.string().min(1),
      z.strictObject({
        reasoningEffort: z
          .enum(['default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
          .optional(),
        reasoningHeadroom: z.int().min(0).optional(),
        temperature: z.number().min(0).max(2).optional(),
      }),
    ),
  }),

  assistant: z.strictObject({
    enabled: z.boolean(),
    provider: z.enum(LLM_PROVIDERS, { error: unknownProviderMessage }).optional(),
    model: z.string().min(1).optional(),
    role: z.enum(['admin', 'editor', 'viewer']),
    confirmTtlSec: z.int().positive().max(3600),
    limits: z.strictObject({
      maxTurns: z.int().positive(),
      maxToolCalls: z.int().positive(),
      maxTokens: z.int().positive(),
      maxRequestTokens: z.int().positive(),
      maxHistoryMessages: z.int().positive(),
      maxInputChars: z.int().positive(),
      toolResultChars: z.int().positive(),
    }),
  }),

  seo: z.strictObject({
    identity: z.string().min(1).optional(),
    collections: z.record(z.string(), z.array(z.string().min(1))),
    routes: z.record(z.string(), z.array(z.string().min(1))),
    site: seoScopeSchema.optional(),
    richCollections: z.record(z.string(), seoScopeSchema),
    richRoutes: z.record(z.string(), seoScopeSchema),
    seedMode: z.enum(['seed', 'overwrite']),
    readers: z.array(z.string().min(1)),
    configDir: z.string().min(1).optional(),
    indexNow: z.strictObject({
      // IndexNow keys: 8 to 128 characters of a-z, A-Z, 0-9 and dashes
      key: z
        .string()
        .regex(/^[a-zA-Z0-9-]{8,128}$/, 'must be 8 to 128 letters, digits or dashes')
        .optional(),
    }),
    enrichment: z.strictObject({
      meta: z.strictObject({
        minChars: z.int().positive(),
        maxChars: z.int().positive(),
        contentCap: z.int().positive(),
        maxTokens: z.int().positive(),
      }),
      title: z.strictObject({
        maxChars: z.int().positive(),
      }),
      archetype: z.strictObject({
        contentCap: z.int().positive(),
        maxTokens: z.int().positive(),
      }),
    }),
  }),

  webhooks: z.array(webhookSchema),

  tools: z.strictObject({
    concurrency: z.int().positive(),
    enrich: z.strictObject({
      serviceCap: z.int().positive(),
      llmsDescriptionCap: z.int().positive(),
      faqMinPerRoute: z.int().positive(),
      skipFields: z.array(z.string().min(1)),
    }),
  }),
})

type PersistenceTree = z.infer<typeof persistenceSchema>
type CacheTree = z.infer<typeof kranthoConfigSchema>['cache']

/** Rules spanning the persistence leaves */
export function persistenceIssues(persistence: PersistenceTree): string[] {
  if (persistence.provider === 'postgres' && !persistence.postgres.url) {
    return ['persistence.postgres.url: required when persistence.provider is "postgres"']
  }
  return []
}

/** Rules spanning the page cache leaves */
function cacheIssues(cache: CacheTree): string[] {
  const issues: string[] = []
  const { cdn } = cache

  if (cache.pages === 'cdn' && cdn.provider === 'none') {
    issues.push('cache.cdn.provider: required when cache.pages is "cdn"')
  }
  if (cdn.provider === 'cloudfront' && !cdn.cloudfront.distributionId) {
    issues.push(
      'cache.cdn.cloudfront.distributionId: required when cache.cdn.provider is "cloudfront"',
    )
  }
  if (cdn.provider === 'gcp') {
    if (!cdn.gcp.project) {
      issues.push('cache.cdn.gcp.project: required when cache.cdn.provider is "gcp"')
    }
    if (!cdn.gcp.urlMap) {
      issues.push('cache.cdn.gcp.urlMap: required when cache.cdn.provider is "gcp"')
    }
  }

  return issues
}

type ResolvedTree = z.infer<typeof kranthoConfigSchema>

/** `path: message (VARIABLE)` — names the environment variable that sets the leaf */
function leafIssue(path: string, message: string): string {
  const leaf = leafByPath(path)
  const env = leaf ? envNameFor(leaf) : null
  return env ? `${path}: ${message} (${env})` : `${path}: ${message}`
}

function s3Issues(s3: ResolvedTree['media']['s3']): string[] {
  const issues: string[] = []
  const when = 'required when media.provider is "s3"'
  if (!s3.bucket) issues.push(leafIssue('media.s3.bucket', when))
  if (!s3.region) issues.push(leafIssue('media.s3.region', when))
  if (s3.endpoint && !s3.publicUrl) {
    issues.push(leafIssue('media.s3.publicUrl', 'required when media.s3.endpoint is set'))
  }
  if (s3.accessKeyId && !s3.secretAccessKey) {
    issues.push(leafIssue('media.s3.secretAccessKey', 'required when media.s3.accessKeyId is set'))
  }
  if (s3.secretAccessKey && !s3.accessKeyId) {
    issues.push(leafIssue('media.s3.accessKeyId', 'required when media.s3.secretAccessKey is set'))
  }
  return issues
}

/** A workload subject is an exact value or a prefix ending in `*`; the prefix is never empty */
function badSubjectPattern(pattern: string): boolean {
  const star = pattern.indexOf('*')
  if (star === -1) return false
  return star !== pattern.length - 1 || star === 0
}

/** Workload identity needs its issuer, audience and subjects together, or none of them */
function workloadIssues(workload: ResolvedTree['auth']['workload']): string[] {
  const { issuer, audience, subjects } = workload
  const set = [issuer !== undefined, audience !== undefined, subjects.length > 0]
  if (!set.some(Boolean)) return []

  const issues: string[] = []
  const when = 'required when any of the auth.workload leaves is set'
  if (!issuer) issues.push(leafIssue('auth.workload.issuer', when))
  if (!audience) issues.push(leafIssue('auth.workload.audience', when))
  if (subjects.length === 0) issues.push(leafIssue('auth.workload.subjects', when))
  if (issuer && !URL.canParse(issuer)) {
    issues.push(leafIssue('auth.workload.issuer', 'must be an absolute URL'))
  } else if (issuer && new URL(issuer).protocol !== 'https:') {
    issues.push(leafIssue('auth.workload.issuer', 'must be an https URL'))
  }
  for (const pattern of subjects.filter(badSubjectPattern)) {
    issues.push(
      leafIssue(
        'auth.workload.subjects',
        `"${pattern}" is not an exact subject or a prefix ending in a single *`,
      ),
    )
  }
  return issues
}

/** Settings the chosen media file store cannot start without */
function mediaIssues(config: ResolvedTree): string[] {
  const { provider } = config.media
  if (provider === undefined) return []

  const issues: string[] = []
  if (config.persistence.provider === 'filesystem') {
    issues.push(
      leafIssue(
        'media.provider',
        'media needs sqlite or postgres, but persistence.provider is "filesystem"',
      ),
    )
  }
  if (provider === 'vercel-blob' && !config.media.vercelBlob.token) {
    issues.push(
      leafIssue('media.vercelBlob.token', 'required when media.provider is "vercel-blob"'),
    )
  }
  if (provider === 's3') issues.push(...s3Issues(config.media.s3))
  if (provider === 'gcs' && !config.media.gcs.bucket) {
    issues.push(leafIssue('media.gcs.bucket', 'required when media.provider is "gcs"'))
  }
  return issues
}

/** Rules that span more than one leaf, checked after the shape validates */
export function crossFieldIssues(config: ResolvedTree): string[] {
  const issues: string[] = []

  if (!config.site.supportedLocales.includes(config.site.defaultLocale)) {
    issues.push(
      `site.defaultLocale: "${config.site.defaultLocale}" is not in site.supportedLocales (${config.site.supportedLocales.join(', ')})`,
    )
  }

  if (config.auth.mode === 'token' && !config.auth.token.secret) {
    issues.push('auth.token.secret: required when auth.mode is "token"')
  }

  if (config.auth.mode === 'oidc') {
    if (!config.auth.oidc.issuer) {
      issues.push('auth.oidc.issuer: required when auth.mode is "oidc"')
    }
    if (!config.auth.oidc.clientId) {
      issues.push('auth.oidc.clientId: required when auth.mode is "oidc"')
    }
    if (!config.auth.oidc.redirectUri) {
      issues.push('auth.oidc.redirectUri: required when auth.mode is "oidc"')
    }
    // The Studio gate verifies session cookies itself, so it must share the API's signing key
    if (config.auth.oidc.studioEntry === 'redirect' && !config.auth.jwtSecret) {
      issues.push('auth.jwtSecret: required when auth.oidc.studioEntry is "redirect"')
    }
  }

  issues.push(...workloadIssues(config.auth.workload))

  // Browsers drop a SameSite=None cookie that is not also Secure
  if (config.auth.session.sameSite === 'none' && config.auth.session.secure !== 'always') {
    issues.push('auth.session.sameSite: "none" requires auth.session.secure to be "always"')
  }

  issues.push(...persistenceIssues(config.persistence))
  issues.push(...cacheIssues(config.cache))

  issues.push(...mediaIssues(config))

  if (config.assistant.enabled && config.persistence.provider === 'filesystem') {
    issues.push(
      leafIssue(
        'assistant.enabled',
        'the assistant needs sqlite or postgres, but persistence.provider is "filesystem"',
      ),
    )
  }

  if (config.seo.enrichment.meta.minChars > config.seo.enrichment.meta.maxChars) {
    issues.push('seo.enrichment.meta.minChars: must not exceed seo.enrichment.meta.maxChars')
  }

  return issues
}
