import { showPreviewBanner } from '@krantho/server-next'
import { Footer } from '../components/footer'
import { Header } from '../components/header'

// The shell every page shares. It reads the globals (navigation, announcement,
// footer) per request; like the pages, it stays cached until a change in /studio.

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode
}): Promise<React.ReactElement> {
  // An editor previewing drafts ("Preview on site" in Studio)
  const previewing = await showPreviewBanner()
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {previewing && (
        <p className="preview-banner">
          Previewing drafts — <a href="/api/preview/exit">Exit preview</a>
        </p>
      )}
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </>
  )
}
