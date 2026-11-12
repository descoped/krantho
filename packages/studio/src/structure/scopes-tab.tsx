import type { ReactElement } from 'react'
import { Link } from 'react-router'
import type { SeoConfig } from '../lib/api.js'
import { dataModePath } from '../lib/paths.js'
import { CollectionArchetypes } from './collection-archetypes.js'
import { ScopeCascade, scopeSectionId } from './scope-cascade.js'
import { cascadeCounts, storedConfig } from './scopes-model.js'
import { ConfigIdentity, SiteEntities } from './site-entities.js'
import { StructureCard, TypeChips } from './structure-card.js'
import { catalogOf } from './structure-model.js'
import type { TabProps } from './structure-page.js'
import { configsOf } from './structure-sources.js'
import { TypeCatalog } from './type-catalog.js'
import './scopes.css'

const typesOf = (config: SeoConfig): string[] =>
  config.config.entities.map((entity) => entity['@type'])

/** The URL patterns with their own types: read here, set in krantho.config.ts (`seo.routes`) */
function RoutePatterns({ configs }: { configs: readonly SeoConfig[] }): ReactElement {
  const routes = configsOf(configs, 'route')
  return (
    <StructureCard
      id={scopeSectionId('route')}
      title="URL patterns"
      lead="Overrides for the pages whose address matches a pattern; the most specific pattern wins. Seeded from krantho.config.ts (seo.routes)."
    >
      {routes.length === 0 ? (
        <p className="structure-note">No URL pattern has its own types.</p>
      ) : (
        <ul className="structure-scope-list">
          {routes.map((route) => (
            <li key={route.id}>
              <code>{route.id.replace(/^route:/, '')}</code>
              <TypeChips types={typesOf(route)} />
            </li>
          ))}
        </ul>
      )}
    </StructureCard>
  )
}

/** The pages with their own SEO settings, each leading to its Data mode, where they are edited */
function DocumentScopes({ configs }: { configs: readonly SeoConfig[] }): ReactElement {
  const documents = configsOf(configs, 'document')
  return (
    <StructureCard
      id={scopeSectionId('document')}
      title="Pages with their own settings"
      lead="One page's own say, which wins over everything above. A page's settings are edited in its Data mode."
    >
      {documents.length === 0 ? (
        <p className="structure-note">No page has settings of its own.</p>
      ) : (
        <ul className="structure-scope-list">
          {documents.map((doc) => {
            const [collection = '', slug = ''] = doc.id.replace(/^doc:/, '').split('/')
            return (
              <li key={doc.id}>
                <Link to={dataModePath(collection, slug)} className="structure-link">
                  {collection}/{slug}
                </Link>
                <TypeChips types={typesOf(doc)} />
              </li>
            )
          })}
        </ul>
      )}
    </StructureCard>
  )
}

/**
 * Scopes & archetypes: the cascade of the four scopes, the site's identity
 * (from config, read-only) and its entities (in the database, editable), the
 * collection archetypes, the URL patterns, the pages with their own settings,
 * and the catalog of types
 */
export function ScopesTab({ base, admin, state }: TabProps): ReactElement {
  const configs = base.configs.state === 'ok' ? base.configs.value : []
  const catalog = catalogOf(base)
  return (
    <>
      <ScopeCascade counts={cascadeCounts(base.configs)} />
      {base.configs.state !== 'ok' && (
        <p className="structure-note structure-note--error" role="alert">
          The SEO settings could not be read. Nothing stored can be changed until they are: reload
          the page.
        </p>
      )}
      <div id={scopeSectionId('site')} className="structure-stack">
        <ConfigIdentity site={base.site.site} />
        <SiteEntities
          stored={storedConfig(base.configs, 'site')}
          catalogTypes={catalog?.types ?? []}
          admin={admin}
          onSaved={state.reloadBase}
        />
      </div>
      <CollectionArchetypes
        collections={base.collections}
        configs={base.configs}
        catalog={catalog}
        admin={admin}
        onSaved={state.reloadBase}
      />
      <RoutePatterns configs={configs} />
      <DocumentScopes configs={configs} />
      {catalog && <TypeCatalog catalog={catalog} />}
    </>
  )
}
