import { ImageResponse } from 'next/og'
import { collections } from '../../krantho.collections'
import { type Doc, maybe, text } from '../../lib/content'

// The Open Graph card for every page: GET /og?collection=&slug= draws the
// published document's title and description on the fjord-night card. Pages
// point here from lib/metadata.ts. The card is rendered per request (never at
// build time, which cannot reach the database) and cached by browsers and
// crawlers for a day.

const WIDTH = 1200
const HEIGHT = 630

// The horizontal lockup from public/brand/lockup-horizontal.svg, in the dark
// theme's colors: the canonical mark beside the wordmark outlines.
const LOCKUP_WIDTH = 365.6
const LOCKUP_HEIGHT = 81.55
const WORDMARK_PATH =
  'M81.1 5.78H88.1V75.78H81.1ZM107.7 25.78L117.1 25.78L84.6 70.2L84.6 57.36ZM94.15 50.73L99.51 43.39L119.1 75.78L109.3 75.78ZM125.7 25.78H132.7V75.78H125.7ZM125.7 43.08A19 18.5 0 0 1 149.2 25.1L149.2 31.67A12 12.3 0 0 0 132.7 43.08ZM153.51 37.07A16.5 15.5 0 0 1 186.2 40.07L179.2 40.07A9.5 9.3 0 0 0 160.71 37.07ZM153.2 63.12A16.5 13.85 0 1 1 186.2 63.12A16.5 13.85 0 1 1 153.2 63.12ZM160.2 63.12A9.5 7.65 0 1 0 179.2 63.12A9.5 7.65 0 1 0 160.2 63.12ZM179.2 40.07H186.2V75.78H179.2ZM196.6 25.78H203.6V75.78H196.6ZM196.6 43.08A19 18.5 0 0 1 234.6 43.08L227.6 43.08A12 12.3 0 0 0 203.6 43.08ZM227.6 43.08H234.6V75.78H227.6ZM240.6 25.78H264.6V31.98H240.6ZM247.1 12.78H254.1V63.98H247.1ZM268.6 75.7A15 13 0 0 1 247.1 63.98L254.1 63.98A8 6.8 0 0 0 268.6 67.94ZM275 5.78H282V75.78H275ZM275 43.08A19 18.5 0 0 1 313 43.08L306 43.08A12 12.3 0 0 0 282 43.08ZM306 43.08H313V75.78H306ZM321.6 50.78A21 26.2 0 1 1 363.6 50.78A21 26.2 0 1 1 321.6 50.78ZM328.6 50.78A14 20 0 1 0 356.6 50.78A14 20 0 1 0 328.6 50.78Z'
const LOCKUP_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOCKUP_WIDTH} ${LOCKUP_HEIGHT}">` +
  '<g transform="translate(-12.85 -3.22) scale(2.75)">' +
  '<g stroke="#e8edf5" stroke-width="2.25" stroke-linecap="round" fill="none"><path d="M9 4.5v23"/><path d="M9 17.5 23 7"/><path d="M14.5 13.4 23.5 27"/></g>' +
  '<g fill="#e8edf5"><circle cx="9" cy="4.5" r="2.6"/><circle cx="9" cy="27.5" r="2.6"/><circle cx="23" cy="7" r="2.6"/><circle cx="23.5" cy="27" r="2.6"/></g>' +
  '<circle cx="9" cy="17.5" r="3.6" fill="#2dd4bf"/></g>' +
  `<path fill="#e8edf5" d="${WORDMARK_PATH}"/></svg>`

// Topographic contour lines around a summit near the top-right corner: closed
// curves whose radius wanders a little with the angle, like a height map.
function contourSvg(): string {
  const [cx, cy] = [1010, 140]
  const paths: string[] = []
  for (let ring = 0; ring < 11; ring++) {
    const base = 70 + ring * 58
    const points: string[] = []
    for (let step = 0; step < 96; step++) {
      const angle = (step / 96) * Math.PI * 2
      const wobble =
        1 + 0.07 * Math.sin(3 * angle + ring * 0.6) + 0.045 * Math.sin(5 * angle - ring * 0.9)
      const x = cx + base * 1.25 * wobble * Math.cos(angle)
      const y = cy + base * wobble * Math.sin(angle)
      points.push(`${x.toFixed(1)} ${y.toFixed(1)}`)
    }
    paths.push(`<path d="M${points.join('L')}Z"/>`)
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
    `<g fill="none" stroke="#e8edf5" stroke-opacity="0.07" stroke-width="1.5">${paths.join('')}</g></svg>`
  )
}

