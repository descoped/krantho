import { CMSText, CMSMarkdown } from '@krantho/ui-react'
import type { PageProps } from '../App'

export function HomePage({ slug, serviceIds = [] }: PageProps) {
  return (
    <div>
      {/* Hero */}
      <section className="section-primary">
        <div className="section-container" style={{ textAlign: 'center' }}>
          <CMSText slug={slug} field="title" variant="h1" className="hero-title" component="h1" />
          <div style={{ maxWidth: '42rem', margin: '0 auto', opacity: 0.8 }}>
            <CMSText slug={slug} field="description" variant="body1" className="hero-subtitle" component="p" />
          </div>
          <div style={{ marginTop: '2rem' }}>
            <a href="/services" className="hero-btn">
              Our Services
            </a>
          </div>
        </div>
      </section>

      {/* Markdown content */}
      <section className="section-white">
        <div className="section-container">
          <CMSMarkdown slug={slug} className="prose" />
        </div>
      </section>

      {/* Services grid */}
      <section className="section-muted">
        <div className="section-container">
          <h2 className="section-title">Our Services</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {serviceIds.map((id) => (
              <a key={id} href={`/services/${id}`} className="service-card">
                <CMSText slug={id} field="title" variant="h3" component="h3" />
                <CMSText slug={id} field="ingress" variant="body1" className="text-muted-fg" component="p" />
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-white">
        <div className="section-container" style={{ textAlign: 'center' }}>
          <h2 className="section-title">Why Acme?</h2>
          <div style={{ marginTop: '1.5rem' }}>
            <a href="/about" className="hero-btn">
              Learn more about us
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
