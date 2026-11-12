import { kranthoField } from '@krantho/core/marks'
import { SeoJsonLd } from '@krantho/ui-react/server'
import { list, maybe, text } from '../../../../lib/content'
import { HowMade } from '../../../components/how-made'
import { Markdown } from '../../../components/markdown'
import { heroMarks, PageHero, withoutTitle } from '../../../components/page-hero'
import { SectionHash } from '../../../components/section-hash'
import { ReleaseNotes } from './notes'
import { releaseAnchor } from '../../../../lib/routes'
import { GithubRelease, ReleaseDate, releasesNewestFirst, Version } from './releases'
import '../../../styles/product.css'

// The changelog, one page: the `changelog` page document introduces it, and every
// published release sits on one timeline, newest first — version, date, what it
// is about, its highlights and its full notes. Each release has an anchor
// (/changelog#v0.7.7), and links to its release on GitHub once that is public.

export async function ReleaseList(): Promise<React.ReactElement> {
  const [intro, releases] = await Promise.all([maybe('pages', 'changelog'), releasesNewestFirst()])
  const prose = intro ? withoutTitle(intro.rawContent) : ''

  return (
    <>
      {intro && <SeoJsonLd collection="pages" slug="changelog" />}
      <PageHero
        eyebrow={text(intro, 'eyebrow') || undefined}
        title={text(intro, 'title') || 'Changelog'}
        lede={text(intro, 'description') || undefined}
        marks={heroMarks(intro, { eyebrow: 'eyebrow', title: 'title', lede: 'description' })}
      />

      <section className="section section--tight-top">
        <div className="container changelog">
          {prose && <Markdown source={prose} className="prose changelog__intro" body={intro} />}
          <SectionHash selector=".timeline > li[id]" />
          <ol className="timeline">
            {releases.map((release) => {
              const anchor = releaseAnchor(release.slug, release.fields)
              const highlights = list(release, 'highlights')
              return (
                <li key={release.slug} id={anchor} className="timeline__item">
                  <span className="timeline__node" aria-hidden="true" />
                  <div className="timeline__meta">
                    <Version doc={release} />
                    <ReleaseDate doc={release} />
                  </div>
                  <article className="timeline__entry">
                    <h2 className="timeline__title">
                      <a href={`#${anchor}`} {...kranthoField(release, 'title')}>
                        {text(release, 'title')}
                      </a>
                    </h2>
                    <p className="timeline__description" {...kranthoField(release, 'description')}>
                      {text(release, 'description')}
                    </p>
                    {highlights.length > 0 && (
                      <ul className="highlights" {...kranthoField(release, 'highlights')}>
                        {highlights.map((highlight) => (
                          <li key={highlight}>{highlight}</li>
                        ))}
                      </ul>
                    )}
                    <details className="release-notes">
                      <summary className="link-arrow timeline__more">Release notes</summary>
                      <ReleaseNotes release={release} anchor={anchor} />
                    </details>
                    <GithubRelease doc={release} />
                  </article>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      <HowMade
        template="app/(site)/changelog/[[...slug]]/list.tsx"
        sources={[
          { collection: 'pages', slug: 'changelog', doc: intro },
          ...releases.map((release) => ({ collection: 'releases', slug: release.slug, doc: release })),
        ]}
        jsonLd={Boolean(intro)}
      />
    </>
  )
}
