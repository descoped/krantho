import { kranthoField } from '@krantho/core/marks'
import Link from 'next/link'
import { global, list, text } from '../../lib/content'
import { Wordmark } from './brand'
import { ThemeSwitch } from './theme-switch'

// The shell's footer, from the `footer` document in globals. `links` entries are
// "Label|/href"; an entry "# Group" starts a new column. The credit line under them is
// fixed: the company, the year and the licence.

const COMPANY_URL = 'https://descoped.io'
const LICENSE_URL = 'https://github.com/descoped/krantho/blob/main/LICENSE'

interface Column {
  heading: string
  items: { label: string; href: string }[]
}

function columns(entries: string[]): Column[] {
  const result: Column[] = []
  for (const entry of entries) {
    if (entry.startsWith('#')) {
      result.push({ heading: entry.replace(/^#+\s*/, ''), items: [] })
      continue
    }
    const [label = '', href = ''] = entry.split('|').map((part) => part.trim())
    if (!label || !href) continue
    if (result.length === 0) result.push({ heading: '', items: [] })
    result[result.length - 1]?.items.push({ label, href })
  }
  return result
}

export async function Footer(): Promise<React.ReactElement> {
  const footer = await global('footer')
  const groups = columns(list(footer, 'links'))
  const tagline = text(footer, 'tagline')

  return (
    <footer className="site-footer">
      <div className="container container--wide">
        <div className="site-footer__grid">
          <div className="site-footer__brand">
            <Link href="/" aria-label="Krantho home" className="site-footer__logo">
              <Wordmark size={24} />
            </Link>
            {tagline && (
              <p className="site-footer__tagline" {...kranthoField(footer, 'tagline')}>
                {tagline}
              </p>
            )}
          </div>
          {groups.map((group) => (
            <nav key={group.heading || 'links'} className="site-footer__column" aria-label={group.heading || 'Footer'} {...kranthoField(footer, 'links')}>
              {group.heading && <h2 className="site-footer__heading">{group.heading}</h2>}
              <ul>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="site-footer__bottom">
          <p className="site-footer__credit">
            A <a href={COMPANY_URL}>Descoped</a> product · © 2026 · <a href={LICENSE_URL}>MIT License</a>
          </p>
          <ThemeSwitch />
        </div>
      </div>
    </footer>
  )
}

