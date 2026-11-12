import type { SeoConfigData } from '@krantho/seo-shared'
import type { ComposeFromConfigOptions, ResolvedEntity } from './graph/compose-from-config.js'
import { composeFromConfig, resolvePageEntities } from './graph/compose-from-config.js'
import { siteSettingFor } from './graph/resolve-properties.js'
import type { JsonLdGraph, SeoGraphConfig } from './graph/types.js'
import './profiles/index.js'
import type { FeatureEligibility } from './profiles/eligibility.js'
import { featureEligibility } from './profiles/eligibility.js'
import { getProfile, ruleFor } from './profiles/registry.js'
import type { ReaderProfile } from './profiles/types.js'
import { isEmpty } from './types/values.js'
import type { Finding, GraphNode } from './validate/types.js'
import { validateGraph } from './validate/validate-graph.js'
import { getVocabularyType, lifecycleOf } from './vocabulary/index.js'

type Scopes = Readonly<Record<string, SeoConfigData>>

/** The configuration the SEO subsystem is created from: the `site` and `seo` sections of the loaded instance */
export interface SeoSettings {
  readonly site: SeoGraphConfig & { readonly sameAs: readonly string[] }
  readonly seo: {
    readonly identity?: string | undefined
    readonly collections: Readonly<Record<string, readonly string[]>>
    readonly routes: Readonly<Record<string, readonly string[]>>
    readonly site?: SeoConfigData | undefined
    readonly richCollections: Scopes
    readonly richRoutes: Scopes
    readonly readers: readonly string[]
    readonly definitions: {
      readonly site: SeoConfigData | null
      readonly collections: Scopes
      readonly routes: Scopes
    }
  }
}

/** A problem with the configuration itself, naming the setting that fixes it */
export interface ConfigurationFinding {
  readonly severity: 'error' | 'warning' | 'info'
  /** The configuration path to set or change, e.g. `site.logo` */
  readonly setting: string
  readonly message: string
}

/** Thrown when the configuration lacks what the structured data requires */
export class SeoConfigurationError extends Error {
  readonly findings: readonly ConfigurationFinding[]

  constructor(findings: readonly ConfigurationFinding[]) {
    const body = findings.map((f) => `  - ${f.setting}: ${f.message}`).join('\n')
    super(`Invalid SEO configuration:\n${body}`)
    this.name = 'SeoConfigurationError'
    this.findings = findings
  }
}

/** The SEO subsystem of one site, created from its configuration */
export interface Seo {
  /** The site's identity and address, as entities carry it */
  readonly site: SeoGraphConfig
  /** The reader profiles graphs are checked against */
  readonly readers: readonly string[]
  /** What the configuration could do better — recommended values it lacks, pending terms it uses */
  readonly findings: readonly ConfigurationFinding[]
  /** Compose a page's graph with the site's identity */
  compose(options: Omit<ComposeFromConfigOptions, 'siteConfig'>): JsonLdGraph
  /** Each entity of a page with its properties' values and sources, as the graph would carry them */
  resolve(options: Omit<ComposeFromConfigOptions, 'siteConfig' | 'onFinding'>): ResolvedEntity[]
  /** Validate a graph against the vocabulary and the active readers */
  validate(graph: JsonLdGraph | GraphNode): Finding[]
  /** The search features of the active readers a graph's entities can appear in, with what they lack */
  features(graph: JsonLdGraph | GraphNode): FeatureEligibility[]
}

/** Every type the configuration names, with the setting it is named in */
function configuredTypes(seo: SeoSettings['seo']): Array<readonly [string, string]> {
  const entities = (setting: string, scope: SeoConfigData | null | undefined) =>
    (scope?.entities ?? []).map((entity) => [setting, entity['@type']] as const)
  const scopes = (setting: string, record: Scopes) =>
    Object.entries(record).flatMap(([key, scope]) => entities(`${setting}.${key}`, scope))
  const lists = (setting: string, record: Readonly<Record<string, readonly string[]>>) =>
    Object.entries(record).flatMap(([key, types]) =>
      types.map((type) => [`${setting}.${key}`, type] as const),
    )
  const files = seo.definitions
  return [
    ...(seo.identity ? [['seo.identity', seo.identity] as const] : []),
    ...lists('seo.collections', seo.collections),
    ...lists('seo.routes', seo.routes),
    ...entities('seo.site', seo.site),
    ...scopes('seo.richCollections', seo.richCollections),
    ...scopes('seo.richRoutes', seo.richRoutes),
    ...entities('seo.configDir (site)', files.site),
    ...scopes('seo.configDir (collections)', files.collections),
    ...scopes('seo.configDir (routes)', files.routes),
  ]
}

