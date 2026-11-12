import type { ReactElement } from 'react'
import { resultCrumbs } from './preview-model.js'
import './serp-preview.css'

export interface SerpPreviewProps {
  title: string
  description: string
  url: string | null
}

/**
 * A search result as a results page shows it, in that page's own light
 * colours and type whatever Studio's theme: the site, the address as crumbs,
 * the title and the description, each cut where it overflows — as a results
 * page cuts them to fit its width, not at the site's editorial limits.
 */
export function SerpPreview({ title, description, url }: SerpPreviewProps): ReactElement {
  const { host, trail } = resultCrumbs(url)
  return (
    <div className="serp-preview">
      <div className="serp-preview-url-row">
        <span className="serp-preview-favicon" aria-hidden="true" />
        <div className="serp-preview-url-group">
          <span className="serp-preview-site-name">{host || 'Address not known'}</span>
          <span className="serp-preview-breadcrumb">
            {host}
            {trail}
          </span>
        </div>
      </div>
      <p className="serp-preview-title">{title}</p>
      <p className="serp-preview-description">
        {description || 'No description: a search engine picks text from the page.'}
      </p>
    </div>
  )
}