const dataUri = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`
const LOCKUP = dataUri(LOCKUP_SVG)
const CONTOURS = dataUri(contourSvg())

// The section a card belongs to, named as the site's navigation names it
const SECTIONS: Record<string, string> = {
  docs: 'Docs',
  glossary: 'Docs',
  faq: 'Docs',
  features: 'Features',
  stacks: 'Stacks',
  hosts: 'Deploy',
  releases: 'Changelog',
}

interface Card {
  eyebrow: string
  title: string
  description: string
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/

// A collection the site defines and a well-formed slug, or nothing to read
function requested(url: URL): { collection: string; slug: string } | undefined {
  const collection = url.searchParams.get('collection') ?? ''
  const slug = url.searchParams.get('slug') ?? ''
  if (!Object.hasOwn(collections, collection) || !SLUG.test(slug)) return undefined
  return { collection, slug }
}

function cardOf(collection: string, doc: Doc): Card {
  const title =
    collection === 'landing' ? text(doc, 'headline') || text(doc, 'title') : text(doc, 'title')
  return {
    eyebrow: SECTIONS[collection] ?? 'krantho',
    title,
    description: text(doc, 'description') || text(doc, 'definition'),
  }
}

// The site's generic card, worded by the landing page when it is published
async function genericCard(): Promise<Card> {
  const home = await maybe('landing', 'home')
  return {
    eyebrow: 'krantho',
    title: text(home, 'headline') || 'Content management that lives in your codebase',
    description:
      text(home, 'description') || 'A CMS library for content sites built in your own codebase.',
  }
}

async function cardFor(url: URL): Promise<Card> {
  const target = requested(url)
  const doc = target && (await maybe(target.collection, target.slug))
  if (!target || !doc || !text(doc, 'title')) return genericCard()
  return cardOf(target.collection, doc)
}

// Longer titles step down a size so three lines hold them
function titleSize(title: string): number {
  if (title.length > 70) return 54
  if (title.length > 40) return 62
  return 72
}

function CardImage({ card }: { card: Card }): React.ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        padding: '64px 72px 60px',
        backgroundColor: '#0a1120',
        backgroundImage:
          'radial-gradient(circle at 88% 8%, rgba(45, 212, 191, 0.26), rgba(45, 212, 191, 0) 42%), radial-gradient(circle at 104% 92%, rgba(167, 139, 250, 0.2), rgba(167, 139, 250, 0) 45%), radial-gradient(circle at 12% 110%, rgba(56, 189, 248, 0.1), rgba(56, 189, 248, 0) 40%)',
        color: '#e8edf5',
      }}
    >
      <img
        src={CONTOURS}
        width={WIDTH}
        height={HEIGHT}
        alt=""
        style={{ position: 'absolute', top: 0, left: 0 }}
      />
      <img
        src={LOCKUP}
        width={216}
        height={Math.round((216 * LOCKUP_HEIGHT) / LOCKUP_WIDTH)}
        alt=""
      />
      <div style={{ display: 'flex', flexGrow: 1 }} />
      <div
        style={{
          display: 'flex',
          fontSize: 22,
          letterSpacing: 4,
          color: '#2dd4bf',
          marginBottom: 22,
        }}
      >
        {card.eyebrow.toUpperCase()}
      </div>
      <div
        style={{
          display: 'block',
          fontSize: titleSize(card.title),
          lineHeight: 1.08,
          letterSpacing: -1.5,
          maxWidth: 1000,
          lineClamp: 3,
          WebkitTextStroke: '1.4px #e8edf5',
        }}
      >
        {card.title}
      </div>
      {card.description && (
        <div
          style={{
            display: 'block',
            marginTop: 26,
            fontSize: 28,
            lineHeight: 1.4,
            color: '#a3afc2',
            maxWidth: 940,
            lineClamp: 2,
          }}
        >
          {card.description}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 40,
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 180,
            height: 4,
            borderRadius: 2,
            backgroundImage: 'linear-gradient(90deg, #2dd4bf, #a78bfa)',
          }}
        />
        <div style={{ display: 'flex', fontSize: 22, color: '#8792a6' }}>krantho.com</div>
      </div>
    </div>
  )
}

export async function GET(request: Request): Promise<Response> {
  const card = await cardFor(new URL(request.url))
  const image = new ImageResponse(<CardImage card={card} />, { width: WIDTH, height: HEIGHT })
  // ImageResponse marks every image immutable for a year; a card follows its
  // document, so it is kept for a day
  image.headers.set('Cache-Control', 'public, max-age=86400')
  return image
}
