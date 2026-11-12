import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { kranthoField, markBodySections } from '@krantho/core/marks'
import { resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'
import { Html } from '@/components/html'
import { all, imageUrl, maybe, page, text } from '@/lib/content'

// `/features` lists the features, `/features/<slug>` shows one. The list's own
// title and intro come from the `pages/features` document, which also puts
// /features in krantho's sitemap. Cached until Studio changes what it shows.
export const revalidate = false

export function generateStaticParams(): { slug: string[] }[] {
  return []
}

interface Props {
  params: Promise<{ slug?: string[] | undefined }>
}

/** The feature a path names, or null for the list */
async function featureSlug({ params }: Props): Promise<string | null> {
  const { slug } = await params
  if (slug === undefined) return null
  const [name] = slug
  if (slug.length !== 1 || !name) notFound()
  return name
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const slug = await featureSlug(props)
  const seo = await resolveSeoContent(slug === null ? 'pages' : 'features', slug ?? 'features')
  return { title: seo.title, description: seo.description }
}

export default async function Features(props: Props): Promise<React.ReactElement> {
  const slug = await featureSlug(props)
  return slug === null ? <FeatureList /> : <FeatureDetail slug={slug} />
}

async function FeatureList(): Promise<React.ReactElement> {
  const [intro, features] = await Promise.all([maybe('pages', 'features'), all('features')])
  return (
    <>
      {intro && <SeoJsonLd collection="pages" slug="features" />}
      <h1 {...kranthoField(intro, 'title')}>{text(intro, 'title') || 'Features'}</h1>
      {intro && (
        <p className="lead" {...kranthoField(intro, 'description')}>
          {text(intro, 'description')}
        </p>
      )}
      {features.length === 0 ? (
        <p>No features are published yet.</p>
      ) : (
        <ul className="cards">
          {features.map((feature) => (
            <li key={feature.slug} className="card">
              <h2 {...kranthoField(feature, 'title')}>
                <Link href={`/features/${feature.slug}`}>{text(feature, 'title')}</Link>
              </h2>
              <p {...kranthoField(feature, 'description')}>{text(feature, 'description')}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** Feature page: benefit, the body (how it works, proof, limits), then where to read more */
async function FeatureDetail({ slug }: { slug: string }): Promise<React.ReactElement> {
  const feature = await page('features', slug)
  const docsPage = await maybe('docs', text(feature, 'docs-page'))
  const image = text(feature, 'image')
  return (
    <article>
      <SeoJsonLd collection="features" slug={slug} />
      <p>
        <Link href="/features">Features</Link>
      </p>
      <h1 {...kranthoField(feature, 'title')}>{text(feature, 'title')}</h1>
      <p className="lead" {...kranthoField(feature, 'benefit')}>
        {text(feature, 'benefit')}
      </p>
      {image && (
        <img
          src={imageUrl(image, 'xl', '16:9')}
          alt={text(feature, 'image-alt')}
          width={1024}
          height={576}
          {...kranthoField(feature, 'image')}
        />
      )}
      <Html html={markBodySections(feature.html, feature.rawContent, feature)} />
      {docsPage && (
        <p>
          <Link href={`/docs/${docsPage.slug}`}>Read {text(docsPage, 'title')} in the docs</Link>
        </p>
      )}
    </article>
  )
}
