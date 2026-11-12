import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ServiceDetail, serviceMetadata } from './detail'
import { ServiceList, serviceListMetadata } from './list'

// `/services` lists the services, `/services/<slug>` shows one. Rendered on first
// request and cached until a change invalidates it (`cache.pages: 'next-isr'`).
export const revalidate = false

export function generateStaticParams(): { slug: string[] }[] {
  return []
}

interface ServicesProps {
  params: Promise<{ slug?: string[] | undefined }>
}

/** The service a path names, or null for the list */
async function serviceSlug({ params }: ServicesProps): Promise<string | null> {
  const { slug } = await params
  if (slug === undefined) return null
  const [name] = slug
  if (slug.length !== 1 || name === undefined) notFound()
  return name
}

export async function generateMetadata(props: ServicesProps): Promise<Metadata> {
  const slug = await serviceSlug(props)
  return slug === null ? serviceListMetadata() : serviceMetadata(slug)
}

export default async function Services(props: ServicesProps): Promise<React.ReactElement> {
  const slug = await serviceSlug(props)
  return slug === null ? <ServiceList /> : <ServiceDetail slug={slug} />
}
