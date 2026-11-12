import { Link } from 'react-router'
import { CMSText, useContent } from '../cms'
import { LoadingFallback } from '../components/LoadingFallback'

interface ServicesPageProps {
  serviceIds: string[]
}

export function ServicesPage({ serviceIds }: ServicesPageProps) {
  const { loading } = useContent('services')
  if (loading) return <LoadingFallback />

  return (
    <div>
      <section className="section-white">
        <div className="section-container">
          <CMSText slug="services" field="title" variant="h1" className="page-title" component="h1" />
          <CMSText slug="services" field="description" variant="body1" className="page-subtitle" component="p" />
        </div>
      </section>

      <section className="section-muted">
        <div className="section-container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {serviceIds.map((id) => (
              <Link key={id} to={`/services/${id}`} className="service-card">
                <CMSText slug={id} field="title" variant="h2" component="h2" />
                <CMSText slug={id} field="ingress" variant="body1" className="text-muted-fg" component="p" />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
