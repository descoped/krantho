import type { ReactNode } from 'react'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  siteFm: Record<string, string>
  renderLink: (to: string, children: ReactNode, style?: React.CSSProperties) => ReactNode
}

export function Header({ siteFm, renderLink }: HeaderProps) {
  return (
    <header className="site-header">
      <div className="layout-header-inner">
        <div className="layout-header-logo">
          <div className="layout-header-logo-icon" />
          <div>
            {renderLink('/', <span className="site-logo-name">{siteFm['logo-name'] || ''}</span>, { color: 'inherit', textDecoration: 'none' })}
            <span className="site-logo-subtitle">{siteFm['logo-subtitle'] || ''}</span>
          </div>
        </div>
        <div className="layout-header-nav-group">
          <nav className="layout-header-nav">
            {renderLink('/', siteFm['nav-home'] || 'Home')}
            {renderLink('/about', siteFm['nav-about'] || 'About')}
            {renderLink('/services', siteFm['nav-services'] || 'Services')}
            {renderLink('/fees', siteFm['nav-fees'] || 'Fees')}
            {renderLink('/contact', siteFm['nav-contact'] || 'Contact')}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
