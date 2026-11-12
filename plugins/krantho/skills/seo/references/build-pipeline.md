# llms.txt and the build-time pipeline

## Contents

- llms.txt — From published content, at request time (any site), From the build-time pipeline (repository tools)
- The archetype CLI
- The Go CLI

## llms.txt

`/llms.txt` is a plain-text guide to the site for AI assistants: a title, a one-paragraph
summary, then sections of links with a short description each (the llmstxt.org format). Two
ways to produce it:

### From published content, at request time (any site)

A route that lists the published documents through the same loader the pages use. It stays
current with Studio and needs no build step:

```ts
// app/llms.txt/route.ts (Next.js)
import { resolveConfig } from '@krantho/config'
import { getAllCMSContent } from '@krantho/ui-react/server'
import '@/lib/krantho'
import config from '@/krantho.config'

const { site } = resolveConfig(config, process.env)

// Which collections to list, under which heading, at which path
const SECTIONS = [
  { collection: 'docs', heading: 'Documentation', path: (slug: string) => `/docs/${slug}` },
  { collection: 'features', heading: 'Features', path: (slug: string) => `/features/${slug}` },
]

export async function GET(): Promise<Response> {
  const base = site.baseUrl.replace(/\/$/, '')
  const lines = [`# ${site.name}`, '', '> One sentence on what the site offers and for whom.', '']
  for (const { collection, heading, path } of SECTIONS) {
    const docs = await getAllCMSContent(collection)
    if (docs.length === 0) continue
    lines.push(`## ${heading}`, '')
    for (const doc of docs) {
      const title = String(doc.fields.title ?? doc.slug)
      const description = String(doc.fields['meta-description'] ?? doc.fields.description ?? '')
      lines.push(`- [${title}](${base}${path(doc.slug)})${description ? `: ${description}` : ''}`)
    }
    lines.push('')
  }
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
```

Keep the summary line in content (a `globals` document) rather than code if editors should own
it. In SvelteKit or Express, build the same text from `loader.listPublished(collection)`.

### From the build-time pipeline (repository tools)

The krantho repository's `@krantho/tools` (private, not on npm; run from a checkout) generate
`llms.txt`, `structured-data.json` and `faq-pages.json` into `paths.seoGeneratedDir`
(`content/seo/generated/` by default) from YAML inputs:

- `content/seo/site-config.json` — routes and service mapping, read only by the tools;
- `content/seo/business.yaml` — business facts (URL, geo, founding year, credentials, prose);
- `content/seo/guardrails.yaml` — FAQ pairs per route.

```bash
# from the krantho checkout; the last --root wins
pnpm run seo:generate:dry --root /path/to/site
pnpm run seo:generate --root /path/to/site
pnpm run seo:enrich:llms --root /path/to/site            # link descriptions (dry run)
pnpm run seo:enrich:llms --apply --root /path/to/site
pnpm run seo:enrich:meta --apply --root /path/to/site    # meta-description into .md files
pnpm run seo:enrich:faq --apply --root /path/to/site
```

`seo:enrich:meta` writes into the markdown files, which reach a database that already has
content only through a content manifest (see the `content` skill); on a running site prefer the
runtime enrichment in `enrichment.md`.

The enrichment commands are dry runs until `--apply`; they use the project's `llm` settings and
the credential order in `enrichment.md`, and read credentials from the shell (they do not load
`.env`). Commit the generated files and serve them:

```ts
// app/llms.txt/route.ts
import { loadSeoText } from '@krantho/core/seo'

export function GET(): Response {
  const content = loadSeoText('llms.txt')
  if (!content) return new Response('llms.txt not generated', { status: 404 })
  return new Response(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
```

`loadSeoJson('structured-data.json')` reads the business entities for a layout, and
`<JsonLd data={…} />` from `@krantho/seo` renders them. These files ship with the deployment; run
the generator again and redeploy to update them. The pipeline is business-oriented
(`LocalBusiness` and `Person` entities); for other sites the archetype system alone is usually
enough.

## The archetype CLI

```bash
# from the krantho checkout, against a site that uses SQLite
pnpm run seo config show --root /path/to/site
pnpm run seo config set-site Organization --root /path/to/site
pnpm run seo config set posts BlogPosting --root /path/to/site
pnpm run seo preview posts/hello-world --root /path/to/site
pnpm run seo validate --all --root /path/to/site
```

It opens the site's SQLite database directly (`persistence.sqlite.path`); it refuses a Postgres
site. Against a running site on any database, use Studio or the SEO API instead.

## The Go CLI

`krantho seo status` (which generated files exist), `krantho seo generate` (the files the server
can build without the tools: the sitemap) and `krantho seo enrich <type>` work over the running
site's API. Build it from the repository's `cli/` directory (`go build ./cmd/krantho`).
