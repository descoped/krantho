# What reads the database

A krantho site on a serverless host reads its database over the network, and a hosted database
bills or limits that transfer. This page says what reads it, when, and how much, so a site that is
quiet — published once, edited now and then — costs next to nothing. The sizes are measured
against the krantho.com content (about 140 documents, 1 MB of markdown) on `next start` with
`cache.pages: 'next-isr'`; they scale with the content, and the order of magnitude is the point.

Two kinds of figure appear here. **Statement counts** are asserted by tests and hold for any
content. **Bytes** were measured on the krantho.com content before every content list read through
the one `query` of `@krantho/persistence`; that change fixed how many statements a request makes and
what each list asks for, and the bytes have not been measured again. A figure marked "was" is a
before-and-after taken at the time.

## Who reads, and when

| Reader | When it reads the database | What it costs |
|---|---|---|
| A visitor's page view | Never, once the page is cached. The first render after a change reads what the page needs; the host's CDN serves every view after it | 0 KB cached; a first docs page 1.7 MB when its navigation read every document whole, another kind of page 0.1 to 0.3 MB, an unknown URL 0.5 KB |
| A content change (publish, unpublish, delete) | The pages that read the changed document, or its collection, are rendered again once, and the data they read is read once | Publishing a docs page: about 1.5 MB for the page when its navigation read every document whole, 1.4 MB when `search.json` is next read |
| A draft save | Nothing public: a draft changes no visitor-facing page | The write, and the document read back, 25 KB |
| A deployment | The page cache starts empty, so every page renders once on its first view; the deployment's own warm-up requests make those views | The data cache survives deployments (below), so a warm-up reads little |
| Studio, while it is open and in view | The site tree, once a minute and on each navigation | 25 KB a read; it was 1.8 MB (see below) |
| A Studio screen | Its own reads, once per visit (table below) | Media and Setup: nothing beyond the tree. Pulse and Site: about 150 KB, in one statement per 500 documents. A page's editor: its document and its findings |
| The editor's Live mode | The page's own render, in preview, which no cache keeps | A page that lists its collection reads summaries of it (`listPublishedSummaries`), with no body; a template that calls `listPublished` reads every document whole, about 1.5 MB for the krantho.com docs |
| A crawler | `/sitemap.xml` (meta and fields of every live document), `/robots.txt` (no read), `/llms.txt`, `/search.json` | The sitemap about 45 KB a read, kept by the CDN for an hour; `llms.txt` and `search.json` read through the data cache, 0 KB when it holds them |

## Where the caches are

On Vercel, three layers keep a read from reaching the database:

- **The CDN and the ISR cache** keep a rendered page until it is revalidated, or until nothing has
  asked for it in 31 days. Each deployment has its own ISR cache. The `age` header of a cached page
  is the time since it was rendered, not a lifetime: `Cache-Control: public, max-age=0,
  must-revalidate` is what Next.js sends so a browser asks the CDN again, and the CDN answers
  `x-vercel-cache: HIT` without running the site.
- **The data cache** keeps what the loader read (`unstable_cache`, tagged with the document, the
  collection and the SEO configuration). It survives deployments, is regional and shared by the
  team's projects on Hobby and Pro, holds items up to 2 MB, and evicts what has not been read
  recently once it is full. A content change expires the tags it touches
  (`invalidationsFor()` in `@krantho/core`): the changed document's tag at once, its collection's
  tag as stale, so the pages that list the collection are rendered again as they are visited.
- **The CDN's response cache** keeps a function's response when it says how long it may
  (`s-maxage`). The sitemap, `robots.txt` and the API's `llms.txt` do:
  `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400`, so a crawl reads the database
  once an hour at most. They change only when content is published; an hour's lag is the price.

