import { type KranthoMarks, kranthoField } from '@krantho/core/marks'
import Link from 'next/link'
import { type Summary, text } from '../../lib/content'
import { routeOf } from '../../lib/routes'
import { Icon, type IconName } from './icons'
import '../styles/product.css'

// The "Continue" block that closes a product page — a few link cards to where the
// reader goes next — and the card that links a page to its docs page.

export interface NextStep {
  href: string
  title: string
  description?: string | undefined
  /** A short mono label above the title (a framework, a version, a kind) */
  label?: string | undefined
  icon?: IconName | undefined
  /** The Live marks of the parts that render a field of the step's document */
  marks?: StepMarks | undefined
}

/** The Live marks of a step's parts: the field each one renders */
export interface StepMarks {
  title?: KranthoMarks | undefined
  description?: KranthoMarks | undefined
  label?: KranthoMarks | undefined
  icon?: KranthoMarks | undefined
}

export function NextSteps({
  steps,
  title = 'Continue',
}: {
  steps: NextStep[]
  title?: string
}): React.ReactElement | null {
  if (steps.length === 0) return null
  return (
    <section className="section next-steps" aria-labelledby="next-steps-title">
      <div className="container">
        <h2 id="next-steps-title" className="next-steps__title">
          {title}
        </h2>
        <ul className="next-steps__grid">
          {steps.map((step) => (
            <li key={step.href}>
              <Link href={step.href} className="card next-step">
                <span className="next-step__head">
                  {step.icon && (
                    <span className="icon-tile icon-tile--small" {...step.marks?.icon}>
                      <Icon name={step.icon} size={18} />
                    </span>
                  )}
                  {step.label && (
                    <span className="next-step__label" {...step.marks?.label}>
                      {step.label}
                    </span>
                  )}
                </span>
                <h3 className="next-step__title" {...step.marks?.title}>
                  {step.title}
                </h3>
                {step.description && (
                  <p className="next-step__description" {...step.marks?.description}>
                    {step.description}
                  </p>
                )}
                <Icon name="arrow" size={18} className="next-step__arrow" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** A card linking to the docs page a product page is backed by (`from`'s `docs-page`) */
export function DocsLink({ slug, doc, from }: { slug: string; doc: Summary | undefined; from?: Summary | undefined }): React.ReactElement | null {
  if (!doc) return null
  const description = text(doc, 'description')
  return (
    <div className="container docs-link-wrap" {...kranthoField(from, 'docs-page')}>
      <Link href={routeOf('docs', slug)} className="docs-link">
        <span className="docs-link__icon" aria-hidden="true">
          <Icon name="book" size={22} />
        </span>
        <span className="docs-link__body">
          <span className="docs-link__label">Read the docs</span>
          <span className="docs-link__title" {...kranthoField(doc, 'title')}>
            {text(doc, 'title')}
          </span>
          {description && (
            <span className="docs-link__description" {...kranthoField(doc, 'description')}>
              {description}
            </span>
          )}
        </span>
        <Icon name="arrow" size={20} className="docs-link__arrow" />
      </Link>
    </div>
  )
}
