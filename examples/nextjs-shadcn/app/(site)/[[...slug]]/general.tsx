import type { Metadata } from 'next'
import { requirePublished } from '@/lib/krantho'
import { CMSTextServer, CMSMarkdownServer, resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'

/** SEO metadata of a page that has no template of its own */
export async function generalMetadata(slug: string): Promise<Metadata> {
  await requirePublished('pages', slug)
  const seo = await resolveSeoContent('pages', slug)
  return { title: seo.title, description: seo.description }
}

/** Any published page without a template of its own: its title, its description as the lead, and its body */
export async function GeneralPage({ slug }: { slug: string }): Promise<React.ReactElement> {
  await requirePublished('pages', slug)
  return (
    <div>
      <SeoJsonLd collection="pages" slug={slug} />

      <section className="section-white">
        <div className="section-container">
          <CMSTextServer
            collection="pages"
            slug={slug}
            field="title"
            variant="h1"
            className="mb-4 font-heading text-3xl font-bold"
          />
          <CMSTextServer
            collection="pages"
            slug={slug}
            field="description"
            variant="body1"
            className="mb-10 text-lg text-muted-fg"
          />
        </div>
      </section>

      <section className="section-muted">
        <div className="section-container">
          <CMSMarkdownServer collection="pages" slug={slug} className="prose max-w-none" />
        </div>
      </section>
    </div>
  )
}
