import { Link, useParams } from 'react-router'
import { CMSText, CMSMarkdown, useContent } from '../cms'
import { LoadingFallback } from '../components/LoadingFallback'

export function ServiceDetailPage() {
  const { slug = '' } = useParams()
  const { loading } = useContent(slug)
  if (loading) return <LoadingFallback />

  return (
    <div>
      <section className="section-white">
        <div className="section-container">
          <Link to="/services" className="back-link">
            &larr; All Services
          </Link>
          <CMSText slug={slug} field="title" variant="h1" className="page-title" component="h1" />
          <CMSText slug={slug} field="ingress" variant="body1" className="page-subtitle" component="p" />
        </div>
      </section>

      <section className="section-muted">
        <div className="section-container">
          <CMSMarkdown slug={slug} className="prose prose-lg max-w-none" />
        </div>
      </section>
    </div>
  )
}
