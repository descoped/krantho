import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { maybe, page } from '../../../../lib/content'
import { metadataFor } from '../../../../lib/metadata'
import { FeatureDetail } from './detail'
import { FeatureList } from './list'

// /features and /features/<slug>. A dynamic segment, so the build never reads the
// database: each page renders on its first request and stays cached until a
// change in /studio invalidates it.

export const revalidate = false

export function generateStaticParams(): { slug?: string[] }[] {
  return []
}

interface Props {
  params: Promise<{ slug?: string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (!slug) return (await maybe('pages', 'features')) ? metadataFor('pages', 'features') : { title: 'Features' }
  const [name] = slug
  if (slug.length !== 1 || !name) notFound()
  // A missing document 404s here too, so the title never names a page that is not there
  await page('features', name)
  return metadataFor('features', name)
}

export default async function FeaturesPage({ params }: Props): Promise<React.ReactElement> {
  const { slug } = await params
  if (!slug) return <FeatureList />
  const [name] = slug
  if (slug.length !== 1 || !name) notFound()
  return <FeatureDetail slug={name} />
}
