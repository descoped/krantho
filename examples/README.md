# Examples

Six example applications demonstrating the krantho framework across different UI stacks and rendering strategies. All six render the same site — identical content, layout, and visual output — using the same shared theme and CMS content.

| Port | Directory | Stack | Rendering | UI Approach |
|------|-----------|-------|-----------|-------------|
| 4001 | `nextjs-mui/` | Next.js 16 + React 19 + MUI v7 | SSR (Next.js) | MUI components + CSS variables |
| 4002 | `nextjs-shadcn/` | Next.js 16 + React 19 + Tailwind v4 | SSR (Next.js) | Tailwind utilities + CSS variables |
| 4003 | `sveltekit-tailwind/` | SvelteKit 2 + Svelte 5 + Tailwind v4 | SSR (SvelteKit) | Tailwind utilities + CSS variables |
| 4004 | `sveltekit-shadcn/` | SvelteKit 2 + Svelte 5 + Tailwind v4 | SSR (SvelteKit) | Tailwind utilities + CSS variables |
| 4005 | `react-ssr/` | React 19 + Vite 8 + Express 5 | SSR (Vite + Express) | Plain React + CSS variables |
| 4006 | `react-spa/` | React 19 + Vite 8 + react-router 7 | CSR (pure SPA) | Plain React + CSS variables |

---

## Running

### Prerequisites

```bash
pnpm run build     # Build all @krantho/* packages (required before first run)
```

### Start Dev Servers

```bash
cd examples/nextjs-mui && pnpm run dev          # http://localhost:4001
cd examples/nextjs-shadcn && pnpm run dev       # http://localhost:4002
cd examples/sveltekit-tailwind && pnpm run dev  # http://localhost:4003
cd examples/sveltekit-shadcn && pnpm run dev    # http://localhost:4004
cd examples/react-ssr && pnpm run dev           # http://localhost:4005
cd examples/react-spa && pnpm run dev           # http://localhost:4006
```

All examples can run simultaneously on non-colliding ports. Each dev script loads the repository root `.env` when it exists: the Vite and Express examples with `node --env-file-if-exists`, the Next.js examples through `scripts/with-env.mjs`, because `next dev` passes Node's flags to its server through `NODE_OPTIONS`, where Node 26 refuses `--env-file`.

### Hot Reload Behavior

| What changed | Effect |
|--------------|--------|
| Example source files (pages, components, CSS) | Instant hot-reload via HMR — no restart needed |
| `theme/globals.css` | Hot-reloads across every running example simultaneously |
| `packages/*/src/` source files | Requires `pnpm run build` then dev servers pick up via HMR |
| `content/pages/*.md` | Imported into the database when the API (or the first page read) initializes (`KRANTHO_CONTENT_WATCH=true` syncs edits while running); pages show the published version. The Next examples cache each page under `next start` until a change invalidates it (`cache.pages: 'next-isr'`); `next dev` reads every request. The SvelteKit examples and `react-ssr` render every request with their default `cache.pages: 'none'`, from reads the content loader keeps for `content.cache.ttlMs` (5 minutes by default), so a synced edit shows within that time. `react-spa` converts the files to JSON at build time |
| `content/seo/generated/*` | Requires dev server restart (files read at startup) |

Exception: `@krantho/ui-svelte` resolves from source (`src/index.ts`), not dist — changes hot-reload without rebuilding.

### Production Build

```bash
pnpm run build:all # Builds packages + all examples (`pnpm run build` builds packages only)
```

- Next.js examples: `next build` produces optimized SSR + static output
- SvelteKit examples: `vite build` produces SSR bundle via Rolldown

---

## Directory Structure

```
examples/
├── theme/                       # Shared theme (all examples import this)
│   ├── globals.css              # Design tokens, resets, shared component classes
│   ├── fonts.css                # Google Fonts @import (not used — examples use <link> tags)
│   └── mui-theme.ts             # Reference MUI theme (examples may override locally)
│
├── content/                     # Shared CMS content (all examples read from here)
│   ├── globals/                 # Site-wide frontmatter-only documents
│   │   ├── navigation.md        # Logo text, nav labels
│   │   ├── footer.md            # Footer text, copyright
│   │   └── contact-info.md      # Phone, email, address, hours
│   ├── services/                # One file per service (title, description, ingress, order)
│   ├── blog/                    # Blog posts
│   ├── pages/                   # Markdown + YAML frontmatter
│   │   ├── home.md              # Home page: title, intro, section content
│   │   ├── about.md             # About page: bio, approach, methodology
│   │   ├── services.md          # Services listing page
│   │   ├── contact.md           # Contact page
│   │   └── fees.md              # Pricing: service names, durations, prices
│   └── seo/
│       ├── business.yaml        # Schema.org: legal name, geo, area served, credentials
│       ├── site-config.json     # Domain, appRoutes[], serviceIds[], route-to-slug mapping
│       ├── guardrails.yaml      # FAQ Q&A pairs per route (for FAQPage schema)
│       └── generated/           # Build output — never hand-edit these
│           ├── structured-data.json  # LocalBusiness + Person JSON-LD entities
│           ├── faq-pages.json        # Route-keyed FAQ arrays
│           ├── llms.txt              # AI-readable site summary (Markdown)
│           └── content-dates.json    # Content modification timestamps
│
├── nextjs-mui/                  # Port 4001 — Next.js + MUI
├── nextjs-shadcn/               # Port 4002 — Next.js + Tailwind
├── sveltekit-tailwind/          # Port 4003 — SvelteKit + Tailwind
├── sveltekit-shadcn/            # Port 4004 — SvelteKit + Tailwind
├── react-ssr/                   # Port 4005 — React SSR (Vite + Express)
└── react-spa/                   # Port 4006 — React SPA (Vite)
```

