import { documentSeoConfig, documentSeoProperties } from '@krantho/seo-shared'
/**
 * `seo validate` — the site's structured data checked the way the running
 * site checks it. `--config` creates the SEO subsystem from the configuration
 * instance, as the server does when it starts; `--all` also composes the
 * graph of every published document and validates it against the Schema.org
 * vocabulary and each active reader. Both report findings per reader and
 * count the errors, which the CLI turns into its exit code.
 */

import type { KranthoConfig } from '@krantho/config'
import { envNameFor, leafByPath } from '@krantho/config'
import { documentPath } from '@krantho/core'
import type { ContentSummary } from '@krantho/persistence'
import type { SeoConfigData } from '@krantho/seo-shared'

type SeoModule = typeof import('@krantho/seo')
type Seo = ReturnType<SeoModule['createSeo']>
type Finding = ReturnType<Seo['validate']>[number]

/** The stored SEO configuration the CLI reads */
export interface StoredSeoConfigs {
  getConfig(id: string): Promise<{ config: SeoConfigData } | null>
}

/** Published documents, per collection, without their body */
export interface PublishedDocuments {
  collections(): string[]
  documents(collection: string): Promise<ContentSummary[]>
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const

function settingLabel(setting: string): string {
  const leaf = leafByPath(setting)
  const env = leaf ? envNameFor(leaf) : null
  return env ? `${env} (${setting})` : setting
}

/**
 * Create the SEO subsystem from the configuration and print what it found.
 * Returns the subsystem, or null when the configuration stops it; `errors`
 * counts what would stop the site from starting.
 */
export async function validateConfig(
  config: KranthoConfig,
): Promise<{ seo: Seo | null; errors: number }> {
  const module = await import('@krantho/seo')
  try {
    const seo = module.createSeo(config)
    console.log(`\nConfiguration — readers: ${seo.readers.join(', ')}`)
    for (const finding of seo.findings) {
      console.log(`  [${finding.severity}] ${settingLabel(finding.setting)}: ${finding.message}`)
    }
    if (seo.findings.length === 0) console.log('  no findings')
    return { seo, errors: 0 }
  } catch (err) {
    if (!(err instanceof module.SeoConfigurationError)) throw err
    console.log('\nConfiguration')
    for (const finding of err.findings) {
      console.log(`  [${finding.severity}] ${settingLabel(finding.setting)}: ${finding.message}`)
    }
    return { seo: null, errors: err.findings.filter((f) => f.severity === 'error').length }
  }
}

/** A document's graph, composed as the site renders it */
async function documentGraph(
  seo: Seo,
  configs: StoredSeoConfigs,
  doc: ContentSummary,
  path: string,
  onFinding: (finding: Finding) => void,
): Promise<ReturnType<Seo['compose']>> {
  const { collection, slug } = doc.meta
  const [site, col] = await Promise.all([
    configs.getConfig('site'),
    configs.getConfig(`collection:${collection}`),
  ])
  const { resolveEffectiveConfig, blogPostArchetype } = await import('@krantho/seo')
  const page = documentSeoConfig(doc.metadata)
  const configured = [site, col, page ? { config: page } : null].some(
    (scope) => (scope?.config.entities.length ?? 0) > 0,
  )
  const config = configured
    ? resolveEffectiveConfig({ collection: col?.config ?? null, document: page })
    : { entities: blogPostArchetype.schemas.map((type) => ({ '@type': type, properties: {} })) }
  return seo.compose({
    config,
    fields: { ...doc.fields, ...documentSeoProperties(doc.metadata) },
    path,
    siteLevel: configured ? (site?.config ?? null) : null,
    documentMeta: doc.meta,
    onFinding,
  })
}

function printFindings(label: string, findings: readonly Finding[]): void {
  if (findings.length === 0) return
  console.log(`\n${label}`)
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  )
  for (const reader of new Set(findings.map((finding) => finding.profile))) {
    console.log(`  ${reader}`)
    for (const finding of sorted.filter((f) => f.profile === reader)) {
      const source = finding.source ? ` — ${finding.source}` : ''
      console.log(`    [${finding.severity}] ${finding.message}${source}`)
    }
  }
}

/**
 * Validate the graph of every published document and print its findings per
 * reader. Collections render at their conventional paths (`/<collection>/<slug>`,
 * pages at `/<slug>`); globals render no pages. Returns the error count.
 */
export async function validateDocuments(
  seo: Seo,
  configs: StoredSeoConfigs,
  documents: PublishedDocuments,
): Promise<number> {
  let errors = 0
  let checked = 0
  for (const collection of documents.collections()) {
    for (const doc of await documents.documents(collection)) {
      const path = documentPath({ name: collection }, doc.meta.slug)
      if (path === null) continue
      const findings: Finding[] = []
      const graph = await documentGraph(seo, configs, doc, path, (f) => findings.push(f))
      findings.push(...seo.validate(graph))
      printFindings(`${collection}/${doc.meta.slug} (${path})`, findings)
      errors += findings.filter((finding) => finding.severity === 'error').length
      checked++
    }
  }
  console.log(`\nChecked ${checked} published document(s): ${errors} error(s).`)
  return errors
}

/** Each active reader's rules for the given types, with the documentation they cite */
export async function printReaderRules(
  config: KranthoConfig,
  types: readonly string[],
): Promise<void> {
  const { createSeo, getProfile, ruleFor } = await import('@krantho/seo')
  const { readers } = createSeo(config)
  for (const type of types) {
    console.log(`  ${type}`)
    for (const reader of readers) {
      const profile = getProfile(reader)
      const rule = profile ? ruleFor(profile, type) : undefined
      if (!profile || !rule) continue
      console.log(`    ${profile.name}: ${rule.feature ?? rule.type} (${rule.status})`)
      if (rule.required?.length) console.log(`      Required: ${rule.required.join(', ')}`)
      for (const group of rule.oneOf ?? []) console.log(`      One of: ${group.join(', ')}`)
      if (rule.recommended?.length) console.log(`      Recommended: ${rule.recommended.join(', ')}`)
      console.log(`      Source: ${rule.source}`)
    }
  }
}
