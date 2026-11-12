import { Routes, Route } from 'react-router'
import { useContent } from './cms'
import { Layout } from './components/Layout'
import { HomePage } from './pages/Home'
import { AboutPage } from './pages/About'
import { GeneralPage } from './pages/General'
import { ServicesPage } from './pages/Services'
import { ServiceDetailPage } from './pages/ServiceDetail'
import { NotFoundPage } from './pages/NotFound'
import siteConfig from '../../content/seo/site-config.json'

const serviceIds: string[] = siteConfig.serviceIds

// The routes with a page component of their own; every other page in the
// site's route map renders `GeneralPage`.
const OWN_ROUTES = new Set(['/', '/about', '/services'])
const generalRoutes = Object.entries(siteConfig.routeToSlug).filter(([route]) => !OWN_ROUTES.has(route))

export function App() {
  // The layout header/footer need keys spread across three globals:
  // navigation (logo + nav labels), footer (footer-*), contact-info (phone-*,
  // location-*, hours-*). Merge them into a single siteFm.
  const nav = useContent('navigation')
  const footer = useContent('footer')
  const contact = useContent('contact-info')

  if (nav.loading || footer.loading || contact.loading) return null

  const siteFm = { ...nav.fields, ...footer.fields, ...contact.fields }

  return (
    <Layout siteFm={siteFm}>
      <Routes>
        <Route path="/" element={<HomePage serviceIds={serviceIds} />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/services" element={<ServicesPage serviceIds={serviceIds} />} />
        <Route path="/services/:slug" element={<ServiceDetailPage />} />
        {generalRoutes.map(([route, slug]) => (
          <Route key={route} path={route} element={<GeneralPage slug={slug} />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  )
}