---

## Theme System

### Architecture

```
theme/globals.css              ← Single source of truth (CSS variables + shared classes)
    │
    ├── nextjs-mui/lib/theme.ts           ← Maps CSS vars → MUI theme system
    ├── nextjs-shadcn/app/globals.css     ← Maps CSS vars → Tailwind @theme
    ├── sveltekit-tailwind/src/app.css    ← Maps CSS vars → Tailwind @theme
    └── sveltekit-shadcn/src/app.css      ← Maps CSS vars → Tailwind @theme
```

`globals.css` owns all values. Each example's local CSS maps those values into its framework's system. No local file redefines colors or font sizes — they only reference CSS variables.

### CSS Custom Properties

Defined in `theme/globals.css` under `:root` (light mode) and `.dark` (dark mode):

| Variable | Light | Dark | Purpose |
|----------|-------|------|---------|
| `--primary` | `#1a2744` | `#93b4e8` | Header, footer, nav background |
| `--primary-foreground` | `#ffffff` | `#0f1219` | Text on primary backgrounds |
| `--accent` | `#c8953e` | `#d4a957` | Buttons, links, highlights |
| `--accent-foreground` | `#ffffff` | `#0f1219` | Text on accent backgrounds |
| `--background` | `#ffffff` | `#0f1219` | Page background |
| `--foreground` | `#1a2744` | `#e8e6e1` | Body text |
| `--muted` | `#f8f7f4` | `#1a1f2b` | Muted section backgrounds |
| `--muted-foreground` | `#64748b` | `#94a3b8` | Secondary/caption text |
| `--card` | `#ffffff` | `#1a1f2b` | Card backgrounds |
| `--card-foreground` | `#1a2744` | `#e8e6e1` | Card text |
| `--border` | `#e5e5e0` | `#2a3040` | Borders, dividers |
| `--ring` | `#c8953e` | `#d4a957` | Focus rings |
| `--radius` | `0.5rem` | `0.5rem` | Border radius |
| `--font-heading` | Inter | Inter | Headings, logo, nav |
| `--font-body` | DM Sans | DM Sans | Body text, paragraphs |
| `--font-mono` | JetBrains Mono | JetBrains Mono | Code blocks |
| `--hero-gradient` | Navy gradient | Dark gradient | Hero section background |

### CSS Reset

`globals.css` includes a minimal CSS reset that normalizes behavior across MUI, Tailwind, and plain Svelte:

```css
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; }
h1, h2, h3, h4, h5, h6 { margin: 0; }
p { margin: 0; }
```

Tailwind's preflight already does this. The explicit reset ensures MUI examples (which don't use Tailwind preflight) match.

### Shared Component Classes

These classes are defined in `globals.css` and used by every example to guarantee pixel-identical rendering. Each example applies them using its framework's idiom (MUI `className`, Tailwind `class`, Svelte `class`).

**Layout sections:**

| Class | Computed Styles | Usage |
|-------|----------------|-------|
| `.section-primary` | `background: var(--hero-gradient); color: #fff` | Hero section, gradient background |
| `.section-white` | `background-color: var(--background)` | Content sections |
| `.section-muted` | `background-color: var(--muted)` | Alternating background sections |
| `.section-container` | `max-width: 1120px; margin: 0 auto; padding: 4rem 1.5rem` | Content width constraint |

**Hero typography:**

| Class | Computed Styles |
|-------|----------------|
| `.hero-title` | `font-size: 2.25rem; font-weight: 700; font-family: Inter; letter-spacing: -0.02em; line-height: 1.2; margin-bottom: 1rem` |
| `.hero-subtitle` | `font-size: 1.125rem; line-height: 1.56` |
| `.hero-btn` | `padding: 12px 24px; background: var(--accent); color: #fff; border-radius: var(--radius); font-size: 0.875rem; font-weight: 600` |

**Header:**

| Class | Computed Styles |
|-------|----------------|
| `.site-header` | `background-color: var(--primary); color: var(--primary-foreground)` |
| `.site-header nav a` | `font-size: 0.875rem; font-weight: 500; line-height: 20px; opacity: 0.7` |
| `.site-logo-name` | `font-size: 1.125rem; font-weight: 700; font-family: Inter; line-height: 1.25` |
| `.site-logo-subtitle` | `font-size: 0.875rem; opacity: 0.7; margin-left: 0.5rem` |

**Section titles:**

| Class | Computed Styles |
|-------|----------------|
| `.section-title` | `font-size: 1.5rem; font-weight: 600; font-family: Inter; text-align: center; margin-bottom: 2rem` |

**Service cards:**

| Class | Computed Styles |
|-------|----------------|
| `.service-card` | `border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); color: var(--card-foreground); padding: 1.5rem` |
| `.service-card h3` | `font-size: 1.25rem; font-weight: 600; font-family: Inter; margin-bottom: 0.5rem` |

**Footer:**

