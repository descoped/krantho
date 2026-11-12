import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { kranthoField, markBodySections } from '@krantho/core/marks'
import { getAllCMSContent, resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'
import { Html } from '@/components/html'
import { type Doc, list, maybe, page, text } from '@/lib/content'

// `/releases` is the changelog, newest first; `/releases/<slug>` one release.
// The slug is the version with dashes (0-2-0). Cached until Studio changes it.
export const revalidate = false

export function generateStaticParams(): { slug: string[] }[] {
  return []
}

interface Props {
  params: Promise<{ slug?: string[] | undefined }>
}

async function releaseSlug({ params }: Props): Promise<string | null> {
  const { slug } = await params
  if (slug === undefined) return null
  const [name] = slug
  if (slug.length !== 1 || !name) notFound()
  return name
}

/** Newest first: by date, then by version */
async function releases(): Promise<Doc[]> {
  const docs = await getAllCMSContent('releases')
  return [...docs].sort(
    (a, b) =>
      text(b, 'date').localeCompare(text(a, 'date')) ||
      text(b, 'version').localeCompare(text(a, 'version'), undefined, { numeric: true }),
  )
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const slug = await releaseSlug(props)
  const seo = await resolveSeoContent(slug === null ? 'pages' : 'releases', slug ?? 'releases')
  return { title: seo.title, description: seo.description }
}

export default async function Releases(props: Props): Promise<React.ReactElement> {
  const slug = await releaseSlug(props)
  return slug === null ? <Changelog /> : <Release slug={slug} />
}

function Summary({ release }: { release: Doc }): React.ReactElement {
  const highlights = list(release, 'highlights')
  return (
    <>
      <p>
        <time dateTime={text(release, 'date')}>{text(release, 'date')}</time>
      </p>
      <p {...kranthoField(release, 'description')}>{text(release, 'description')}</p>
      {highlights.length > 0 && (
        <ul {...kranthoField(release, 'highlights')}>
          {highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      )}
    </>
  )
}

async function Changelog(): Promise<React.ReactElement> {
  const [intro, published] = await Promise.all([maybe('pages', 'releases'), releases()])
  return (
    <>
      <h1 {...kranthoField(intro, 'title')}>{text(intro, 'title') || 'Changelog'}</h1>
      {intro && (
        <p className="lead" {...kranthoField(intro, 'description')}>
          {text(intro, 'description')}
        </p>
      )}
      {published.length === 0 && <p>No releases are published yet.</p>}
      {published.map((release) => (
        <section key={release.slug} aria-labelledby={`release-${release.slug}`}>
          <h2 id={`release-${release.slug}`} {...kranthoField(release, 'title')}>
            <Link href={`/releases/${release.slug}`}>{text(release, 'title')}</Link>
          </h2>
          <Summary release={release} />
        </section>
      ))}
    </>
  )
}

async function Release({ slug }: { slug: string }): Promise<React.ReactElement> {
  const release = await page('releases', slug)
  return (
    <article>
      <SeoJsonLd collection="releases" slug={slug} />
      <p>
        <Link href="/releases">Changelog</Link>
      </p>
      <h1 {...kranthoField(release, 'title')}>{text(release, 'title')}</h1>
      <Summary release={release} />
      <Html html={markBodySections(release.html, release.rawContent, release)} />
    </article>
  )
}
