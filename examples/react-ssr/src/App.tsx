import type { ComponentType, ReactNode } from 'react'
import { Layout } from './components/Layout'
import { HomePage } from './pages/Home'
import { AboutPage } from './pages/About'
import { GeneralPage } from './pages/General'
import { ServicesPage } from './pages/Services'
import { ServiceDetailPage } from './pages/ServiceDetail'
// globals.css imported via index.html <link> tag — not here
// (importing here pulls it through the module graph which includes
// @krantho/core barrel with node:fs seo-loader)

export interface AppShellProps {
  siteFm: Record<string, string>
  children: ReactNode
}

export function AppShell({ siteFm, children }: AppShellProps) {
  return <Layout siteFm={siteFm}>{children}</Layout>
}

export interface PageProps {
  slug: string
  serviceIds?: string[]
}

/** The document a URL renders, and the page component that renders it */
export interface PageRoute {
  collection: string
  slug: string
  Page: ComponentType<PageProps>
}

/** The pages with a page component of their own; every other published page renders `GeneralPage` */
const PAGE_ROUTES: Record<string, { slug: string; Page: ComponentType<PageProps> }> = {
  '/': { slug: 'home', Page: HomePage },
  '/about': { slug: 'about', Page: AboutPage },
  '/services': { slug: 'services', Page: ServicesPage },
}

const SERVICE_PREFIX = '/services/'

/** The route of a URL path; null when no page can answer it. A route whose document has no published version is answered with 404 */
export function routeFor(pathname: string): PageRoute | null {
  if (pathname.startsWith(SERVICE_PREFIX)) {
    const slug = pathname.slice(SERVICE_PREFIX.length)
    if (!slug || slug.includes('/')) return null
    return { collection: 'services', slug, Page: ServiceDetailPage }
  }
  const route = PAGE_ROUTES[pathname]
  if (route) return { collection: 'pages', ...route }
  const slug = pathname.slice(1)
  if (!slug || slug === 'home' || slug.includes('/')) return null
  return { collection: 'pages', slug, Page: GeneralPage }
}

/** Whether a route lists the services */
export function listsServices(pathname: string): boolean {
  return pathname === '/' || pathname === '/services'
}

export function NotFoundPage() {
  return (
    <section className="section-white">
      <div className="section-container">
        <h1 className="page-title">Page not found</h1>
      </div>
    </section>
  )
}
