import { CMSText, CMSMarkdown } from '@krantho/ui-react'
import type { PageProps } from '../App'

export function AboutPage({ slug }: PageProps) {
  return (
    <div>
      <section className="section-white">
        <div className="section-container">
          <CMSText slug={slug} field="title" variant="h1" className="page-title" component="h1" />
          <CMSText slug={slug} field="description" variant="body1" className="page-subtitle" component="p" />
        </div>
      </section>

      <section className="section-muted">
        <div className="section-container">
          <CMSMarkdown slug={slug} section="Our Team" className="prose max-w-none" />
        </div>
      </section>

      <section className="section-white">
        <div className="section-container">
          <CMSMarkdown slug={slug} section="Our Approach" className="prose max-w-none" />
        </div>
      </section>
    </div>
  )
}
