import { kranthoField } from '@krantho/core/marks'
import Link from 'next/link'
import { global, links, text } from '../../lib/content'
import { Wordmark } from './brand'
import { SearchButton, SearchPalette } from './search'
import { ThemeSwitch } from './theme-switch'

// The shell's header. Every label and link comes from the `navigation` and
// `announcement` documents in the globals collection, edited in /studio.

export async function Header(): Promise<React.ReactElement> {
  const [navigation, announcement] = await Promise.all([
    global('navigation'),
    global('announcement'),
  ])
  const items = links(navigation)
  const ctaLabel = text(navigation, 'cta-label')
  const ctaHref = text(navigation, 'cta-href')
  const message = text(announcement, 'message')
  const messageHref = text(announcement, 'message-href')
  const messageMarks = kranthoField(announcement, 'message')
  const linksMarks = kranthoField(navigation, 'links')
  const ctaMarks = kranthoField(navigation, 'cta-label')

  return (
    <>
      {message && (
        <div className="announcement">
          <div className="container announcement__inner">
            <span className="announcement__dot" aria-hidden="true" />
            {messageHref ? (
              <Link href={messageHref} className="announcement__link" {...messageMarks}>
                {message}
              </Link>
            ) : (
              <span {...messageMarks}>{message}</span>
            )}
          </div>
        </div>
      )}
      <header className="site-header">
        <div className="container container--wide site-header__inner">
          <Link href="/" className="site-header__brand" aria-label="Krantho home">
            <Wordmark size={26} />
          </Link>
          <nav className="site-nav" aria-label="Main">
            <ul className="site-nav__list" {...linksMarks}>
              {items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="site-nav__link">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="site-header__actions">
            <SearchButton />
            <ThemeSwitch />
            {ctaLabel && ctaHref && (
              <Link href={ctaHref} className="button button--primary site-header__cta" data-track="Get started" {...ctaMarks}>
                {ctaLabel}
              </Link>
            )}
            <details className="mobile-nav">
              <summary className="icon-button" aria-label="Menu">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </summary>
              <div className="mobile-nav__panel">
                <ul {...linksMarks}>
                  {items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href}>{item.label}</Link>
                    </li>
                  ))}
                  {ctaLabel && ctaHref && (
                    <li>
                      <Link href={ctaHref} className="button button--primary" {...ctaMarks}>
                        {ctaLabel}
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            </details>
          </div>
        </div>
      </header>
      <SearchPalette />
    </>
  )
}
