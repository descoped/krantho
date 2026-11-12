---
title: Live editing
description: Mark the fields and sections your page templates render, so an editor can edit a page in place in Studio's Live mode. The marks appear only in an editor's preview, never in the HTML visitors get.
area: guides
order: 15
level: intermediate
stacks: [next, sveltekit, express]
prerequisites: [templates]
next: [media]
related: [studio, package-core, package-ui-react, package-server, rendering-modes]
status: published
---

Live mode in Studio shows an editor the site's own preview of a page and lets them edit what they see, in place. To do that it must know which element renders which field or section of which document. Your page templates tell it with a few attributes that appear only in a preview. krantho's components add them for you. For your own markup, the helpers in `@krantho/core/marks` do.

## What a mark is

Three attributes, present only while an editor previews the page:

```html
<h1 data-krantho-document="features/seo" data-krantho-field="title">Structured SEO</h1>
<div data-krantho-document="features/seo" data-krantho-section="__lead" style="display:contents">…</div>
<section data-krantho-document="features/seo" data-krantho-section="Approach">…</section>
```

- `data-krantho-document` is the document the value belongs to, as `<collection>/<slug>`. Every marked element carries it. A page shows other documents too, such as cards for other entries and globals in the header and footer, and their fields share names like `title`. Live mode edits one document and uses only that document's marks.
- `data-krantho-field` names the field the element renders.
- `data-krantho-section` names the `##` section the element renders, by its heading as written. The lead, the body before the first `##`, is `__lead` (`LEAD_SECTION` from `@krantho/core/sections`).

Production HTML never carries these attributes. Marking changes nothing a visitor gets.

## Is this render a preview?

Every server package answers the question the same way: `await loader.isPreview()` on the content loader from `createContentLoader()`. It is `true` only while an editor previews the page. It is `false` for visitors and for any render a cache keeps.

- **Next.js:** draft mode, which `/api/preview` turns on for a signed-in editor. In draft mode every read goes through the preview, uncached.
- **SvelteKit and Express:** a page rendered through `createPageCacheHandle` or `renderCachedPage` whose URL carries a valid signed preview link. Ask inside `load` or your render step, like every other read.

In a preview a document reads its current version, unpublished changes included. Collection lists still show the live documents on every server package.

The helpers take the document and the flag together, as a `MarkedDocument`: `{ collection, slug, preview }`. A `CMSContent` from `@krantho/ui-react/server` already is one.

## Let krantho's components mark for you

The server components in `@krantho/ui-react` mark what they render. `CMSTextServer` and `CMSImageServer` mark their field. `CMSMarkdownServer` marks its section, or, for a whole body, the lead and every `##` section. The Svelte components in `@krantho/ui-svelte` mark when you pass the document as `doc` with a `field` or `section`, and the markdown as `body` for a whole body.

```tsx title="app/(site)/about/page.tsx" stack="next"
import '@/lib/krantho' // registers the content loader
import { CMSMarkdownServer, CMSTextServer } from '@krantho/ui-react/server'

export default async function About() {
  return (
    <article>
      <CMSTextServer collection="pages" slug="about" field="title" variant="h1" />
      <CMSMarkdownServer collection="pages" slug="about" />
    </article>
  )
}
```

```svelte title="src/routes/about/+page.svelte" stack="sveltekit"
<script lang="ts">
  import { CMSMarkdown, CMSText } from '@krantho/ui-svelte'

  let { data } = $props()
</script>

<CMSText text={String(data.fields['title'] ?? '')} variant="h1" doc={data.doc} field="title" />
<CMSMarkdown html={data.html} body={data.body} doc={data.doc} />
```

On SvelteKit and Express, your `load` helper returns the document with the flag, and the markdown body next to its HTML:

```ts title="src/lib/cms.ts" stack="sveltekit"
import { renderContent } from '@krantho/core'
import type { MarkedDocument } from '@krantho/core/marks'
import { createContentLoader } from '@krantho/server-sveltekit'
import config from '../../krantho.config'
import { collections } from '../../krantho.collections'

const loader = createContentLoader({ config, collections })

/** A document rendered for a page, with what its marks need; null when it has nothing live */
export async function loadContent(collection: string, slug: string) {
  const [doc, preview] = await Promise.all([
    loader.getPublished({ collection, slug }),
    loader.isPreview(),
  ])
  if (!doc) return null
  const { html, sections } = await renderContent(doc.fields, doc.body)
  const marked: MarkedDocument = { collection, slug, preview }
  return { fields: doc.fields, html, sections, body: doc.body, doc: marked }
}
```

