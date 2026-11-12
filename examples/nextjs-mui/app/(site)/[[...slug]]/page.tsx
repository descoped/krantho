import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AboutPage, aboutMetadata } from './about'
import { GeneralPage, generalMetadata } from './general'
import { HomePage, homeMetadata } from './home'

// The site's pages. None is rendered at build — the build never reads the
// database. Each renders on its first request and stays cached until Studio
// changes what it shows (`cache.pages: 'next-isr'`).
export const revalidate = false

export function generateStaticParams(): { slug: string[] }[] {
  return []
}

interface PageProps {
  params: Promise<{ slug?: string[] | undefined }>
}

/** The pages with a template of their own; every other published page renders the general template */
const PAGES = {
  home: { Page: HomePage, metadata: homeMetadata },
  about: { Page: AboutPage, metadata: aboutMetadata },
} as const

type PageName = keyof typeof PAGES

interface Resolved {
  Page: () => Promise<React.ReactElement>
  metadata: () => Promise<Metadata>
}

/**
 * `/` is the home page, `/<name>` the page with a template of its own or else
 * the general template; a slug with no published page is not found, and so is
 * a path of more than one segment
 */
async function page({ params }: PageProps): Promise<Resolved> {
  const { slug } = await params
  if (slug === undefined) return PAGES.home
  const [name] = slug
  if (slug.length !== 1 || !name || name === 'home') notFound()
  if (Object.hasOwn(PAGES, name)) return PAGES[name as PageName]
  return { Page: () => GeneralPage({ slug: name }), metadata: () => generalMetadata(name) }
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  return (await page(props)).metadata()
}

export default async function Page(props: PageProps): Promise<React.ReactElement> {
  const { Page: Content } = await page(props)
  return <Content />
}
