import Link from 'next/link'
import Box from '@mui/material/Box'
import { CMSTextServer, CMSMarkdownServer } from '@krantho/ui-react/server'
import ServiceCard from '@/components/ServiceCard'
import { publishedServiceSlugs } from '@/lib/services'

export default async function HomeContent(): Promise<React.ReactElement> {
  const serviceIds = await publishedServiceSlugs()

  return (
    <Box>
      {/* Hero */}
      <Box component="section" className="section-primary">
        <Box className="section-container" sx={{ textAlign: 'center' }}>
          <CMSTextServer collection="pages" slug="home" field="title" variant="h1" component="h1" className="hero-title" />
          <Box sx={{ maxWidth: '42rem', mx: 'auto', mt: 2, opacity: 0.8 }}>
            <CMSTextServer collection="pages" slug="home" field="description" variant="body1" component="p" className="hero-subtitle" />
          </Box>
          <Box sx={{ mt: 4 }}>
            <Link href="/services" className="hero-btn">
              Our Services
            </Link>
          </Box>
        </Box>
      </Box>

      {/* Content */}
      <Box component="section" className="section-white">
        <Box className="section-container">
          <CMSMarkdownServer collection="pages" slug="home" className="prose" />
        </Box>
      </Box>

      {/* Services overview */}
      <Box component="section" className="section-muted">
        <Box className="section-container">
          <h2 className="section-title">Our Services</h2>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>
            {serviceIds.map((id) => (
              <ServiceCard key={id} slug={id} href={`/services/${id}`} headingLevel="h3" />
            ))}
          </Box>
        </Box>
      </Box>

      {/* CTA */}
      <Box component="section" className="section-white">
        <Box className="section-container" sx={{ textAlign: 'center' }}>
          <h2 className="section-title">Why Acme?</h2>
          <Box sx={{ mt: 3 }}>
            <Link href="/about" className="hero-btn">
              Learn more about us
            </Link>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
