import { CMSText, CMSMarkdown, useContent } from '../cms'
import { LoadingFallback } from '../components/LoadingFallback'

export function AboutPage() {
  const { loading } = useContent('about')
  if (loading) return <LoadingFallback />

  return (
    <div>
      <section className="section-white">
        <div className="section-container">
          <CMSText slug="about" field="title" variant="h1" className="page-title" component="h1" />
          <CMSText slug="about" field="description" variant="body1" className="page-subtitle" component="p" />
        </div>
      </section>

      <section className="section-muted">
        <div className="section-container">
          <CMSMarkdown slug="about" section="Our Team" className="prose max-w-none" />
        </div>
      </section>

      <section className="section-white">
        <div className="section-container">
          <CMSMarkdown slug="about" section="Our Approach" className="prose max-w-none" />
        </div>
      </section>
    </div>
  )
}
