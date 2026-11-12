import type { Metadata } from 'next'
import { requirePublished } from '@/lib/krantho'
import { resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'
import HomeContent from './home-content'

export async function homeMetadata(): Promise<Metadata> {
  const seo = await resolveSeoContent('pages', 'home')
  return { title: seo.title, description: seo.description }
}

export async function HomePage(): Promise<React.ReactElement> {
  await requirePublished('pages', 'home')
  return (
    <>
      <SeoJsonLd collection="pages" slug="home" />
      <HomeContent />
    </>
  )
}
