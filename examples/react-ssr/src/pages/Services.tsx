import { CMSText } from '@krantho/ui-react'
import type { PageProps } from '../App'

export function ServicesPage({ slug, serviceIds = [] }: PageProps) {
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {serviceIds.map((id) => (
              <a key={id} href={`/services/${id}`} className="service-card">
                <CMSText slug={id} field="title" variant="h2" component="h2" />
                <CMSText slug={id} field="ingress" variant="body1" className="text-muted-fg" component="p" />
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
