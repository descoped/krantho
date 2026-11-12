import { CMSText, CMSMarkdown } from '@krantho/ui-react'
import type { PageProps } from '../App'

export function ServiceDetailPage({ slug }: PageProps) {
  return (
    <div>
      <section className="section-white">
        <div className="section-container">
          <a href="/services" className="back-link">
            &larr; All Services
          </a>
          <CMSText slug={slug} field="title" variant="h1" className="page-title" component="h1" />
          <CMSText slug={slug} field="ingress" variant="body1" className="page-subtitle" component="p" />
        </div>
      </section>

      <section className="section-muted">
        <div className="section-container">
          <CMSMarkdown slug={slug} className="prose prose-lg max-w-none" />
        </div>
      </section>
    </div>
  )
}
