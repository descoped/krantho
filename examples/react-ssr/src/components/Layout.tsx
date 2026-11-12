import type { ReactNode } from 'react'
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
        renderLink={(to, children, style) => <a href={to} style={style}>{children}</a>}
      />
      <main className="layout-main">{children}</main>
      <Footer siteFm={siteFm} />
    </>
  )
}
