import { kranthoField } from '@krantho/core/marks'
import Link from 'next/link'
import { SeoJsonLd } from '@krantho/ui-react/server'
import { maybe, text, summaries } from '../../../../lib/content'
import { routeOf } from '../../../../lib/routes'
import { HowMade } from '../../../components/how-made'
import { Icon, isIconName } from '../../../components/icons'
import { Markdown } from '../../../components/markdown'
import { heroMarks, PageHero, withoutTitle } from '../../../components/page-hero'
import '../../../styles/product.css'

// The features index: the `features` page document introduces it, and every
// published feature becomes a card — icon, title, the benefit to the reader and
// a short description — in the order editors give them.

export async function FeatureList(): Promise<React.ReactElement> {
  const [intro, features] = await Promise.all([maybe('pages', 'features'), summaries('features')])
  // The page document's body, if any, closes the page; its own `# title` is the hero's
  const prose = intro ? withoutTitle(intro.rawContent) : ''

  return (
    <>
      {intro && <SeoJsonLd collection="pages" slug="features" />}
      <PageHero
        eyebrow={text(intro, 'eyebrow') || undefined}
        title={text(intro, 'title') || 'Features'}
        lede={text(intro, 'description') || undefined}
        marks={heroMarks(intro, { eyebrow: 'eyebrow', title: 'title', lede: 'description' })}
      />

      <section className="section section--tight-top">
        <div className="container">
          <ol className="feature-grid">
            {features.map((feature, index) => {
              const icon = text(feature, 'icon')
              return (
                <li key={feature.slug}>
                  <Link href={routeOf('features', feature.slug)} className="card feature-card">
                    <span className="feature-card__top">
                      <span className="icon-tile" {...kranthoField(feature, 'icon')}>
                        {isIconName(icon) && <Icon name={icon} size={22} />}
                      </span>
                      <span className="feature-card__index" aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </span>
                    <h2 className="feature-card__title" {...kranthoField(feature, 'title')}>
                      {text(feature, 'title')}
                    </h2>
                    <p className="feature-card__benefit" {...kranthoField(feature, 'benefit')}>
                      {text(feature, 'benefit')}
                    </p>
                    <p className="feature-card__description" {...kranthoField(feature, 'description')}>
                      {text(feature, 'description')}
                    </p>
                    <Icon name="arrow" size={18} className="feature-card__arrow" />
                  </Link>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      {prose && (
        <section className="section section--subtle">
          <div className="container">
            <Markdown source={prose} body={intro} />
          </div>
        </section>
      )}

      <HowMade
        template="app/(site)/features/[[...slug]]/list.tsx"
        sources={[
          { collection: 'pages', slug: 'features', doc: intro },
          ...features.map((feature) => ({ collection: 'features', slug: feature.slug, doc: feature })),
        ]}
        jsonLd={Boolean(intro)}
      />
    </>
  )
}
