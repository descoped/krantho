# krantho on Next.js (App Router)

## Contents

- Files
- next.config.ts
- API route
- Studio route
- Page loader
- Page routes with the ISR shape
- Preview banner
- llms.txt
- Several instances behind a load balancer

Grounded in the reference example `examples/nextjs-shadcn` of the krantho repository. Next.js 16,
React 19. Paths below assume no `src/` directory; with one, put `app/` and `lib/` under it and
adjust the relative imports. `@/` is the `@/*` → `./*` path alias `create-next-app` sets up in
`tsconfig.json`.

## Files

```
krantho.config.ts
krantho.collections.ts
next.config.ts
lib/krantho.ts
app/api/[...path]/route.ts
app/studio/[[...slug]]/route.ts
app/(site)/layout.tsx            # reads globals (navigation, footer)
app/(site)/[[...slug]]/page.tsx  # pages collection: / and /<slug>
app/(site)/<collection>/[[...slug]]/page.tsx   # other collections: list and detail
content/<collection>/<slug>.md
```

## next.config.ts

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Load krantho's server packages from node_modules instead of bundling them
  serverExternalPackages: ['better-sqlite3', '@krantho/server', '@krantho/server-next'],
  // The sitemap and robots.txt come from the krantho API
  async rewrites() {
    return [
      { source: '/robots.txt', destination: '/api/seo/robots.txt' },
      { source: '/sitemap.xml', destination: '/api/seo/sitemap' },
    ]
  },
}

export default nextConfig
```

Add `'sharp'` to `serverExternalPackages` when media is on and the host provides it.

## API route

```ts
// app/api/[...path]/route.ts
import { createApiRouteHandlers } from '@krantho/server-next'
import config from '../../../krantho.config'
import { collections } from '../../../krantho.collections'

export const { GET, POST, PUT, DELETE, PATCH } = createApiRouteHandlers({ config, collections })
```

- It registers every krantho endpoint under `/api`: content, versions, media, SEO, auth,
  `/api/openapi.json` and the reference at `/api/docs`.
- It turns on editor preview through Next.js draft mode (`/api/preview`, `/api/preview/exit`).
- On serverless hosts add `export const maxDuration = 60` for the first boot (migrations and the
  content import).
- Plugins, content hooks and change listeners are options here (`plugins`, `hooks`,
  `onContentChange`), because they are code.

## Studio route

```ts
// app/studio/[[...slug]]/route.ts
import { createStudioRouteHandler } from '@krantho/server-next'

export const { GET } = createStudioRouteHandler()
```

Pass `createStudioRouteHandler({ config })` when OIDC sign-in should gate `/studio`
(`auth.oidc.studioEntry: 'redirect'`). The Studio SPA comes from `@krantho/studio`, which must be a
dependency of the app (the `@krantho/next` bundle includes it).

## Page loader

```ts
// lib/krantho.ts
import { notFound } from 'next/navigation'
import { createContentLoader } from '@krantho/server-next'
import { getCMSContent, initServerLoader, NetworkError } from '@krantho/ui-react/server'
import type { CMSContent } from '@krantho/ui-react/server'
import config from '../krantho.config'
import { collections } from '../krantho.collections'

// Pages read the database the API route opens, in-process
initServerLoader(createContentLoader({ config, collections }))

/** A page's published content; 404 when it has no published version */
export async function requirePublished(collection: string, slug: string): Promise<CMSContent> {
  try {
    return await getCMSContent(collection, slug)
  } catch (error) {
    if (error instanceof NetworkError && error.status === 404) notFound()
    throw error
  }
}

/** A global's published fields; empty when it is not published */
export async function globalFields(slug: string): Promise<Record<string, unknown>> {
  try {
    return (await getCMSContent('globals', slug)).fields
  } catch {
    return {}
  }
}
```

Every file that reads content imports `lib/krantho` (directly or through a helper) so the loader
is registered before the first read.

Reading API, from `@krantho/ui-react/server` (all published versions, cached per request):

| Call | Returns |
|---|---|
| `getCMSContent(collection, slug, { locale? })` | `{ collection, slug, locale, fields, html, rawContent, sections, excerpt? }`; throws `NetworkError` 404 when nothing is published |
| `getAllCMSContent(collection, { locale? })` | every published document; `[]` on failure |
| `getCMSSlugs(collection, locale?)` | the published slugs |
| `resolveSeoContent(collection, slug)` | `{ title, description, image?, canonical?, og?, twitter? }` for `generateMetadata` |
| `<SeoJsonLd collection slug />` | the page's JSON-LD `@graph` as a script tag |
| `<CMSTextServer collection slug field variant />`, `<CMSMarkdownServer collection slug section? />`, `<CMSImageServer … />` | server components that render one field, the body or a `##` section |

