import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { page } from '../../../lib/content'
import { metadataFor } from '../../../lib/metadata'
import { Landing } from './landing'
import { Standalone } from './standalone'

// `/` is the landing page (landing/home); `/<slug>` is a document from the pages
// collection (about, agent skills, …). Sections with their own routes (features,
// docs, stacks, …) never reach this catch-all. Nothing renders at build — the
// build never reads the database; each page renders on its first request and
// stays cached until a change in /studio invalidates it.
export const revalidate = false

export function generateStaticParams(): { slug: string[] }[] {
  return []
}

interface PageProps {
  params: Promise<{ slug?: string[] | undefined }>
}

/** A pages slug as Studio writes it; anything else cannot be a page */
const SLUG = /^[a-z0-9][a-z0-9-]*$/

/** The pages slug this path renders, undefined for the landing page; 404 otherwise */
async function target({ params }: PageProps): Promise<string | undefined> {
  const { slug } = await params
  if (!slug || slug.length === 0) return undefined
  const [name] = slug
  // `home` is the landing page's document, served at `/` only
  if (slug.length !== 1 || !name || name === 'home' || !SLUG.test(name)) notFound()
  return name
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const slug = await target(props)
  if (slug === undefined) return metadataFor('landing', 'home')
  await page('pages', slug)
  return metadataFor('pages', slug)
}

export default async function Page(props: PageProps): Promise<React.ReactElement> {
  const slug = await target(props)
  return slug === undefined ? <Landing /> : <Standalone slug={slug} />
}
