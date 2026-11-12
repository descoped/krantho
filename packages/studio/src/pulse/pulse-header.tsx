import { Plus } from 'lucide-react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import type { CollectionInfo, SiteConfigResponse } from '../lib/api.js'
import { frameworkLabel, type RuntimeCapabilities } from '../lib/capabilities.js'
import { newDocumentPath } from '../lib/paths.js'
import { buttonClass } from '../ui/button.js'
import './pulse-header.css'

export interface PulseHeaderProps {
  /** Null until Pulse has loaded */
  site: SiteConfigResponse | null
  loading: boolean
  framework: RuntimeCapabilities['framework']
  /** The collection a new page goes in; null when there is none or the viewer cannot create one */
  pageCollection: CollectionInfo | null
}

function Facts({
  site,
  framework,
}: {
  site: SiteConfigResponse
  framework: RuntimeCapabilities['framework']
}): ReactElement {
  return (
    <dl className="pulse-facts">
      <div className="pulse-fact">
        <dt>Domain</dt>
        <dd>
          <code>{site.site.domain}</code>
        </dd>
      </div>
      {frameworkLabel({ framework }) && (
        <div className="pulse-fact">
          <dt>Framework</dt>
          <dd>{frameworkLabel({ framework })}</dd>
        </div>
      )}
      <div className="pulse-fact">
        <dt>Page cache</dt>
        <dd>
          <code>{site.cache.pages}</code>
        </dd>
      </div>
    </dl>
  )
}

/** The site's name, domain, framework and page-cache mode, with New page */
export function PulseHeader({
  site,
  loading,
  framework,
  pageCollection,
}: PulseHeaderProps): ReactElement {
  return (
    <header className="pulse-header">
      <div className="pulse-header-text">
        {site && (
          <>
            <h1 className="pulse-title">{site.site.name}</h1>
            <Facts site={site} framework={framework} />
          </>
        )}
        {!site && loading && (
          <>
            <h1 className="pulse-title">
              <span className="pulse-skeleton pulse-skeleton--title" aria-hidden="true" />
              <span className="visually-hidden">Pulse</span>
            </h1>
            <span className="pulse-skeleton pulse-skeleton--facts" aria-hidden="true" />
          </>
        )}
        {!site && !loading && <h1 className="pulse-title">Pulse</h1>}
      </div>
      {pageCollection && (
        <Link to={newDocumentPath(pageCollection.name)} className={buttonClass('primary')}>
          <Plus className="ui-button-icon" aria-hidden="true" />
          New page
        </Link>
      )}
    </header>
  )
}
