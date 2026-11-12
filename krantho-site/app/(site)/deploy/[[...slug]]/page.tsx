import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { maybe, page } from '../../../../lib/content'
import { metadataFor } from '../../../../lib/metadata'
import { HostDetail } from './detail'
import { HostList } from './list'

// /deploy and /deploy/<slug>, rendering the `hosts` collection. A dynamic segment,
// so the build never reads the database: each page renders on its first request
// and stays cached until a change in /studio invalidates it.

export const revalidate = false

export function generateStaticParams(): { slug?: string[] }[] {
  return []
}

interface Props {
  params: Promise<{ slug?: string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (!slug) return (await maybe('pages', 'deploy')) ? metadataFor('pages', 'deploy') : { title: 'Deploy' }
  const [name] = slug
  if (slug.length !== 1 || !name) notFound()
  // A missing document 404s here too, so the title never names a page that is not there
  await page('hosts', name)
  return metadataFor('hosts', name)
}

export default async function DeployPage({ params }: Props): Promise<React.ReactElement> {
  const { slug } = await params
  if (!slug) return <HostList />
  const [name] = slug
  if (slug.length !== 1 || !name) notFound()
  return <HostDetail slug={name} />
}
