import type { Metadata } from 'next'
import Link from 'next/link'
import { kranthoField, markBodySections } from '@krantho/core/marks'
import { notFound } from 'next/navigation'
import '@/lib/krantho'
import { getCMSContent, SeoJsonLd } from '@krantho/ui-react/server'
import type { CMSContent } from '@krantho/ui-react/server'

/** The published service, or null when it has no published version */
async function loadService(slug: string): Promise<CMSContent | null> {
  try {
    return await getCMSContent('services', slug)
  } catch {
    return null
  }
}

export async function serviceMetadata(slug: string): Promise<Metadata> {
  const svc = await loadService(slug)
  if (!svc) return { title: 'Not Found' }
  return {
    title: String(svc.fields['title'] ?? ''),
    description: String(svc.fields['meta-description'] ?? ''),
  }
}

export async function ServiceDetail({ slug }: { slug: string }): Promise<React.ReactElement> {
  const svc = await loadService(slug)
  if (!svc) notFound()

  return (
    <div>
      <SeoJsonLd collection="services" slug={slug} />

      <section className="section-white">
        <div className="section-container">
          <Link href="/services" className="text-sm text-muted-foreground hover:underline mb-4 block">
            &larr; All Services
          </Link>
          <h1 className="mb-4 font-heading text-3xl font-bold" {...kranthoField(svc, 'title')}>
            {String(svc.fields['title'] ?? '')}
          </h1>
          <p className="mb-8 text-lg text-muted-foreground" {...kranthoField(svc, 'ingress')}>
            {String(svc.fields['ingress'] ?? '')}
          </p>
        </div>
      </section>

      <section className="section-muted">
        <div className="section-container">
          <div
            className="prose prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: markBodySections(svc.html, svc.rawContent, svc) }}
          />
        </div>
      </section>
    </div>
  )
}
