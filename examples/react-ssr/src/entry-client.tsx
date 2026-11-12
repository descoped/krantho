import ReactDOM from 'react-dom/client'
import { CMSProvider, CMSContentProvider } from '@krantho/ui-react'
import type { ContentData } from '@krantho/core'
import { AppShell, NotFoundPage, routeFor } from './App'

declare global {
  interface Window {
    __CMS_CACHE__?: Record<string, ContentData>
    __SERVICE_IDS__?: string[]
    __PAGE_FOUND__?: boolean
  }
}

const contentCache = window.__CMS_CACHE__ ?? {}
const serviceIds = window.__SERVICE_IDS__ ?? []
const route = window.__PAGE_FOUND__ ? routeFor(window.location.pathname) : null

// Must match the server's siteFm (entry-server.tsx) or hydration mismatches.
const siteFm = {
  ...(contentCache['navigation']?.fields ?? {}),
  ...(contentCache['footer']?.fields ?? {}),
  ...(contentCache['contact-info']?.fields ?? {}),
} as Record<string, string>

ReactDOM.hydrateRoot(
  document.getElementById('app')!,
  <CMSProvider config={{ contentPath: '/api/content' }}>
    <CMSContentProvider data={contentCache}>
      <AppShell siteFm={siteFm}>
        {route ? <route.Page slug={route.slug} serviceIds={serviceIds} /> : <NotFoundPage />}
      </AppShell>
    </CMSContentProvider>
  </CMSProvider>
)
