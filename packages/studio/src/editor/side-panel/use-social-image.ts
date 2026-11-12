import { useEffect, useState } from 'react'
import { useSeoSettingsRevision } from '../../lib/seo-settings-revision.js'
import { firstEntityProperties, pagePreview } from '../data-mode/preview-model.js'
import { configOf } from '../data-mode/use-data-sources.js'

type Properties = Readonly<Record<string, unknown>>

interface SeoSettings {
  document: Properties
  site: Properties
}

const NO_SETTINGS: SeoSettings = { document: {}, site: {} }

/** A scope's SEO settings, the first entity's properties; none when unset or unreadable */
async function settingsOf(id: string): Promise<Properties> {
  try {
    return firstEntityProperties(await configOf(id))
  } catch {
    return {}
  }
}

/** The document's and the site's SEO settings, which the social image falls back through; read again when Studio changes them */
function useSeoSettings(collection: string, slug: string | null): SeoSettings {
  const [settings, setSettings] = useState<SeoSettings>(NO_SETTINGS)
  const revision = useSeoSettingsRevision()
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision is the trigger to read again
  useEffect(() => {
    let active = true
    Promise.all([
      slug === null ? Promise.resolve({}) : settingsOf(`doc:${collection}/${slug}`),
      settingsOf('site'),
    ]).then(([document, site]) => {
      if (active) setSettings({ document, site })
    })
    return () => {
      active = false
    }
  }, [collection, slug, revision])
  return settings
}

/**
 * The image a shared link shows, from the draft's values — through the one
 * rule the page's meta tags and Data mode's previews use (`pagePreview`):
 * og-image, then image, then hero-image, then the site's og-default-image.
 * Null when none is set. Read only while SEO is on: the caller shows it then.
 */
export function useSocialImage(input: {
  collection: string
  slug: string | null
  fields: Readonly<Record<string, unknown>>
}): string | null {
  const { collection, slug, fields } = input
  const settings = useSeoSettings(collection, slug)
  return pagePreview({
    fields,
    slug: slug ?? '',
    pageUrl: null,
    documentSeo: settings.document,
    siteSeo: settings.site,
    siteName: '',
  }).social.image
}
