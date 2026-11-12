import { Lock } from 'lucide-react'
import { lazy, type ReactElement, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  type CatalogDetailResponse,
  type CatalogType,
  fetchCatalogType,
  type SeoConfigData,
  type SiteConfigResponse,
  saveSeoConfig,
} from '../lib/api.js'
import { errorMessage } from '../lib/fetch.js'
import { parseGraph } from '../lib/jsonld-graph.js'
import { useToast } from '../ui/toast.js'
import { identityRows, SETTINGS_UNREAD, type StoredConfig } from './scopes-model.js'
import { StructureCard } from './structure-card.js'

const GraphBrowser = lazy(() =>
  import('../components/jsonld-graph/GraphBrowser.js').then((m) => ({ default: m.GraphBrowser })),
)

/** The site's identity from krantho.config.ts: read-only, each value with the setting that changes it */
export function ConfigIdentity({ site }: { site: SiteConfigResponse['site'] }): ReactElement {
  return (
    <StructureCard
      title="From krantho.config.ts"
      lead="The site's identity is code: every site entity reads it. Studio shows it; change it where it is set."
    >
      <dl className="structure-identity">
        {identityRows(site).map((row) => (
          <div key={row.setting} className="structure-identity-row">
            <dt>{row.label}</dt>
            <dd>
              <span className="structure-identity-value">
                <Lock aria-hidden="true" />
                {row.value ?? <span className="structure-muted">Not set</span>}
              </span>
              <span className="structure-identity-where">
                Change it in krantho.config.ts (<code>{row.setting}</code>)
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </StructureCard>
  )
}

/** The site entities as a graph to browse: each entity a node */
function siteGraph(config: SeoConfigData): unknown {
  return {
    '@context': 'https://schema.org',
    '@graph': config.entities.map((entity) => ({
      '@type': entity['@type'],
      ...(entity['@id'] ? { '@id': entity['@id'] } : {}),
      ...entity.properties,
    })),
  }
}

/** The catalog's details of each type the site entities have */
function useTypeDetails(config: SeoConfigData): ReadonlyMap<string, CatalogDetailResponse> {
  const [details, setDetails] = useState<ReadonlyMap<string, CatalogDetailResponse>>(new Map())
  const types = config.entities.map((entity) => entity['@type']).join(',')
  useEffect(() => {
    let active = true
    void Promise.allSettled(types.split(',').filter(Boolean).map(fetchCatalogType)).then(
      (settled) => {
        const map = new Map<string, CatalogDetailResponse>()
        for (const result of settled) {
          if (result.status === 'fulfilled') map.set(result.value.type.type, result.value)
        }
        if (active) setDetails(map)
      },
    )
    return () => {
      active = false
    }
  }, [types])
  return details
}

/** Save the site entities; a failure is said and passed on, so the editor keeps its changes */
function useSaveSite(onSaved: () => void): (next: SeoConfigData) => Promise<void> {
  const toast = useToast()
  return useCallback(
    async (next: SeoConfigData): Promise<void> => {
      try {
        await saveSeoConfig('site', next)
        toast({ text: "Site entities saved. Every page's structured data has changed." })
        onSaved()
      } catch (err: unknown) {
        toast({ text: errorMessage(err, 'The site entities could not be saved'), tone: 'error' })
        throw err
      }
    },
    [toast, onSaved],
  )
}

export interface SiteEntitiesProps {
  /** The stored site entities: none when nothing is stored, unread when they could not be read */
  stored: StoredConfig
  catalogTypes: readonly CatalogType[]
  admin: boolean
  onSaved: () => void
}

/** No site entities stored: the editor starts from none */
const NO_ENTITIES: SeoConfigData = { entities: [] }

/** The card's lead: who may change the entities, or why no one may now */
function entitiesLead(admin: boolean, unread: boolean): string {
  if (unread) return SETTINGS_UNREAD
  return admin
    ? "Kept in the site's SEO settings, which have no versions: Save changes every page's structured data at once."
    : "Kept in the site's SEO settings. Changing them is for admins: here they are browsed and exported."
}

/**
 * The site entities kept in the database: browsed and, for an admin, edited
 * with the graph browser — values, entities added and removed, JSON-LD
 * imported with its diff, exported — and saved to the site's SEO settings
 */
export function SiteEntities({
  stored,
  catalogTypes,
  admin,
  onSaved,
}: SiteEntitiesProps): ReactElement {
  const config = stored.state === 'read' ? (stored.config ?? NO_ENTITIES) : NO_ENTITIES
  const unread = stored.state !== 'read'
  const editable = admin && !unread
  const raw = useMemo(() => siteGraph(config), [config])
  const model = useMemo(() => parseGraph(raw), [raw])
  const details = useTypeDetails(config)
  const siteTypes = useMemo(() => new Set(config.entities.map((e) => e['@type'])), [config])
  const save = useSaveSite(onSaved)
  return (
    <StructureCard title="Site entities" lead={entitiesLead(admin, unread)}>
      {!unread && (
        <Suspense fallback={<p className="structure-note">Loading the graph browser…</p>}>
          <GraphBrowser
            model={model}
            catalogTypes={catalogTypes}
            catalogDetails={details}
            rawData={raw}
            configData={editable ? config : undefined}
            onSave={editable ? save : undefined}
            siteLevelTypeSet={siteTypes}
          />
        </Suspense>
      )}
    </StructureCard>
  )
}