| Class | Computed Styles |
|-------|----------------|
| `.site-footer` | `background-color: var(--primary); color: var(--primary-foreground)` |
| `.site-footer h4` | `font-size: 1rem; font-weight: 600; font-family: Inter; margin-bottom: 0.5rem` |
| `.site-footer p` | `font-size: 0.875rem; line-height: 20px; opacity: 0.7` |
| `.site-footer .footer-caption` | `font-size: 0.75rem; line-height: 16px; opacity: 0.5` |
| `.site-footer .footer-spacer` | `margin-top: 1rem` |
| `.site-footer-divider` | `border-top: 1px solid rgba(255,255,255,0.2); margin-top: 2rem; padding-top: 1.5rem; text-align: center; font-size: 0.75rem; opacity: 0.5` |

**Prose (Markdown content):**

| Class | Styles |
|-------|--------|
| `.prose h2` | `1.5rem, 700 weight, 1.5rem top margin` |
| `.prose h3` | `1.25rem, 600 weight` |
| `.prose h4` | `1rem, 600 weight` |
| `.prose p` | `0.75rem vertical margin` |
| `.prose ul/ol` | `1.5rem left padding` |
| `.prose a` | `accent color, underlined` |
| `.prose code` | `muted background, 0.875em` |
| `.prose pre` | `muted background, rounded, overflow-x` |
| `.prose blockquote` | `3px accent left border` |
| `.prose table` | `full width, collapsed borders` |

### Dark Mode

Each example includes a `ThemeToggle` component cycling through three modes: **light**, **dark**, **system**.

**Mechanism:**
1. Toggle adds/removes `.dark` class on `<html>`
2. CSS custom properties switch values via the `.dark { ... }` block in `globals.css`
3. Preference persists in `localStorage` under key `theme`, and a small script in the page head applies it before the first paint
4. In system mode, `matchMedia('(prefers-color-scheme: dark)')` listener updates on OS change

**Implementation per framework:**

| Framework | Component | State Management |
|-----------|-----------|-----------------|
| React | `ThemeToggle.tsx` | `useState` + `useEffect` + `localStorage` |
| Svelte | `ThemeToggle.svelte` | `$state` + `$effect` + `localStorage` |

Both render an identical button: icon + label text (e.g., "System"), cycling light → dark → system → light.

### How to Modify the Theme

**Change a color globally:**
Edit `theme/globals.css` — update the variable in both `:root` and `.dark`:

```css
:root {
  --accent: #c8953e;   /* ← change this */
}
.dark {
  --accent: #d4a957;   /* ← and this for dark mode */
}
```

Every running example updates via HMR.

**Change typography:**
Edit the `--font-heading`, `--font-body`, or `--font-mono` variables. Also update the Google Fonts `<link>` tag in each example's layout file.

**Change a shared component (e.g., card padding):**
Edit the `.service-card` class in `globals.css`. Every example inherits the change.

**Change MUI-specific behavior** (e.g., ripple, elevation, transitions):
Edit `nextjs-mui/lib/theme.ts`. This only affects port 4001.

**Change Tailwind utility availability** (e.g., add custom color names):
Edit the `@theme` block in the example's local CSS (`app/globals.css` or `src/app.css`).

### Local Override Files

