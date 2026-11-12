import { CMSText, CMSMarkdown, useContent } from '../cms'
import { LoadingFallback } from '../components/LoadingFallback'

/** Any page without a page component of its own: its title, its description as the lead, and its body */
export function GeneralPage({ slug }: { slug: string }) {
  const { loading } = useContent(slug)
  if (loading) return <LoadingFallback />

  return (
    <div>
      <section className="section-white">
        <div className="section-container">
          <CMSText slug={slug} field="title" variant="h1" className="page-title" component="h1" />
          <CMSText slug={slug} field="description" variant="body1" className="page-subtitle" component="p" />
        </div>
      </section>

      <section className="section-muted">
        <div className="section-container">
          <CMSMarkdown slug={slug} className="prose max-w-none" />
        </div>
      </section>
    </div>
  )
}