/** A configured type must be a current Schema.org type; a pending one is noted */
function typeFindings(setting: string, type: string): ConfigurationFinding[] {
  if (!getVocabularyType(type)) {
    return [{ severity: 'error', setting, message: `"${type}" is not a Schema.org type.` }]
  }
  const lifecycle = lifecycleOf(type)
  if (lifecycle?.status === 'superseded') {
    return [
      {
        severity: 'error',
        setting,
        message: `"${type}" is superseded by "${lifecycle.by}" in Schema.org.`,
      },
    ]
  }
  if (lifecycle?.status === 'retired') {
    return [{ severity: 'error', setting, message: `"${type}" is retired from Schema.org.` }]
  }
  if (lifecycle?.status === 'pending') {
    return [{ severity: 'info', setting, message: `"${type}" is a pending Schema.org term.` }]
  }
  return []
}

/** The site entities the configuration defines, from every place it can define them */
function siteEntities(seo: SeoSettings['seo']): SeoConfigData['entities'] {
  const fromIdentity = seo.identity ? [{ '@type': seo.identity, properties: {} }] : []
  return [...(seo.definitions.site?.entities ?? []), ...(seo.site?.entities ?? fromIdentity)]
}

/** Values a reader needs from the site's identity that the configuration does not set */
function identityFindings(
  settings: SeoSettings,
  readers: readonly ReaderProfile[],
): ConfigurationFinding[] {
  const findings: ConfigurationFinding[] = []
  for (const entity of siteEntities(settings.seo)) {
    const type = entity['@type']
    for (const profile of readers) {
      const rule = ruleFor(profile, type)
      if (!rule || rule.status === 'none' || rule.status === 'retired') continue
      const check = (
        properties: readonly string[] | undefined,
        severity: 'error' | 'warning',
        verb: string,
      ) => {
        for (const property of properties ?? []) {
          const setting = siteSettingFor(type, property)
          if (!setting || !isEmpty(entity.properties[property]) || !isEmpty(settings.site[setting]))
            continue
          const message = `${profile.name} ${verb} "${property}" on ${type} (${rule.source}).`
          findings.push({ severity, setting: `site.${setting}`, message })
        }
      }
      check(rule.required, 'error', 'requires')
      check(rule.recommended, 'warning', 'recommends')
    }
  }
  return findings
}

function unique(findings: readonly ConfigurationFinding[]): ConfigurationFinding[] {
  const seen = new Set<string>()
  return findings.filter((f) => {
    const key = `${f.severity}|${f.setting}|${f.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Create a site's SEO subsystem from its loaded configuration: the site's
 * identity from `site`, the active readers from `seo.readers`, and the types
 * and site entities from the `seo` section and its definition files.
 *
 * Fails fast on what is required, and only on that: an unknown reader, a type
 * the vocabulary lacks or has superseded or retired, or a value of the site's
 * identity an active reader requires throws a {@link SeoConfigurationError}
 * naming each setting. A value a reader only recommends is a warning in
 * `findings` and never stops anything.
 */
export function createSeo(settings: SeoSettings): Seo {
  const unknownReaders = settings.seo.readers.filter((id) => !getProfile(id))
  const readers = settings.seo.readers.flatMap((id) => getProfile(id) ?? [])
  const findings = unique([
    ...unknownReaders.map(
      (id): ConfigurationFinding => ({
        severity: 'error',
        setting: 'seo.readers',
        message: `No reader profile "${id}" is registered.`,
      }),
    ),
    ...configuredTypes(settings.seo).flatMap(([setting, type]) => typeFindings(setting, type)),
    ...identityFindings(settings, readers),
  ])
  const errors = findings.filter((f) => f.severity === 'error')
  if (errors.length > 0) throw new SeoConfigurationError(errors)

  const site: SeoGraphConfig = { ...settings.site }
  const ids = readers.map((profile) => profile.id)
  return {
    site,
    readers: ids,
    findings,
    compose: (options) => composeFromConfig({ ...options, siteConfig: site }),
    resolve: (options) => resolvePageEntities({ ...options, siteConfig: site }),
    validate: (graph) => validateGraph(graph, { profiles: ids }),
    features: (graph) => featureEligibility(graph, ids),
  }
}
