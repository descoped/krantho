import { type BodySection, splitSections } from '@krantho/core'
import { type KranthoMarks, kranthoField, type MarkedDocument } from '@krantho/core/marks'
import { Icon, type IconName } from './icons'
import '../styles/product.css'

// The hero band of a product page: eyebrow, the page's one <h1>, a lede and
// optional actions. A faint aurora and topographic contour lines sit behind it
// (product.css), and an icon, when given, is drawn as the hub of a small content
// graph — the same motif as the landing hero, at a quieter scale.

export interface PageHeroProps {
  /** A short label above the title; may be a link back to the index */
  eyebrow?: React.ReactNode
  title: string
  lede?: string | undefined
  /** Drawn as the hub of the content-graph illustration */
  icon?: IconName | undefined
  /** Buttons or links under the lede */
  actions?: React.ReactNode
  /** Badges or facts shown between the lede and the actions */
  meta?: React.ReactNode
  /** The Live marks of the fields the hero renders, in an editor's preview */
  marks?: HeroMarks | undefined
}

/** The Live marks of a hero's parts: the field each one renders */
export interface HeroMarks {
  eyebrow?: KranthoMarks | undefined
  title?: KranthoMarks | undefined
  lede?: KranthoMarks | undefined
  icon?: KranthoMarks | undefined
}

type HeroPart = keyof HeroMarks

/** A hero's marks from one document: the field each part renders, by part */
export function heroMarks(
  doc: MarkedDocument | undefined,
  fields: Partial<Record<HeroPart, string>>,
): HeroMarks {
  const marks: HeroMarks = {}
  for (const [part, field] of Object.entries(fields) as [HeroPart, string][]) {
    marks[part] = kranthoField(doc, field)
  }
  return marks
}

/** A document body without its leading `# title`: the hero renders the page's one <h1> */
export function withoutTitle(markdown: string): string {
  return markdown.replace(/^\s*#\s[^\n]*\n?/, '').trim()
}

export interface ContractSection extends BodySection {
  /** The contract title this section fulfils (lowercase), or undefined for free prose */
  role: string | undefined
}

/**
 * A body read against a section contract: the intro under the hero, and every
 * `##` section in the editor's order, each tagged with the contract role it
 * fulfils. The template designs the known roles and renders the rest as prose.
 */
export function readContract(
  markdown: string,
  contract: readonly string[],
): { intro: string; sections: ContractSection[] } {
  const { lead, sections } = splitSections(markdown)
  const known = new Set(contract.map((title) => title.toLowerCase()))
  return {
    intro: withoutTitle(lead),
    sections: sections.map((section) => {
      const key = section.heading.toLowerCase()
      return { ...section, role: known.has(key) ? key : undefined }
    }),
  }
}

function HeroGraph({ icon, marks }: { icon: IconName; marks?: KranthoMarks | undefined }): React.ReactElement {
  return (
    <div className="page-hero__graph" aria-hidden="true">
      <svg viewBox="0 0 240 200" width="240" height="200" fill="none" className="page-hero__edges">
        <path d="M120 100 38 42" pathLength={1} />
        <path d="M120 100 206 52" pathLength={1} />
        <path d="M120 100 188 170" pathLength={1} />
        <path d="M120 100 44 164" pathLength={1} />
        <path d="M38 42 206 52" pathLength={1} className="page-hero__edge--faint" />
        <circle cx="38" cy="42" r="6" className="page-hero__node" />
        <circle cx="206" cy="52" r="8" className="page-hero__node page-hero__node--accent" />
        <circle cx="188" cy="170" r="6" className="page-hero__node" />
        <circle cx="44" cy="164" r="5" className="page-hero__node page-hero__node--violet" />
      </svg>
      <span className="page-hero__hub" {...marks}>
        <Icon name={icon} size={30} />
      </span>
    </div>
  )
}

export function PageHero({ eyebrow, title, lede, icon, actions, meta, marks }: PageHeroProps): React.ReactElement {
  return (
    <header className={`page-hero${icon ? ' page-hero--with-graph' : ''}`}>
      <div className="page-hero__texture" aria-hidden="true">
        <span className="page-hero__aurora" />
        <span className="page-hero__contour" />
      </div>
      <div className="container page-hero__inner">
        <div className="page-hero__copy">
          {eyebrow && (
            <p className="eyebrow page-hero__eyebrow" {...marks?.eyebrow}>
              {eyebrow}
            </p>
          )}
          <h1 className="page-hero__title" {...marks?.title}>
            {title}
          </h1>
          {lede && (
            <p className="lede page-hero__lede" {...marks?.lede}>
              {lede}
            </p>
          )}
          {meta && <div className="page-hero__meta">{meta}</div>}
          {actions && <div className="page-hero__actions">{actions}</div>}
        </div>
        {icon && <HeroGraph icon={icon} marks={marks?.icon} />}
      </div>
    </header>
  )
}
