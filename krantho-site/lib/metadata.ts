import type { Metadata } from 'next'
import { resolveSeoContent } from '@krantho/ui-react/server'
import { routeOf } from './routes'

// Page metadata from krantho: title and description from the document's SEO
// configuration and published fields, a canonical URL from the route it renders
// at, and an Open Graph image generated from the same document (app/og/route.tsx).

export async function metadataFor(collection: string, slug: string): Promise<Metadata> {
  const seo = await resolveSeoContent(collection, slug)
  const path = routeOf(collection, slug)
  const image = `/og?collection=${encodeURIComponent(collection)}&slug=${encodeURIComponent(slug)}`
  const title = seo.title
  return {
    // The landing page's title stands alone; others take the site suffix
    title: collection === 'landing' ? { absolute: title } : title,
    description: seo.description,
    alternates: { canonical: path },
    openGraph: {
      type: collection === 'docs' || collection === 'releases' ? 'article' : 'website',
      url: path,
      title,
      description: seo.description,
      siteName: 'Krantho',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: seo.description,
      images: [image],
    },
  }
}
