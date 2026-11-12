import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { HOME_SLUG } from '../../../components/docs-areas'
import { page } from '../../../../lib/content'
import { metadataFor } from '../../../../lib/metadata'
import { DocsArticle } from './docs-article'
import { DocsHome } from './docs-home'
import '../../../styles/docs.css'

// The Krantho Developer Documentation: /docs renders the `index` docs document
// as the docs home, /docs/<slug> any other published docs document. URLs are
// flat; the sidebar groups pages by their `area` field. A dynamic segment with no
// build-time params: the build never reads the database, and each page stays
// cached until a change in /studio invalidates it.

export const revalidate = false

export function generateStaticParams(): { slug?: string[] }[] {
  return []
}

interface Props {
  params: Promise<{ slug?: string[] }>
}

/** The docs slug a path renders, or undefined when the path is not a docs page */
function slugOf(parts: string[] | undefined): string | undefined {
  if (!parts || parts.length === 0) return HOME_SLUG
  if (parts.length > 1) return undefined
  return parts[0]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = slugOf((await params).slug)
  if (!slug) notFound()
  // A missing document 404s here too, so the title never names a page that is not there
  await page('docs', slug)
  return metadataFor('docs', slug)
}

export default async function DocsPage({ params }: Props): Promise<React.ReactElement> {
  const { slug: parts } = await params
  const slug = slugOf(parts)
  if (!slug) notFound()
  if (slug === HOME_SLUG && parts?.length) permanentRedirect('/docs')
  if (slug === HOME_SLUG) return <DocsHome />
  return <DocsArticle slug={slug} />
}
