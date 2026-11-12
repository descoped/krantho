import { kranthoField } from '@krantho/core/marks'
import Link from 'next/link'
import { SeoJsonLd } from '@krantho/ui-react/server'
import { list, maybe, text, summaries } from '../../../../lib/content'
import { stackLabel } from '../../../../lib/markdown'
import { routeOf } from '../../../../lib/routes'
import { HowMade } from '../../../components/how-made'
import { Icon } from '../../../components/icons'
import { Markdown } from '../../../components/markdown'
import { heroMarks, PageHero, withoutTitle } from '../../../components/page-hero'
import '../../../styles/product.css'

// The stacks index: the `stacks` page document introduces it, and every published
// stack becomes a large card — the framework, its tagline, and the packages a
// project on it installs.

export async function StackList(): Promise<React.ReactElement> {
  const [intro, stacks] = await Promise.all([maybe('pages', 'stacks'), summaries('stacks')])
  const prose = intro ? withoutTitle(intro.rawContent) : ''

  return (
    <>
      {intro && <SeoJsonLd collection="pages" slug="stacks" />}
      <PageHero
        eyebrow={text(intro, 'eyebrow') || undefined}
        title={text(intro, 'title') || 'Stacks'}
        lede={text(intro, 'description') || undefined}
        marks={heroMarks(intro, { eyebrow: 'eyebrow', title: 'title', lede: 'description' })}
      />

      <section className="section section--tight-top">
        <div className="container">
          <ul className="stack-grid">
            {stacks.map((stack) => {
              const packages = list(stack, 'packages')
              const ui = list(stack, 'ui-packages')
              return (
                <li key={stack.slug}>
                  <Link href={routeOf('stacks', stack.slug)} className="card stack-card">
                    <span className="stack-card__framework" {...kranthoField(stack, 'framework')}>
                      <Icon name="frameworks" size={16} />
                      {stackLabel(text(stack, 'framework'))}
                    </span>
                    <h2 className="stack-card__title" {...kranthoField(stack, 'title')}>
                      {text(stack, 'title')}
                    </h2>
                    <p className="stack-card__tagline" {...kranthoField(stack, 'tagline')}>
                      {text(stack, 'tagline')}
                    </p>
                    <p className="stack-card__description" {...kranthoField(stack, 'description')}>
                      {text(stack, 'description')}
                    </p>
                    {packages.length > 0 && (
                      <ul className="package-list" aria-label="Packages" {...kranthoField(stack, 'packages')}>
                        {packages.map((name) => (
                          <li key={name} className="badge badge--package">
                            {name}
                          </li>
                        ))}
                      </ul>
                    )}
                    {ui.length > 0 && (
                      <ul className="package-list package-list--quiet" aria-label="UI packages" {...kranthoField(stack, 'ui-packages')}>
                        {ui.map((name) => (
                          <li key={name} className="badge badge--package">
                            {name}
                          </li>
                        ))}
                      </ul>
                    )}
                    <Icon name="arrow" size={18} className="stack-card__arrow" />
                  </Link>
                </li>
              )
            })}
          </ul>
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
        template="app/(site)/stacks/[[...slug]]/list.tsx"
        sources={[
          { collection: 'pages', slug: 'stacks', doc: intro },
          ...stacks.map((stack) => ({ collection: 'stacks', slug: stack.slug, doc: stack })),
        ]}
        jsonLd={Boolean(intro)}
      />
    </>
  )
}
