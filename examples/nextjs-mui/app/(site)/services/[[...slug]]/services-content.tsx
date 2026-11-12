import Box from '@mui/material/Box'
import ServiceCard from '@/components/ServiceCard'
import { CMSTextServer } from '@krantho/ui-react/server'
import { publishedServiceSlugs } from '@/lib/services'

export default async function ServicesContent(): Promise<React.ReactElement> {
  const serviceIds = await publishedServiceSlugs()

  return (
    <Box>
      <Box component="section" className="section-white">
        <Box className="section-container">
          <CMSTextServer collection="pages" slug="services" field="title" variant="h1" component="h1" className="page-title" />
          <CMSTextServer collection="pages" slug="services" field="description" variant="body1" component="p" className="page-subtitle" />
        </Box>
      </Box>

      <Box component="section" className="section-muted">
        <Box className="section-container">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>
            {serviceIds.map((id) => (
              <ServiceCard key={id} slug={id} href={`/services/${id}`} headingLevel="h2" />
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