```ts title="src/lib/cms.ts" stack="express"
import { renderContent } from '@krantho/core'
import type { MarkedDocument } from '@krantho/core/marks'
import { createContentLoader } from '@krantho/server-node'
import config from '../../krantho.config'
import { collections } from '../../krantho.collections'

const loader = createContentLoader({ config, collections })

/** A document rendered for a page, with what its marks need; null when it has nothing live */
export async function loadContent(collection: string, slug: string) {
  const [doc, preview] = await Promise.all([
    loader.getPublished({ collection, slug }),
    loader.isPreview(),
  ])
  if (!doc) return null
  const { html, sections } = await renderContent(doc.fields, doc.body)
  const marked: MarkedDocument = { collection, slug, preview }
  return { fields: doc.fields, html, sections, body: doc.body, doc: marked }
}
```

Pass `doc` and `body` from `load` to the page with the rest of the data.

## Mark your own markup

Where a template renders a value itself, spread the marks on the element that shows it. That includes client components: a field rendered in a `'use client'` component, or by a Svelte component that renders in the browser, needs the same marks as one rendered on the server. Pass the document to the component with the value, and spread the marks there. Live mode reads the page again for a few seconds after it loads, so marks a client render adds are found. `kranthoField(doc, field)` and `kranthoSection(doc, heading)` return the attributes in a preview and an empty object otherwise. In a server template that builds HTML strings, `markAttributes()` turns them into attribute text, escaped. Mark a card with the card's own document, not the page's. The helpers are in `@krantho/core`, so add it to your dependencies when your pages import it, as [Installation](/docs/installation) explains.

```tsx title="app/(site)/services/[[...slug]]/detail.tsx" stack="next"
import '@/lib/krantho' // registers the content loader
import { kranthoField, markBodySections } from '@krantho/core/marks'
import { getCMSContent } from '@krantho/ui-react/server'

export async function ServiceDetail({ slug }: { slug: string }) {
  const service = await getCMSContent('services', slug)
  return (
    <article>
      <h1 {...kranthoField(service, 'title')}>{String(service.fields['title'] ?? '')}</h1>
      <p {...kranthoField(service, 'ingress')}>{String(service.fields['ingress'] ?? '')}</p>
      <div
        className="prose"
        dangerouslySetInnerHTML={{ __html: markBodySections(service.html, service.rawContent, service) }}
      />
    </article>
  )
}
```

```svelte title="src/lib/components/ServiceCard.svelte" stack="sveltekit"
<script lang="ts">
  import { kranthoField, type MarkedDocument } from '@krantho/core/marks'

  let { title, ingress, href, doc }: {
    title: string
    ingress: string
    href: string
    /** The service the card shows */
    doc?: MarkedDocument | undefined
  } = $props()
</script>

<a class="service-card" {href}>
  <h3 {...kranthoField(doc, 'title')}>{title}</h3>
  <p {...kranthoField(doc, 'ingress')}>{ingress}</p>
</a>
```

```ts title="src/render-service.ts" stack="express"
import { kranthoField, markAttributes, markBodySections } from '@krantho/core/marks'
import { loadContent } from './lib/cms'

const escape = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** A service page as HTML; null when the service has nothing live */
export async function renderService(slug: string): Promise<string | null> {
  const service = await loadContent('services', slug)
  if (!service) return null
  const title = escape(String(service.fields['title'] ?? ''))
  return `<article>
  <h1${markAttributes(kranthoField(service.doc, 'title'))}>${title}</h1>
  <div class="prose">${markBodySections(service.html, service.body, service.doc)}</div>
</article>`
}
```

## Whole bodies

`markBodySections(html, body, doc)` takes a rendered body and the markdown it was rendered from. In a preview it wraps the lead and each `##` section in a `<div style="display:contents">` that carries the section's mark. `display: contents` generates no box, so the preview keeps the page's own layout. Outside a preview it returns the HTML as it is.

It pairs each `<h2>` of the HTML with the `##` headings of the body, in order. When the counts differ, for example because of a raw HTML `<h2>` or a `##` inside a blockquote, it returns the HTML unmarked rather than mark the wrong section. When you split a body yourself and render its sections one by one, mark each one with `kranthoSection(doc, heading)`, and the lead with `LEAD_SECTION`.

> [!TIP]
> In a preview, the wrappers sit between the body's container and its elements. A style that uses the child combinator (`.prose > p`) or `:first-child` on the body's elements can match differently there. Descendant selectors (`.prose p`) match the same in both.

## Client-rendered components

