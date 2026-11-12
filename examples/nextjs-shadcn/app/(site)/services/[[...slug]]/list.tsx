import type { Metadata } from 'next'
import Link from 'next/link'
import { kranthoField } from '@krantho/core/marks'
import { requirePublished } from '@/lib/krantho'
import { getAllCMSSummaries, getCMSContent, resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'
import type { CMSSummary } from '@krantho/ui-react/server'

export async function serviceListMetadata(): Promise<Metadata> {
  const seo = await resolveSeoContent('pages', 'services')
  return { title: seo.title, description: seo.description }
}

/** The published services, in their configured order */
async function loadServices(): Promise<CMSSummary[]> {
  const services = await getAllCMSSummaries('services')
  return services.sort((a, b) => Number(a.fields['order'] ?? 99) - Number(b.fields['order'] ?? 99))
}

export async function ServiceList(): Promise<React.ReactElement> {
  await requirePublished('pages', 'services')
  const page = await getCMSContent('pages', 'services')
  const fields = page.fields as Record<string, string>
  const serviceItems = await loadServices()

  return (
    <div>
      <SeoJsonLd collection="pages" slug="services" />

      <section className="section-white">
        <div className="section-container">
          <h1 className="mb-4 font-heading text-3xl font-bold" {...kranthoField(page, 'title')}>
            {fields['title']}
          </h1>
          <p className="mb-10 text-lg text-muted-foreground" {...kranthoField(page, 'description')}>
            {fields['description']}
          </p>
        </div>
      </section>

      <section className="section-muted">
        <div className="section-container">
          <div className="grid gap-6 md:grid-cols-3">
            {serviceItems.map((svc) => (
              <Link key={svc.slug} href={`/services/${svc.slug}`} className="service-card block">
                <h2 className="text-xl font-semibold mb-2" {...kranthoField(svc, 'title')}>
                  {String(svc.fields['title'] ?? '')}
                </h2>
                <p className="text-muted-foreground" {...kranthoField(svc, 'ingress')}>
                  {String(svc.fields['ingress'] ?? '')}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
