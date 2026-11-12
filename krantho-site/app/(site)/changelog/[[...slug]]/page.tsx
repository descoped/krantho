import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { maybe } from '../../../../lib/content'
import { metadataFor } from '../../../../lib/metadata'
import { ReleaseList } from './list'

// /changelog: every release on one page, from the `releases` collection, which
// has no pages of its own (`path: false`). The release pages that came before it,
// /changelog/<slug>, redirect to their anchor here (next.config.ts). A dynamic
// segment, so the build never reads the database: the page renders on its first
// request and stays cached until a change in /studio invalidates it.

export const revalidate = false

export function generateStaticParams(): { slug?: string[] }[] {
  return []
}

interface Props {
  params: Promise<{ slug?: string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (slug) notFound()
  return (await maybe('pages', 'changelog')) ? metadataFor('pages', 'changelog') : { title: 'Changelog' }
}

export default async function ChangelogPage({ params }: Props): Promise<React.ReactElement> {
  const { slug } = await params
  if (slug) notFound()
  return <ReleaseList />
}