The client components in `@krantho/ui-react` (`CMSText`, `CMSMarkdown`, `CMSImage`) mark too. They read the document from `ContentData.document`, so they can only mark when the content they read carries it. A server that preloads content for them through `CMSContentProvider` fills it:

```ts title="src/lib/cms.ts"
import { renderContent } from '@krantho/core'
import type { ContentData } from '@krantho/core'
import { createContentLoader } from '@krantho/server-node'
import config from '../../krantho.config'
import { collections } from '../../krantho.collections'

const loader = createContentLoader({ config, collections })

/** Content for the client components, preloaded on the server; null when nothing is live */
export async function loadContentData(collection: string, slug: string): Promise<ContentData | null> {
  const [doc, preview] = await Promise.all([
    loader.getPublished({ collection, slug }),
    loader.isPreview(),
  ])
  if (!doc) return null
  const { content, html, sections } = await renderContent(doc.fields, doc.body)
  const document = { collection, slug, preview }
  return { fields: doc.fields, content, html, sections, loading: false, error: null, document }
}
```

Hand the same data to the browser for hydration, so the client renders the same marks. Content the client components fetch themselves, from markdown files, carries no document and stays unmarked.

## Open the preview

**Live** is the first of the editor's modes for a page. It loads `GET /api/preview?collection=&slug=` in a frame from the same origin, with the editor's session, and reads the page from Studio, so nothing is added to the page. The page then renders as a preview:

- **Next.js:** `/api/preview` turns on draft mode and sends the editor to the page.
- **SvelteKit and Express:** with `sitePreview: 'signed-url'` on the API handlers, `/api/preview` answers a redirect to the page with a token signed for its path, valid for ten minutes. Each load of the preview asks for a fresh token with the editor's Studio session, so the ten-minute expiry never interrupts editing.

The preview shows the current saved version. It is never cached, and visitors never see it. The preview entry has no locale, so Live mode shows the default locale's page; a version in another locale is edited in Structure mode. A document of a collection without pages has no Live mode. [Studio](/docs/studio#preview-drafts-on-the-site) covers the preview setup on each framework.

> [!CAUTION]
> The page must allow its own origin to frame it. If your site sets a `Content-Security-Policy` with `frame-ancestors`, include `'self'`. If it sets `X-Frame-Options`, use `SAMEORIGIN`. Otherwise Live mode shows its empty state.

Signed links need one signing secret for the API and the pages. Without `KRANTHO_JWT_SECRET`, a process signs and verifies with one ephemeral secret of its own. That is enough in development, on one server. With several instances or serverless functions, set `KRANTHO_JWT_SECRET` to the same value everywhere, or a link signed on one instance renders the published page on another.

## What Live mode does with the marks

Pointing at a marked element of the document outlines it, with a tag such as `field · title` or `section · Approach · designed`. Clicking it selects it in the side panel, without following a link inside it, and opens an editor. A text field is edited on the page itself: the element becomes editable, with the caret where you clicked and a ring around it. **Enter** finishes a one-line field, **Esc** finishes any field, and clicking elsewhere finishes it too; a field the form edits in a textarea keeps **Enter** for line breaks. Pasted text goes in as plain text. When you finish, the element is back as your template rendered it, with the text you typed. A section, or the lead, is edited in a markdown editor next to it, as wide as the section and as tall as its text, and its page is updated roughly as you type. **Save draft** reloads the preview, which then shows your page's real rendering. Images and other fields change after Save.

A field is edited on the page only when the marked element holds nothing but text. If it holds other elements, for example a link around the title, Live mode edits the field in a small editor next to it instead, so no markup is lost. Put the mark on the element that holds the text itself to edit it in place.

A field or section without a mark still shows on the page, without a hook. Select a field and the panel says whether Live mode found it on the page, and the attribute to add when it did not, for example `data-krantho-field="benefit"`. Live mode never hides or blocks anything because a mark is missing.

Live mode is for clicking text. To edit with the keyboard, switch to Structure mode, which edits the same content.

If your page templates do not render the document, the preview answers `404` and Live mode says so, with the path: "The site has no page for this document". Every field and section can still be edited in Structure mode.

## A static site has no preview

A site built to static files, such as a client-only single-page app that reads the REST API, has no server render to preview. Live mode shows its empty state there.

## Check your marks

Sign in to Studio as an editor, open `/api/preview?collection=pages&slug=about`, and inspect the page: the elements that render the document's fields and sections carry the attributes. Then check what a visitor gets:

```bash
curl -s https://example.com/about | grep -c 'data-krantho-'
```

It prints `0`.
