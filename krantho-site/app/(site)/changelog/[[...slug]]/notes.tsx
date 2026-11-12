import { LEAD_SECTION } from '@krantho/core'
import { kranthoSection } from '@krantho/core/marks'
import type { Doc } from '../../../../lib/content'
import { readContract } from '../../../components/page-hero'
import { Icon } from '../../../components/icons'
import { Markdown } from '../../../components/markdown'
import { slugify } from '../../../../lib/markdown'
import { collections } from '../../../../krantho.collections'

// A release's full notes. The section contract Added / Changed / Fixed gives each
// kind of change its own marker and color, so a reader scanning for fixes finds
// them; sections outside the contract render as prose.

// The sections this template designs, as the collection declares them
const CONTRACT = collections.releases.sections

// The icon set has no plus; this one follows its grid and stroke
const PLUS = (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const MARKERS: Record<string, React.ReactNode> = {
  added: PLUS,
  changed: <Icon name="arrow" size={14} />,
  fixed: <Icon name="check" size={14} />,
}

/** The notes of one release; `anchor` keeps its section ids unique on a page of releases */
export function ReleaseNotes({ release, anchor }: { release: Doc; anchor: string }): React.ReactElement | null {
  const { intro, sections } = readContract(release.rawContent, CONTRACT)
  if (!intro && sections.length === 0) return null
  return (
    <div className="release-body">
      {intro && <Markdown source={intro} className="prose contract-intro" marks={kranthoSection(release, LEAD_SECTION)} />}
      {sections.map((section) => {
        const marker = section.role ? MARKERS[section.role] : undefined
        const id = `${anchor}-${slugify(section.heading)}`
        return (
          <section
            key={section.heading}
            className={`change-group change-group--${section.role ?? 'prose'}`}
            aria-labelledby={id}
            {...kranthoSection(release, section.heading)}
          >
            <h3 id={id} className="change-group__title">
              {marker && (
                <span className="change-group__marker" aria-hidden="true">
                  {marker}
                </span>
              )}
              {section.heading}
            </h3>
            <Markdown source={section.markdown} className="prose change-group__body" />
          </section>
        )
      })}
    </div>
  )
}
