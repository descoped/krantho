import type { Metadata } from 'next'
import { requirePublished } from '@/lib/krantho'
import { resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'
import AboutContent from './about-content'

export async function aboutMetadata(): Promise<Metadata> {
  const seo = await resolveSeoContent('pages', 'about')
  return { title: seo.title, description: seo.description }
}

export async function AboutPage(): Promise<React.ReactElement> {
  await requirePublished('pages', 'about')
  return (
    <>
      <SeoJsonLd collection="pages" slug="about" />
      <AboutContent />
    </>
  )
}