| Example | File | What It Does |
|---------|------|-------------|
| `nextjs-mui` | `lib/theme.ts` | `createTheme()` with `MuiCssBaseline.styleOverrides` (applies body/heading resets, forces CSS variable colors over Emotion's static injection). `MuiTypography` variant overrides set all heading variants to `fontSize: inherit; lineHeight: inherit; letterSpacing: inherit` so `globals.css` classes control sizing. |
| `nextjs-mui` | `components/ThemeRegistry.tsx` | Wraps app in `AppRouterCacheProvider` + `ThemeProvider` + `CssBaseline`. Required for MUI + Next.js App Router. |
| `nextjs-shadcn` | `app/globals.css` | `@import "tailwindcss"; @import "../../theme/globals.css";` then `@theme { --color-accent: var(--accent); ... }` mapping all CSS variables to Tailwind's theme system. |
| `sveltekit-tailwind` | `src/app.css` | Same pattern as nextjs-shadcn: Tailwind import + globals import + `@theme` variable mapping. |
| `sveltekit-shadcn` | `src/app.css` | Same pattern as nextjs-shadcn: Tailwind import + globals import + `@theme` variable mapping. |

---

## CMS Integration

### Content Loading

| Framework | How Content Loads | Package |
|-----------|-------------------|---------|
| Next.js (React) | React Server Components call `getCMSContent(collection, slug)` (or `requirePublished` from `lib/krantho.ts`) at render time. No client JS. | `@krantho/ui-react/server` over `createContentLoader` from `@krantho/server-next` |
| SvelteKit (Svelte) | `+page.server.ts` calls `loadContent(collection, slug)`, passes data to page via `$props()` | `createContentLoader` from `@krantho/server-sveltekit` + `renderContent` from `@krantho/core` via `#lib/cms.ts` |
| React SSR (Express) | `entry-server.tsx` calls `loadContent(collection, slug)` for the route and the globals, renders React, and hands the content to the client in `window.__CMS_CACHE__` | `createContentLoader` from `@krantho/server-node` + `renderContent` from `@krantho/core` via `src/lib/cms.ts` |
| React SPA | Fetches JSON pre-built from `content/*.md` at build time; no database, no API | local `useContent` hook |

The Next.js, SvelteKit and React SSR examples read the same database the krantho API writes -- SQLite by default -- through one `krantho.collections.ts` that the API and the loader both import.

Pages show only published content: a draft save in Studio leaves the live page as it is, Publish makes the new version live, and unpublishing, archiving or deleting a page takes it offline (a 404).

### React CMS Components

```tsx
import { CMSTextServer, CMSMarkdownServer } from '@krantho/ui-react/server'
import { requirePublished } from '@/lib/krantho'

// In a server component (async) — 404 via notFound() unless published:
const { fields, sections } = await requirePublished('pages', 'home')

// Render a fields value as text:
<CMSTextServer collection="pages" slug="home" field="title" variant="h1" component="h1" className="hero-title" />

// Render the markdown body:
<CMSMarkdownServer collection="pages" slug="home" className="prose" />

// Render a specific ## section from markdown:
<CMSMarkdownServer collection="pages" slug="about" section="Our Approach" className="prose prose-sm" />
```

**Props**: `collection` and `slug` identify the document (`locale` is optional, default the site's default locale). `field` reads a fields key. `variant` and `component` control the rendered element. `className` applies shared CSS classes. `section` filters to a specific `## heading` section from the markdown body.

### Svelte CMS Components

```typescript
// +page.server.ts
import { error } from '@sveltejs/kit'
import { loadContent } from '#lib/cms.ts'

export async function load() {
  const home = await loadContent('pages', 'home') // null unless published
  if (!home) error(404, 'Not found')
  return { fields: home.fields, html: home.html }
}
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { CMSText, CMSMarkdown } from '@krantho/ui-svelte'
  let { data } = $props()
  const fm = $derived(data.fields)
</script>

<CMSText text={fm['title']} variant="h1" class="hero-title" />
<CMSMarkdown html={data.html} class="prose" />
```

**Key difference**: React components fetch their own data (server components). Svelte components are pure renderers — data must be loaded in the server load function and passed down.

### Content File Format

Each `.md` file in `content/pages/` has YAML frontmatter and optional markdown body with `## sections`:

```markdown
---
title: Acme Consulting — Strategy & Digital Transformation
description: Strategy consulting firm in San Francisco
services-main-title: Our Services
about-section-title: Why Acme?
about-button: Learn more about us
---

We partner with ambitious organizations...

## Transform Your Business

We bring clarity to complexity...

## What We Do

Our team combines deep industry knowledge...
```

Field keys are accessed as `fields['title']`. Markdown sections are accessed as `sections['strategy']` (matching the `## heading` text, lowercased and hyphenated).

---

## SEO Integration

### Package Responsibilities

| Package | Provides | Used By |
|---------|----------|---------|
| `@krantho/ui-react/server` | `SeoJsonLd`, `resolveSeoContent` (React server components) | Next.js examples |
| `@krantho/ui-svelte` | `JsonLd` (Svelte component) | SvelteKit examples |
| `@krantho/core` | `loadSeoJson()`, `loadSeoText()` (framework-agnostic utilities) | All examples |
| `@krantho/tools` | `seo:generate` pipeline (generates structured-data.json, faq-pages.json, llms.txt) | Build-time only |

### Structured Data (JSON-LD)

**React (4001, 4002):**

```tsx
// app/(site)/[[...slug]]/home.tsx — per-page SEO JSON-LD graph (includes breadcrumbs, business data, FAQ)
import { SeoJsonLd, resolveSeoContent } from '@krantho/ui-react/server'

export async function generateMetadata() {
  const seo = await resolveSeoContent('pages', 'home')
  return { title: seo.title, description: seo.description }
}

// In component:
<SeoJsonLd collection="pages" slug="home" />
```

React SEO components are server components — they read the JSON-LD graph, composed from the published version, through the content loader during SSR. No client JavaScript. Site-level structured data (LocalBusiness, Person) is included in every page's graph.

**Svelte (4003, 4004):**

```svelte
<!-- +page.server.ts reads the page's JSON-LD graph -->
import { loadJsonLd } from '#lib/cms.ts'
const jsonLd = await loadJsonLd('pages', 'home')

<!-- +layout.svelte renders site-level structured data -->
import { JsonLd } from '@krantho/ui-svelte'
{#each Object.values(data.structuredData) as entity}
  <JsonLd data={entity} />
{/each}

<!-- +page.svelte renders per-page JSON-LD -->
<svelte:head>
  {#if data.jsonLd}
    {@html `<script type="application/ld+json">${JSON.stringify(data.jsonLd)}</script>`}
  {/if}
</svelte:head>
```

Svelte pages read JSON-LD with `loadJsonLd()` from `#lib/cms` in `+page.server.ts` (composed in-process from the published version) and render it inline via `<svelte:head>`. The `#lib/seo.ts` helper provides file-based loaders for generated JSON.

### SEO Routes

Every example serves these routes:

| Route | Content | Next.js, SvelteKit, React SSR | React SPA |
|-------|---------|-------------------------------|-----------|
| `/sitemap.xml` | XML sitemap | the krantho API, `/api/seo/sitemap`: the published documents of every collection, under `site.baseUrl` | generated at build from `content/seo/site-config.json` → `appRoutes[]` |
| `/robots.txt` | User-agent rules + sitemap URL | the krantho API, `/api/seo/robots.txt`: robots rules from the SEO configuration | generated at build from `content/seo/site-config.json` |
| `/llms.txt` | AI-readable site summary in Markdown | `content/seo/generated/llms.txt` | generated at build |

The SvelteKit and React SSR examples answer `/sitemap.xml` and `/robots.txt` with `Cache-Control: no-cache`: they read no tagged content, so behind a CDN (`cache.pages: 'cdn'`) no purge would reach them.

**Next.js implementation:**

| Route | File | Mechanism |
|-------|------|-----------|
| `/sitemap.xml` | `next.config.ts` rewrite | `/api/seo/sitemap`: the published documents of every collection |
| `/robots.txt` | `next.config.ts` rewrite | `/api/seo/robots.txt`: robots rules from the SEO configuration |
| `/llms.txt` | `app/llms.txt/route.ts` | Route handler returning `Response` with `text/plain` content type |

**SvelteKit implementation:**

| Route | File | Mechanism |
|-------|------|-----------|
| `/sitemap.xml` | `src/routes/sitemap.xml/+server.ts` | Proxies `/api/seo/sitemap`, answered with `Cache-Control: no-cache` |
| `/robots.txt` | `src/routes/robots.txt/+server.ts` | Proxies `/api/seo/robots.txt`, answered with `Cache-Control: no-cache` |
| `/llms.txt` | `src/routes/llms.txt/+server.ts` | Server endpoint returning `Response` with `text/plain` |

**React SSR implementation:** `server.ts` answers `/sitemap.xml` and `/robots.txt` from the krantho API it mounts, with `Cache-Control: no-cache`, and `/llms.txt` from the generated file.

SvelteKit routes use `#lib/seo.ts` helpers instead of importing from `@krantho/core` barrel (avoids Node ESM resolution issues with the barrel export).

### Meta Tags

| Framework | Mechanism | Example |
|-----------|-----------|---------|
| Next.js | `generateMetadata()` async function in page files | `export async function generateMetadata() { return { title: fm['title'] } }` |
| SvelteKit | `<svelte:head>` in page components | `<svelte:head><title>{fm['title']}</title></svelte:head>` |

Both read title and description from CMS fields.

### Regenerating SEO Data

```bash
pnpm run seo:generate   # from the repository root
```

The root script passes `--root examples/nextjs-shadcn`, whose `content/` is a symlink to the shared `examples/content/`. This runs the `@krantho/tools` pipeline which reads `content/seo/business.yaml`, `guardrails.yaml`, and CMS content to generate:
- `structured-data.json` — LocalBusiness + Person Schema.org entities
- `faq-pages.json` — Route-keyed FAQ Q&A arrays
- `llms.txt` — AI-readable Markdown site summary

Generated files are committed to git. They're read at runtime by the SEO components and route handlers.

---

## Per-Example File Maps

### nextjs-mui (4001)

```
nextjs-mui/
├── app/
│   ├── layout.tsx              # Root layout: html, head, ThemeRegistry — reads no content
│   ├── (site)/layout.tsx       # Header, Footer (navigation and footer globals)
│   ├── (site)/[[...slug]]/     # ISR route for / and every other page (/about, /fees, /contact, ...)
│   │   ├── page.tsx            # Picks the page by slug; generateMetadata
│   │   ├── home.tsx, home-content.tsx    # Home: hero, content, services grid, CTA
│   │   ├── about.tsx, about-content.tsx  # About
│   │   └── general.tsx, general-content.tsx  # Any other published page: title, lead, body
│   ├── (site)/services/[[...slug]]/      # ISR route for /services and /services/<slug>
│   │   ├── page.tsx            # List or detail by slug
│   │   ├── list.tsx, services-content.tsx
│   │   └── detail.tsx
│   └── llms.txt/route.ts       # /llms.txt (route handler)
├── components/
│   ├── Header.tsx              # MUI Box layout, Typography for logo, nav links
│   ├── Footer.tsx              # MUI Box grid, shared footer classes
│   ├── ThemeRegistry.tsx       # AppRouterCacheProvider + ThemeProvider + CssBaseline
│   ├── ThemeToggle.tsx         # Light/dark/system toggle (plain HTML button)
│   ├── ServiceCard.tsx         # Re-exports from mui/ServiceCard
│   └── mui/ServiceCard.tsx     # MUI Box with .service-card class
├── lib/
│   ├── krantho.ts              # Content loader registration + requirePublished
│   └── theme.ts                # MUI createTheme with CssBaseline + Typography overrides
└── next.config.ts              # Rewrites; the shared cache handler when cache.shared is 'database'
```

**MUI-specific patterns:**
- `ThemeRegistry.tsx` wraps the app in `AppRouterCacheProvider` (prevents Emotion hydration mismatch), `ThemeProvider`, and `CssBaseline`
- `theme.ts` configures `MuiCssBaseline.styleOverrides` to apply CSS variable colors and margin resets — this is what makes MUI play nicely with `globals.css`
- All MUI Typography variants are set to `fontSize: inherit; lineHeight: inherit` so shared CSS classes (`.hero-title`, `.section-title`, etc.) control sizing instead of MUI defaults
- MUI `Box` uses `sx` prop for layout (flex, grid, padding) but `className` for visual styling

### nextjs-shadcn (4002)

```
nextjs-shadcn/
├── app/
│   ├── globals.css             # Tailwind + globals.css import + @theme variable mapping
│   ├── layout.tsx              # Root layout: html, head — reads no content
│   ├── (site)/layout.tsx       # Header, Footer (navigation and footer globals)
│   ├── (site)/[[...slug]]/     # ISR route for / and every other page (/about, /fees, /contact, ...)
│   │   ├── page.tsx            # Picks the page by slug; generateMetadata
│   │   ├── home.tsx            # Home: hero, content, services, CTA
│   │   ├── about.tsx           # About
│   │   └── general.tsx         # Any other published page: title, lead, body
│   ├── (site)/services/[[...slug]]/      # ISR route for /services and /services/<slug>
│   │   ├── page.tsx            # List or detail by slug
│   │   ├── list.tsx
│   │   └── detail.tsx
│   └── llms.txt/route.ts       # /llms.txt
├── components/
│   ├── Footer.tsx              # Footer with shared .site-footer CSS classes
│   ├── Header.tsx              # Tailwind utility classes + shared CSS classes
│   ├── ServiceCard.tsx         # .service-card class
│   └── ThemeToggle.tsx         # Same toggle as MUI example (plain HTML button)
├── lib/
│   └── krantho.ts              # Content loader registration + requirePublished
└── next.config.ts              # Rewrites; the shared cache handler when cache.shared is 'database'
```

**Tailwind-specific patterns:**
- `app/globals.css` maps CSS variables to Tailwind theme: `@theme { --color-accent: var(--accent); --font-heading: var(--font-heading); }`
- This enables Tailwind classes like `bg-accent`, `text-foreground`, `font-heading` to resolve to shared CSS variable values
- Layout includes footer inline (not a separate component) — simpler for Tailwind where no component wrapper is needed
- No MUI, no component library — pure HTML + Tailwind utilities + shared CSS classes

### sveltekit-tailwind (4003)

```
sveltekit-tailwind/
├── src/
│   ├── app.css                           # Tailwind + globals.css + @theme mapping
│   ├── lib/
│   │   ├── cms.ts                        # Published reads (createContentLoader + renderContent)
│   │   ├── seo.ts                        # Generated SEO files (loadSeoJson, loadSeoText)
│   │   └── components/
│   │       ├── index.ts                  # Barrel: CMSText, CMSMarkdown, CMSSection
│   │       ├── CMSText.svelte            # Text renderer
│   │       ├── CMSMarkdown.svelte        # Markdown HTML renderer
│   │       ├── CMSSection.svelte         # Section content renderer
│   │       ├── Footer.svelte             # Footer with shared .site-footer CSS classes
│   │       ├── ServiceCard.svelte        # .service-card class
│   │       └── ThemeToggle.svelte        # Svelte 5 theme toggle ($state + $effect)
│   └── routes/
│       ├── +layout.server.ts             # Loads navigation/footer/contact-info globals, structuredData
│       ├── +layout.svelte                # Header, footer, structured data JsonLd
│       ├── +page.server.ts               # Loads home content + services + SEO preview
│       ├── +page.svelte                  # Home page with inline JSON-LD
│       ├── about/+page.server.ts         # Loads about content + SEO preview
│       ├── about/+page.svelte            # About page with inline JSON-LD
│       ├── [slug]/+page.server.ts        # Loads any other published page (/fees, /contact, ...)
│       ├── [slug]/+page.svelte           # General page: title, lead, body, inline JSON-LD
│       ├── services/+page.server.ts      # Loads services content + SEO preview
│       ├── services/+page.svelte         # Services page with inline JSON-LD
│       ├── sitemap.xml/+server.ts        # /sitemap.xml, answered by the krantho API
│       ├── robots.txt/+server.ts         # /robots.txt, answered by the krantho API
│       └── llms.txt/+server.ts           # /llms.txt
├── vite.config.ts
└── tsconfig.json
```

**SvelteKit-specific patterns:**
- Data loading happens in `+page.server.ts` (runs on server only), data passes to `+page.svelte` via `$props()`
- `+layout.server.ts` loads site-wide data (site config, structured data, FAQ) — available to all routes via layout inheritance
- `#lib/seo.ts` provides `loadSeoJson()`, `loadSeoText()` — file-based loaders that read generated files from `../content/seo/generated/` using `fs.readFileSync`. Per-page JSON-LD graphs come from `loadJsonLd()` in `#lib/cms`
- Site-level structured data (`JsonLd` from `@krantho/ui-svelte`) renders in `+layout.svelte`. Per-page JSON-LD renders inline via `<svelte:head>`
- CMS components (`CMSText`, `CMSMarkdown`) are local in `#lib/components/` (not yet migrated to `@krantho/ui-svelte`)

### sveltekit-shadcn (4004)

```
sveltekit-shadcn/
├── src/
│   ├── app.css                           # Tailwind + globals.css + @theme mapping
│   ├── lib/
│   │   ├── cms.ts                        # CMS loader
│   │   ├── seo.ts                        # Generated SEO files (loadSeoJson, loadSeoText)
│   │   └── components/
│   │       ├── Footer.svelte             # Footer with shared .site-footer CSS classes
│   │       ├── ServiceCard.svelte        # .service-card class
│   │       ├── ThemeToggle.svelte        # Svelte 5 theme toggle
│   │       ├── ui/card.svelte            # Shadcn-style card component (unused — .service-card replaces it)
│   │       └── cms/
│   │           ├── index.ts              # Barrel: CMSText, CMSMarkdown, CMSSection
│   │           ├── CMSText.svelte
│   │           ├── CMSMarkdown.svelte
│   │           └── CMSSection.svelte
│   ├── routes/
│   │   ├── +layout.server.ts
│   │   ├── +layout.svelte
│   │   ├── +page.server.ts
│   │   ├── +page.svelte
│   │   ├── about/+page.server.ts
│   │   ├── about/+page.svelte
│   │   ├── [slug]/+page.server.ts        # Any other published page (/fees, /contact, ...)
│   │   ├── [slug]/+page.svelte
│   │   ├── services/+page.server.ts
│   │   ├── services/+page.svelte
│   │   ├── sitemap.xml/+server.ts        # /sitemap.xml, answered by the krantho API
│   │   ├── robots.txt/+server.ts         # /robots.txt, answered by the krantho API
│   │   └── llms.txt/+server.ts
│   └── hooks.server.ts                   # Page cache handle (CDN headers, signed preview)
├── scripts/verify-cache.mjs              # Checks each cache topology end to end
├── vite.config.ts
└── tsconfig.json
```

**Difference from sveltekit-tailwind**: CMS components live under `#lib/components/cms/` (not `#lib/components/`). Has a `ui/card.svelte` (Shadcn convention) but it's unused — service cards use the shared `.service-card` CSS class instead.

### react-ssr (4005)

```
react-ssr/
├── server.ts                     # Express: krantho API + admin, pages through renderCachedPage; Vite middleware (dev) / built bundles (prod)
├── krantho.config.ts             # Site configuration (data only)
├── krantho.collections.ts        # Collections shared by the API and the page loader
├── index.html                    # Template with <!--head-outlet--> and <!--ssr-outlet-->
├── src/
│   ├── App.tsx                   # AppShell + routeFor routing (path → document and page)
│   ├── entry-server.tsx          # SSR: reads the database, renders React, builds SEO head tags; 404 when no page answers
│   ├── entry-client.tsx          # Hydration with CMSProvider + CMSContentProvider
│   ├── lib/
│   │   ├── cms.ts                # Content loader (createContentLoader from @krantho/server-node)
│   │   └── seo.ts                # SEO helpers (loadSeoJson)
│   ├── components/
│   │   └── Layout.tsx            # Imports shared Header/Footer from theme/react/
│   └── pages/
│       ├── Home.tsx              # CMSText + CMSMarkdown from @krantho/ui-react
│       ├── About.tsx             # CMSText + CMSMarkdown sections
│       ├── General.tsx           # Any other published page: title, lead, body
│       └── Services.tsx          # Service grid with CMSText + CMSMarkdown
├── scripts/verify-cache.mjs      # Checks each cache topology end to end
├── vite.config.ts                # SSR aliases for @krantho/ui-react and @krantho/core
└── tsconfig.json
```

**Architecture**: One Express server mounts the krantho API (`/api`) and Studio (`/studio`) and renders every page through `renderCachedPage` — CDN headers when `cache.pages` is `cdn`, drafts behind a signed preview link. `entry-server.tsx` reads the published content through the content loader and renders full HTML with SEO (title, meta, OG, JSON-LD). Client hydrates with `CMSProvider` + `CMSContentProvider` using pre-loaded content from `window.__CMS_CACHE__`. Pages use `@krantho/ui-react` client components (`CMSText`, `CMSMarkdown`) which resolve data from the pre-loaded cache without re-fetching.

**SEO**: Server-rendered per route — title, description, OG tags, the page's JSON-LD from the database, structured data, breadcrumbs, FAQ schema. `/sitemap.xml` and `/robots.txt` are answered by the krantho API with `Cache-Control: no-cache`; `/llms.txt` is served by Express.

### react-spa (4006)

```
react-spa/
├── index.html                    # Minimal shell — SEO injected by Vite plugin
├── scripts/
│   ├── generate-content.ts       # Build-time: markdown → JSON (gray-matter + marked)
│   ├── generate-seo.ts           # Build-time: sitemap.xml, robots.txt, llms.txt
│   └── prerender.ts              # Build-time: static HTML per route with SEO
├── public/
│   ├── content/json/             # Pre-parsed content (generated)
│   ├── sitemap.xml               # Static (generated)
│   ├── robots.txt                # Static (generated)
│   └── llms.txt                  # Static (generated)
├── src/
│   ├── main.tsx                  # React root with BrowserRouter
│   ├── App.tsx                   # Routes (react-router), loads siteConfig
│   ├── globals.css               # Imports shared theme
│   ├── vite-plugin-seo.ts        # Dev-time SEO injection per route
│   ├── hooks/
│   │   └── use-content.ts        # JSON fetch hook with in-memory cache
│   ├── cms/
│   │   ├── CMSText.tsx           # Text renderer (local, no @krantho/ui-react)
│   │   ├── CMSMarkdown.tsx       # HTML renderer (local, no @krantho/ui-react)
│   │   └── index.ts              # Barrel export
│   ├── components/
│   │   ├── Layout.tsx            # Imports shared Header/Footer from theme/react/
│   │   └── LoadingFallback.tsx   # Shared loading state
│   └── pages/
│       ├── Home.tsx              # Full landing page with service grid
│       ├── About.tsx             # Team + approach sections
│       ├── General.tsx           # Any page in routeToSlug without a component of its own
│       ├── NotFound.tsx          # Unknown paths
│       └── Services.tsx          # Service grid
├── vite.config.ts                # seoPlugin() for dev-time SEO
└── tsconfig.json
```

**Architecture**: Pure client-side rendered SPA. No Node.js runtime. Content pre-parsed to JSON at build time. Local `useContent` hook fetches JSON with in-memory cache. `react-router` provides instant client-side navigation.

**Why local CMS components**: `@krantho/ui-react` client components depend on `ContentEngine` which uses `gray-matter` (requires `Buffer`). Buffer is unavailable in the browser. The SPA uses local `CMSText`/`CMSMarkdown` that fetch pre-built JSON instead.

**SEO strategy**: Two-layer approach:
- **Dev**: `vite-plugin-seo.ts` injects title, meta, OG, JSON-LD into HTML per route via Vite's `transformIndexHtml` hook
- **Production**: `prerender.ts` generates static `index.html` per route with SEO baked in after `vite build`

### Shared React Components (theme/react/)

```
theme/react/
├── index.ts              # Barrel: Header, Footer, ThemeToggle
├── ThemeToggle.tsx        # Light/dark/system toggle (shared by both React examples)
├── Header.tsx             # Accepts renderLink prop — SSR uses <a>, SPA uses <Link>
└── Footer.tsx             # CMS-driven footer with shared CSS classes
```

Both React examples import from `theme/react/` to eliminate duplication. The `Header` component accepts a `renderLink` function prop so each example provides its own link component (plain `<a>` for SSR, react-router `<Link>` for SPA).

---

## Adding a New Page

A published page document renders on every example without a template of its own: its title, its description as the lead and its markdown body, marked for Live editing, with its SEO metadata and JSON-LD. `/about` and `/services` have dedicated templates, `/` is the home page. Add a dedicated template only when a page needs its own layout. A slug with no published document is a 404. `react-spa` converts content at build time, so a new page also needs an entry in `routeToSlug` in `content/seo/site-config.json`.

### Next.js

1. Create `content/pages/newpage.md` with fields + markdown
2. For a layout of its own, create `app/(site)/[[...slug]]/newpage.tsx`, and add it to `PAGES` in that route's `page.tsx` (`newpage: { Page: NewPage, metadata: newPageMetadata }`):
   ```tsx
   import type { Metadata } from 'next'
   import { resolveSeoContent, SeoJsonLd, CMSTextServer, CMSMarkdownServer } from '@krantho/ui-react/server'
   import { requirePublished } from '@/lib/krantho'

   export async function newPageMetadata(): Promise<Metadata> {
     const seo = await resolveSeoContent('pages', 'newpage')
     return { title: seo.title, description: seo.description }
   }

   export async function NewPage(): Promise<React.ReactElement> {
     await requirePublished('pages', 'newpage')
     return (
       <>
         <SeoJsonLd collection="pages" slug="newpage" />
         <section className="section-white">
           <div className="section-container">
             <CMSTextServer collection="pages" slug="newpage" field="title" variant="h1" className="hero-title" />
             <CMSMarkdownServer collection="pages" slug="newpage" className="prose" />
           </div>
         </section>
       </>
     )
   }
   ```
3. Publish it (the file's `status: published`, or **Publish** in Studio): `/sitemap.xml` lists it from then on
4. Refresh `llms.txt` and the generated structured data: `pnpm run seo:generate` from the repository root

### SvelteKit

1. Create `content/pages/newpage.md`
2. For a layout of its own, create `src/routes/newpage/+page.server.ts`:
   ```typescript
   import { error } from '@sveltejs/kit'
   import { loadContent, loadJsonLd } from '#lib/cms.ts'
   export async function load() {
     const page = await loadContent('pages', 'newpage')
     if (!page) error(404, 'Not found')
     const jsonLd = await loadJsonLd('pages', 'newpage')
     return { fields: page.fields, html: page.html, jsonLd }
   }
   ```
3. Create `src/routes/newpage/+page.svelte`:
   ```svelte
   <script lang="ts">
     import { CMSText, CMSMarkdown } from '#lib/components/index.ts'
     let { data } = $props()
   </script>

   <svelte:head>
     {#if data.jsonLd}
       {@html `<script type="application/ld+json">${JSON.stringify(data.jsonLd)}</script>`}
     {/if}
   </svelte:head>
   <section class="section-white">
     <div class="section-container">
       <CMSText text={data.fields['title']} variant="h1" class="hero-title" />
       <CMSMarkdown html={data.html} class="prose" />
     </div>
   </section>
   ```
4. Publish it: `/sitemap.xml` (answered by the krantho API) lists it from then on. Refresh `llms.txt` with `pnpm run seo:generate`

### React SSR

1. Create `content/pages/newpage.md`
2. For a layout of its own, create `src/pages/NewPage.tsx` (`CMSText` and `CMSMarkdown` from `@krantho/ui-react`, as in `About.tsx`)
3. Add `'/newpage': { slug: 'newpage', Page: NewPage }` to `PAGE_ROUTES` in `src/App.tsx`. `entry-server.tsx` reads the published document through the content loader, inside `renderCachedPage`, so the page carries its cache tags
4. Publish it: `/sitemap.xml` (answered by the krantho API) lists it from then on. Refresh `llms.txt` with `pnpm run seo:generate`

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| SvelteKit 500 on page load | `@krantho/core` dist out of date | `pnpm run build` from monorepo root |
| Styles not matching between examples | Local CSS overriding `globals.css` | Check for Tailwind utilities or MUI `sx` that duplicate shared class values |
| SEO routes return 404 | Generated files missing | `pnpm run seo:generate` from the repository root |
| Dark mode not working | `.dark` class not toggling on `<html>` | Check ThemeToggle component, verify `globals.css` is imported |
| MUI body has wrong colors | CssBaseline not applied | Verify `<CssBaseline />` is rendered inside `ThemeProvider` in `ThemeRegistry.tsx` |
| `@krantho/ui-svelte` import fails | Package not built or exports misconfigured | Verify `packages/ui-svelte/package.json` has `"svelte": "./src/index.ts"` in exports |
