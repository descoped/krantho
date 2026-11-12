import type { KranthoConfig } from '@krantho/config'
import { envNameFor, KranthoConfigError, leafByPath } from '@krantho/config'
import { loadSeoModule } from './seo-loader.js'

type SeoModule = Awaited<ReturnType<typeof loadSeoModule>>
type Seo = ReturnType<SeoModule['createSeo']>

const subsystems = new WeakMap<KranthoConfig, Promise<Seo>>()

/**
 * The site's SEO subsystem, created once per configuration instance from its
 * site identity, SEO definitions and readers. Rejects when `@krantho/seo` is
 * not installed, or with its `SeoConfigurationError` when the configuration
 * lacks what the structured data requires.
 */
export function loadSeo(config: KranthoConfig): Promise<Seo> {
  let seo = subsystems.get(config)
  if (!seo) {
    seo = loadSeoModule().then((module) => module.createSeo(config))
    seo.catch(() => subsystems.delete(config))
    subsystems.set(config, seo)
  }
  return seo
}

/**
 * Whether an error is `@krantho/seo` itself missing from the installation —
 * Node's "Cannot find package '@krantho/seo'", a bundler's "Cannot find module
 * '@krantho/seo'". A dependency missing inside the package names that
 * dependency instead, and is not mistaken for it.
 */
export function isSeoModuleMissing(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.message.includes('Cannot find') &&
    err.message.includes("'@krantho/seo'")
  )
}

/** A setting with the environment variable that overrides it, as configuration errors name it */
function settingLabel(setting: string): string {
  const leaf = leafByPath(setting)
  const env = leaf ? envNameFor(leaf) : null
  return env ? `${env} (${setting})` : setting
}

/**
 * Create the SEO subsystem when the site starts, so the configuration is
 * checked before anything is served: a value the structured data requires
 * that is missing throws a {@link KranthoConfigError} naming the setting and
 * its environment variable; a recommended one is logged as a warning. A site
 * without `@krantho/seo` has nothing to check.
 */
export async function startSeo(config: KranthoConfig): Promise<void> {
  let seo: Awaited<ReturnType<typeof loadSeo>>
  try {
    seo = await loadSeo(config)
  } catch (err) {
    if (isSeoModuleMissing(err)) return
    const { SeoConfigurationError } = await loadSeoModule()
    if (!(err instanceof SeoConfigurationError)) throw err
    throw new KranthoConfigError(
      err.findings.map((f) => `${settingLabel(f.setting)}: ${f.message}`),
    )
  }
  for (const finding of seo.findings) {
    if (finding.severity !== 'warning') continue
    console.warn(`[krantho] WARNING: ${settingLabel(finding.setting)}: ${finding.message}`)
  }
}