What the CDN does not keep, and so what the database sees: an API request, and every request to
Studio. `GET /api/content` and `GET /api/content/:collection` answer one page in one statement:
each item is the whole document, with body, rendered HTML and sections, unless the request asks for
`view=summary` or `view=meta`, which Studio does. They are for Studio and for integrations. Anonymous GET requests are allowed unless `auth.requireAuthForReads` is set (see
[api.md](api.md#auth-configuration)), so on a site that leaves it off, any visitor can make the database read them.

## What makes a read small

A list that names, orders or filters documents reads no body. `@krantho/persistence` has one list
read, `query`, and the caller declares how much of each document it wants:

| Projection | Returns | Used by |
|---|---|---|
| `meta` | the meta | Studio's site tree (`GET /api/content-tree`), the palette's publish-ahead lookup (`GET /api/content?view=meta`), the translation status |
| `summary` | meta, fields and the authored metadata, of the current or live version | Pulse and Site (`GET /api/content?view=summary`), the palette's search, Studio's reference pickers, the sitemap, `llms.txt`, the site's SEO findings, the assistant's reads, a page's lists (`listPublishedSummaries`) |
| `full` | the whole document: meta, fields, body, HTML, sections | a page render (`getPublished`, `listPublished`), an export, a list asked for without a `view` |

A SQL adapter answers a query with one statement that selects the projection's columns alone. A text
match runs in the database too: the body column is searched but not returned for a `meta` or
`summary` projection, and a snippet is the substring around the first match, so a search reads no
body into the site. A page is read as `LIMIT n + 1`, so `hasMore` costs no count. `listVersions`
reads the meta columns of each version. The body, the HTML and the sections are nearly all of a
row's weight, and they are what a sidebar, a sitemap or a history list never needs. See
[persistence.md](persistence.md#contentquery) for the query.

## Statements per reader

Each reader makes the statements in the second column, asserted by the test in the third. Before the
unified read each made a statement per collection, and the Studio readers one per collection, per
locale and per page of 100 rows; a list with a `limit` or `offset` made a second statement for a
count, and search read every collection whole.

| Reader | Statements now | Asserted by |
|---|---|---|
| Studio's site tree, `GET /api/content-tree` | 1, for every collection | `packages/api/test/content-tree.test.ts` |
| Pulse | 1 per 500 documents: one `GET /api/content` page across every collection and locale | `packages/studio/test/pulse-page.test.tsx` |
| Site, the overview | 1 per 500 documents, across every collection in the default locale | `packages/studio/test/site-overview.test.tsx` |
| Site, a collection's list | 1 per 500 documents of that collection | `packages/studio/test/collection-view.test.tsx` |
| The site's SEO findings, `GET /api/seo/findings` | 1 for the documents of every collection with pages; the SEO configuration is read once, apart from it | `packages/api/test/seo-document.test.ts` |
| Translation status, `GET /api/translations/status` | 1, for every collection and locale | `packages/api/test/translation-status.test.ts` |
| Search, `GET /api/content/search` | 1 per request: one page of matches across every collection | `packages/api/test/search-content.test.ts` |
| A content list, `GET /api/content` or `/api/content/:collection` | 1 per request; no count | `packages/api/test/list-content.test.ts` |
| The assistant's `search_documents` | 1 per call | `packages/api/test/assistant-tools.test.ts` |

A page of 500 is `fetchAllDocuments` in Studio; `content.list.maxLimit`, when set lower, makes the
pages smaller and the count of statements larger. The content on krantho.com (about 140 documents) is
one page.

## What was reading too much

Measured on the krantho.com content, in database-to-site bytes, as each reader was moved from whole
documents to summaries and metas (before the statements above were folded into one `query` each):

| Read | Before | After |
|---|---|---|
| Studio's site tree, one refresh | 1.8 MB, 23 requests | 40 KB, 3 requests (now 1 statement) |
| `/sitemap.xml`, one uncached read | 1.7 MB | 45 KB, and the CDN keeps it for an hour |
| A document's version history | every version's body | meta of every version |
| `GET /api/seo/findings`, which every Studio screen with a findability figure reads | 1.8 MB and 254 statements | 43 KB and 7 statements (now 1 for the documents) |
| Pulse, one visit | 3.7 MB | 190 KB |
| Site and a collection's list, one visit | 3.2 to 3.6 MB | 85 to 165 KB |
| A Structure tab, one visit | 1.8 MB | 80 to 100 KB |

The site tree is read once a minute while Studio is open, so one open tab cost about 107 MB an hour,
night and day if the computer stayed awake: 2.6 GB a day. The tree now reads when the tab comes back
into view and once a minute only while it is in view, and a refresh weighs 40 KB, about 2.4 MB an
hour.

## What each Studio screen reads

Measured on the krantho.com content, in database-to-site bytes, for one visit to the screen with the
site tree (25 KB, 1 statement) already counted:

| Screen | Reads | Total |
|---|---|---|
| Pulse | summaries of every collection in one list, the site's findings, the failed deliveries | 190 KB |
| Site, a collection's list | summaries of one or every collection in one list, the site's findings | 85 to 165 KB |
| Structure | the SEO catalog and configuration, the site's findings | 80 to 100 KB |
| An editor | the document, its SEO resolution and findings, the site's findings | 120 KB, plus the Live preview's render |
| Media, Setup | its own small read, nothing of the content | 35 to 40 KB |

The site's findings (`GET /api/seo/findings`) read the live documents as summaries (fields and authored metadata, no body, HTML,
sections or contract) in one statement, and the whole SEO configuration once, however many pages they cover. Each page used to read the site,
collection, URL-pattern and document scopes again.

## What still reads a lot

The Live preview renders the page as a visitor would see it, in preview, which no cache keeps. A
page template that lists documents without their body reads `listPublishedSummaries`, as the
krantho.com navigation and card lists do; a template that builds a list from `listPublished` reads
each document of the collection whole.

The first view of a page after a deployment fills the page cache, and a fresh data cache reads the
whole collection once; both persist afterwards.

A filesystem site reads and parses every file of a collection for any list, `meta` and `summary`
included: the adapter drops the body after the read, so only a database adapter saves the read.

## Measuring it

A byte-counting TCP proxy between the site and a throwaway Postgres shows what each request reads.
Run the built site (`next build`, then `next start`) with
`KRANTHO_PERSISTENCE_POSTGRES_URL` pointing at the proxy, keep `cache.pages: 'next-isr'`, and read
the proxy's server-to-client counter before and after each request. `next dev` reads the database
on every request, so it measures nothing useful.
