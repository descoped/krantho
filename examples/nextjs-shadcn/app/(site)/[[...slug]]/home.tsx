import type { Metadata } from 'next'
import { requirePublished } from '@/lib/krantho'
import Link from 'next/link'
import { kranthoField } from '@krantho/core/marks'
import { getAllCMSSummaries, CMSTextServer, CMSMarkdownServer, resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'
import type { CMSSummary } from '@krantho/ui-react/server'

export async function homeMetadata(): Promise<Metadata> {
  const seo = await resolveSeoContent('pages', 'home')
  return { title: seo.title, description: seo.description }
}

/** The published services, in their configured order */
async function loadServices(): Promise<CMSSummary[]> {
  const services = await getAllCMSSummaries('services')
  return services.sort((a, b) => Number(a.fields['order'] ?? 99) - Number(b.fields['order'] ?? 99))
}

export async function HomePage(): Promise<React.ReactElement> {
  await requirePublished('pages', 'home')
  const services = await loadServices()

  return (
    <div>
      <SeoJsonLd collection="pages" slug="home" />

      {/* Hero */}
      <section className="section-primary">
        <div className="section-container text-center">
          <CMSTextServer
            collection="pages"
            slug="home"
            field="title"
            variant="h1"
            className="hero-title mb-4"
          />
          <div className="mx-auto max-w-2xl opacity-80">
            <CMSTextServer
              collection="pages"
              slug="home"
              field="description"
              variant="body1"
              className="hero-subtitle"
            />
          </div>
          <div className="mt-8">
            <Link href="/services" className="hero-btn">
              Our Services
            </Link>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="section-white">
        <div className="section-container">
          <CMSMarkdownServer collection="pages" slug="home" className="prose max-w-none" />
        </div>
      </section>

      {/* Services overview from collection */}
      <section className="section-muted">
        <div className="section-container">
          <h2 className="section-title">Our Services</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {services.map((svc) => (
              <Link key={svc.slug} href={`/services/${svc.slug}`} className="service-card block">
                <h3 className="text-xl font-semibold mb-2" {...kranthoField(svc, 'title')}>
                  {String(svc.fields['title'] ?? '')}
                </h3>
                <p className="text-muted-foreground" {...kranthoField(svc, 'ingress')}>
                  {String(svc.fields['ingress'] ?? '')}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-white">
        <div className="section-container text-center">
          <h2 className="section-title">Why Acme?</h2>
          <div className="mt-6">
            <Link href="/about" className="hero-btn">
              Learn more about us
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
