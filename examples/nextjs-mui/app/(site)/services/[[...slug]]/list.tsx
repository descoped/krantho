import type { Metadata } from 'next'
import { requirePublished } from '@/lib/krantho'
import { resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'
import ServicesContent from './services-content'

export async function serviceListMetadata(): Promise<Metadata> {
  const seo = await resolveSeoContent('pages', 'services')
  return { title: seo.title, description: seo.description }
}

export async function ServiceList(): Promise<React.ReactElement> {
  await requirePublished('pages', 'services')
  return (
    <>
      <SeoJsonLd collection="pages" slug="services" />
      <ServicesContent />
    </>
  )
}
