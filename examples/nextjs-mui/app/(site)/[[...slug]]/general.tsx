import type { Metadata } from 'next'
import { requirePublished } from '@/lib/krantho'
import { resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'
import GeneralContent from './general-content'

/** SEO metadata of a page that has no template of its own */
export async function generalMetadata(slug: string): Promise<Metadata> {
  await requirePublished('pages', slug)
  const seo = await resolveSeoContent('pages', slug)
  return { title: seo.title, description: seo.description }
}

/** Any published page without a template of its own */
export async function GeneralPage({ slug }: { slug: string }): Promise<React.ReactElement> {
  await requirePublished('pages', slug)
  return (
    <>
      <SeoJsonLd collection="pages" slug={slug} />
      <GeneralContent slug={slug} />
    </>
  )
}
