import { Link } from 'react-router'
import { CMSText, CMSMarkdown, useContent } from '../cms'
import { LoadingFallback } from '../components/LoadingFallback'

interface HomePageProps {
  serviceIds: string[]
}

export function HomePage({ serviceIds }: HomePageProps) {
  const { loading } = useContent('home')
  if (loading) return <LoadingFallback />

  return (
    <div>
      <section className="section-primary">
        <div className="section-container" style={{ textAlign: 'center' }}>
          <CMSText slug="home" field="title" variant="h1" className="hero-title" component="h1" />
          <div style={{ maxWidth: '42rem', margin: '0 auto', opacity: 0.8 }}>
            <CMSText slug="home" field="description" variant="body1" className="hero-subtitle" component="p" />
          </div>
          <div style={{ marginTop: '2rem' }}>
            <Link to="/services" className="hero-btn">
              Our Services
            </Link>
          </div>
        </div>
      </section>

      <section className="section-white">
        <div className="section-container">
          <CMSMarkdown slug="home" className="prose" />
        </div>
      </section>

      <section className="section-muted">
        <div className="section-container">
          <h2 className="section-title">Our Services</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {serviceIds.map((id) => (
              <Link key={id} to={`/services/${id}`} className="service-card">
                <CMSText slug={id} field="title" variant="h3" component="h3" />
                <CMSText slug={id} field="ingress" variant="body1" className="text-muted-fg" component="p" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section-white">
        <div className="section-container" style={{ textAlign: 'center' }}>
          <h2 className="section-title">Why Acme?</h2>
          <div style={{ marginTop: '1.5rem' }}>
            <Link to="/about" className="hero-btn">
              Learn more about us
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
