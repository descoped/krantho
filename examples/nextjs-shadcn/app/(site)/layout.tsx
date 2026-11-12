import { showPreviewBanner } from '@krantho/server-next'
import { globalFields } from '@/lib/krantho'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

// The navigation and footer globals are read here, inside the route group, and
// not in the root layout: the build prerenders the 404 page through the root
// layout, and the build cannot reach the database.
export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode
}): Promise<React.ReactElement> {
  const nav = (await globalFields('navigation')) as Record<string, string>
  // An editor previewing drafts ("Preview on site" in Studio)
  const previewing = await showPreviewBanner()

  return (
    <>
      {previewing && (
        <div className="preview-banner" style={{ padding: '8px 16px', textAlign: 'center', background: '#fef3c7', color: '#1a1a2e' }}>
          Previewing drafts — <a href="/api/preview/exit">Exit preview</a>
        </div>
      )}
      <Header fields={nav} />

      <main>{children}</main>

      <Footer />
    </>
  )
}
