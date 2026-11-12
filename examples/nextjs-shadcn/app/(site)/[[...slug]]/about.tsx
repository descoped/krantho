import type { Metadata } from 'next'
import { requirePublished } from '@/lib/krantho'
import { getCMSContent, CMSTextServer, CMSMarkdownServer, resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'

export async function aboutMetadata(): Promise<Metadata> {
  const seo = await resolveSeoContent('pages', 'about')
  return { title: seo.title, description: seo.description }
}

export async function AboutPage(): Promise<React.ReactElement> {
  await requirePublished('pages', 'about')
  return (
    <div>
      <SeoJsonLd collection="pages" slug="about" />

      <section className="section-white">
        <div className="section-container">
          <CMSTextServer
            collection="pages"
            slug="about"
            field="title"
            variant="h1"
            className="mb-4 font-heading text-3xl font-bold"
          />
          <CMSTextServer
            collection="pages"
            slug="about"
            field="description"
            variant="body1"
            className="mb-10 text-lg text-muted-fg"
          />
        </div>
      </section>

      <section className="section-muted">
        <div className="section-container">
          <CMSMarkdownServer collection="pages" slug="about" section="Our Team" className="prose max-w-none" />
        </div>
      </section>

      <section className="section-white">
        <div className="section-container">
          <CMSMarkdownServer collection="pages" slug="about" section="Our Approach" className="prose max-w-none" />
        </div>
      </section>
    </div>
  )
}