`sections` maps each `##` heading's exact text to the HTML below it.

## Page routes with the ISR shape

With `cache: { pages: 'next-isr' }` every page is rendered on its first request and kept until
Studio changes something it read. The build never touches the database. That needs:

1. Content routes are optional catch-alls whose `generateStaticParams` returns `[]`, with
   `export const revalidate = false`.
2. The root layout (`app/layout.tsx`) reads no content. Globals are read in `app/(site)/layout.tsx`.

```tsx
// app/(site)/[[...slug]]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePublished } from '@/lib/krantho'
import { CMSMarkdownServer, resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'

export const revalidate = false

export function generateStaticParams(): { slug: string[] }[] {
  return []
}

interface PageProps {
  params: Promise<{ slug?: string[] | undefined }>
}

/** `/` is `home`, `/<slug>` another page; deeper paths are not found */
async function slugOf({ params }: PageProps): Promise<string> {
  const { slug } = await params
  if (slug === undefined) return 'home'
  const [name] = slug
  if (slug.length !== 1 || !name || name === 'home') notFound()
  return name
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const seo = await resolveSeoContent('pages', await slugOf(props))
  return { title: seo.title, description: seo.description }
}

export default async function Page(props: PageProps): Promise<React.ReactElement> {
  const slug = await slugOf(props)
  const page = await requirePublished('pages', slug)
  return (
    <article>
      <SeoJsonLd collection="pages" slug={slug} />
      <h1>{String(page.fields.title ?? '')}</h1>
      <CMSMarkdownServer collection="pages" slug={slug} />
    </article>
  )
}
```

A list → detail collection uses the same shape at `app/(site)/<collection>/[[...slug]]/page.tsx`:
no slug renders the list (`getAllCMSContent`), one slug renders the document. The
`content-model` skill has templates for both.

How pages stay fresh: every read is tagged with what it read; a publish expires the document's
pages at once and marks its collection's lists stale; a global or SEO change marks the pages
that show it stale; a save changes nothing visitors see. `next dev` caches nothing — test
caching with `next build && next start`.

## Preview banner

```tsx
// app/(site)/layout.tsx
import { draftMode } from 'next/headers'
import { globalFields } from '@/lib/krantho'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const nav = await globalFields('navigation')
  const { isEnabled: previewing } = await draftMode()
  return (
    <>
      {previewing && (
        <p className="preview-banner">
          Previewing drafts — <a href="/api/preview/exit">Exit preview</a>
        </p>
      )}
      {/* header from nav, then the page */}
      <main>{children}</main>
    </>
  )
}
```

## llms.txt

When the SEO pipeline has generated `llms.txt` (see the `seo` skill), serve it with a route:

```ts
// app/llms.txt/route.ts
import { loadSeoText } from '@krantho/core/seo'

export function GET(): Response {
  const content = loadSeoText('llms.txt')
  if (!content) return new Response('llms.txt not generated', { status: 404 })
  return new Response(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
```

## Several instances behind a load balancer

With `next start` on more than one instance, set `KRANTHO_CACHE_SHARED=database` so every
instance keeps Next's page cache in the site's database, and point Next at the handler:

```ts
// next.config.ts
import { resolveConfig } from '@krantho/config'
import kranthoConfig from './krantho.config'

const sharedCache =
  resolveConfig(kranthoConfig, process.env).cache.shared === 'database'
    ? { cacheHandler: require.resolve('@krantho/server-next/cache-handler'), cacheMaxMemorySize: 0 }
    : {}
```

The handler opens the database from the environment alone, so a non-default database is set by
environment variables, not in `krantho.config.ts`. On Vercel leave `cache.shared` at `none`.
