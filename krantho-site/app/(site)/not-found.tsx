import type { Metadata } from 'next'
import Link from 'next/link'
import { Icon, type IconName } from '../components/icons'
import '../styles/page.css'

// The 404 page inside the shell. It reads no content of its own — a missing page
// must answer even when the document behind it is what is missing — so its few
// words live here.

const DESTINATIONS: { href: string; label: string; note: string; icon: IconName }[] = [
  { href: '/docs', label: 'Documentation', note: 'Install krantho and learn how it works.', icon: 'book' },
  { href: '/features', label: 'Features', note: 'What krantho does, one capability at a time.', icon: 'layers' },
  { href: '/', label: 'Home', note: 'An overview of krantho.', icon: 'compass' },
]

// The document title says what happened, like the heading does
export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false },
}

export default function NotFound(): React.ReactElement {
  return (
    <section className="container not-found" aria-labelledby="not-found-title">
      <p className="eyebrow">404</p>
      <h1 id="not-found-title" className="not-found__title">
        This page is not here
      </h1>
      <p className="lede">The address may have changed, or the page is not published. Search the site, or start from one of these.</p>
      <div className="not-found__actions">
        <button type="button" className="button button--primary" data-open-search>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          Search the site
        </button>
      </div>
      <ul className="not-found__links">
        {DESTINATIONS.map((destination) => (
          <li key={destination.href}>
            <Link href={destination.href} className="card not-found__link">
              <Icon name={destination.icon} size={20} />
              <span className="not-found__label">{destination.label}</span>
              <span className="not-found__note">{destination.note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
