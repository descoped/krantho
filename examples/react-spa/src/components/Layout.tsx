import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Header, Footer } from '../../../theme/react'

interface LayoutProps {
  siteFm: Record<string, string>
  children: ReactNode
}

export function Layout({ siteFm, children }: LayoutProps) {
  return (
    <>
      <Header
        siteFm={siteFm}
        renderLink={(to, children, style) => <Link to={to} style={style}>{children}</Link>}
      />
      <main className="layout-main">{children}</main>
      <Footer siteFm={siteFm} />
    </>
  )
}
