# @krantho/tools

Build-time SEO pipeline and content tooling for krantho sites. Reads agent-authored YAML and CMS content, then deterministically maps them to Schema.org structured data, FAQ pages, and `llms.txt` files. This is a private package -- not published to npm, only used within the monorepo.

## Context

The tools package provides the legacy deterministic SEO pipeline that generates structured data from CMS content and YAML configuration files. It predates the runtime archetype system (`@krantho/seo`). The package also holds the LLM enrichment scripts that fill `business.yaml`, `guardrails.yaml` and page meta descriptions, and the unified SEO CLI (`pnpm run seo`, `src/seo/cli.ts`), which uses `@krantho/seo` + `@krantho/persistence-sqlite` for runtime archetype configuration.

## Rationale

- **Deterministic mapping** -- the legacy pipeline transforms CMS content to Schema.org structured data without AI or runtime calls. The output is reproducible from the same input.
- **One configuration** -- the tools resolve the project's `krantho.config.ts` with `@krantho/config`, exactly as the running site does, so build-time enrichment starts from the site's provider, model, key and paths. Runtime enrichment does not read them live: the server seeds `llm.provider`, `llm.model`, `llm.baseUrl` and each provider's key into stored settings once, when no provider is stored yet, and later changes are made in Studio (Setup › AI provider); the credential is chosen per request -- `claude-code` uses the subscription token only, every other provider its own API key from the environment, then the key stored for that provider.
- **Private package** -- tools are internal build-time scripts, not a public API. The legacy mappers additionally depend on project-specific `site-config.json` for routes, service mappings and day-name translations.
- **Separate from CMS** -- the CMS does not depend on tools. `site-config.json` is for `@krantho/tools` only and must not be imported from CMS, admin, or API code.
- **Legacy pipeline coexists with unified CLI** -- the mappers remain available for projects that use the deterministic pipeline. The unified CLI (`pnpm run seo config`, `pnpm run seo preview`, etc.) is the recommended approach for new projects.

## Architecture

```
src/
  index.ts                -- public exports
  seo/
    cli.ts                -- unified archetype CLI
    index.ts              -- legacy pipeline entry (seo:generate)
    enrich-faq.ts         -- validate and generate FAQ pairs in guardrails.yaml
    enrich-services.ts    -- service descriptions in business.yaml
    enrich-llms.ts        -- llms.txt link descriptions in business.yaml
    generate-content-dates.ts -- content-dates.json from git history
    map-business.ts       -- mapBusiness, generateBusinessData
    map-faq.ts            -- mapFAQ, generateFAQData
    map-llms-txt.ts       -- mapLlmsTxt
    types.ts              -- shared SEO types
  cms/
    generate-meta-descriptions.ts -- meta descriptions for pages (seo:enrich:meta)
  shared/
    config.ts             -- loadConfig, parseRoot, withoutRoot
    tool-paths.ts         -- setToolPaths, toolPaths
    llm.ts                -- createLLM, ENRICH_MAX_TOKENS
    concurrency.ts        -- createLimiter, resolveConcurrency
    site-config.ts        -- loadSiteConfig, SiteConfig
    yaml-utils.ts         -- YAML_WRITE_OPTIONS, writeYAMLWithHeader
    cms-reader.ts         -- readCMSContent, readYAML (internal)
```

## Configuration

Every script resolves the project's configuration before it reads or writes anything:

```
defaults <- krantho.config.ts <- process.env
```

`--root <dir>` selects the project; it defaults to the working directory. A root without a
`krantho.config.ts` is an error naming the missing file. In this repository the root
`package.json` scripts (`seo`, `seo:*`) pass `--root examples/nextjs-shadcn`, so they run
against the reference example from the repository root; a later `--root` overrides it.

| What the tools take from the tree | Leaf | Environment |
|---|---|---|
| Provider, model, the provider's key, base URL | `llm.*` | `KRANTHO_LLM_ANTHROPIC_API_KEY`, `KRANTHO_LLM_MODEL`, ... |
| Parallel model calls | `tools.concurrency` | `CLAUDE_CONCURRENCY` |
| Meta-description range and input cap | `seo.enrichment.meta` | -- |
| Service and llms.txt caps, FAQ minimum | `tools.enrich` | -- |
| Content, SEO and generated directories | `paths.contentDir`, `paths.seoGeneratedDir` | `KRANTHO_PATHS_CONTENT_DIR`, ... |
| Archetype database | `persistence.sqlite.path` | `KRANTHO_PERSISTENCE_SQLITE_PATH` |

`--concurrency <n>` on the command line still wins over the resolved value. Every model call
passes an explicit token cap, so OpenAI-format providers are bounded like Anthropic's.

## API Reference

### SEO Mappers

#### `mapBusiness(): StructuredData`

Reads `business.yaml` and CMS content, maps to Schema.org `LocalBusiness` / `ProfessionalService` structured data. Parses opening hours (locale-aware via `dayNameMapping`), address, services, and contact info. Returns the structured data object.

#### `generateBusinessData(dryRun?: boolean): void`

Runs `mapBusiness` and writes `structured-data.json` to the generated SEO directory (`paths.seoGeneratedDir`, default `content/seo/generated`). With `dryRun` it prints instead of writing.

#### `mapFAQ(): Record<string, FAQEntry[]>`

Reads FAQ YAML files, resolves route-based inheritance (child routes inherit parent FAQs), and returns the FAQ entries per route.

#### `generateFAQData(dryRun?: boolean): void`

Runs `mapFAQ` and writes `faq-pages.json` to the generated SEO directory.

#### `mapLlmsTxt(): string`

Renders the `llms.txt` text with link descriptions for LLM consumption. Reads `business.yaml` and CMS content (contact, fees) and renders sections with URLs and descriptions. `seo:generate` writes it to `llms.txt` in the generated SEO directory.

### Site Configuration

#### `loadSiteConfig(): SiteConfig`

Loads `site-config.json` from the project's SEO directory (`seo/` under `paths.contentDir`). Provides defaults for English day name mappings.

```typescript
interface SiteConfig {
  domain: string
  siteName: string
  language: string
  siteDescription: string
  serviceIds: string[]
  servicesSlug: string
  routeToSlug: Record<string, string>
  routeToSection: Record<string, string>
  pageCompositions: Record<string, string[]>
  slugCompositions: Record<string, string[]>
  appRoutes: string[]
  serviceFeeMapping: Record<string, number>
  priceCurrency: string
  addressCountry: string
  dayNameMapping: Record<string, string>
  enrichSkipRoutes: string[]
}
```

### YAML Utilities

#### `YAML_WRITE_OPTIONS`

Shared stringification options: single quotes, plain keys, no line wrapping.

#### `writeYAMLWithHeader(filePath, data, header?): void`

Writes data as YAML, preserving any leading comment header from the original file.

## Usage

### Legacy Pipeline Commands

```bash
pnpm run seo:generate                      # Generate structured-data.json + llms.txt + faq-pages.json
pnpm run seo:generate:dry                  # Same, without writing
pnpm run seo:generate --root ../site       # Run against another project
```

### Enrichment Commands

These call the configured LLM. Each previews by default and writes only with `--apply`; `--concurrency <n>` limits parallel calls.

```bash
pnpm run seo:enrich:faq --apply            # Validate and generate FAQ pairs in guardrails.yaml
pnpm run seo:enrich:services --apply       # Service descriptions in business.yaml
pnpm run seo:enrich:llms --apply           # llms.txt link descriptions in business.yaml
pnpm run seo:enrich:meta --apply           # Meta descriptions for pages
```

The key is the configured provider's own: `llm.<provider>.apiKey`, named `KRANTHO_LLM_<PROVIDER>_API_KEY` in the environment (`KRANTHO_LLM_ANTHROPIC_API_KEY` for the default provider), and the error says which. The `claude-code` provider instead needs `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN` (`llm.claudeCode.authToken`) -- a Claude subscription token from `claude setup-token`, for development on your own machine, never for deployments, and Haiku only (see [ai.md](ai.md#credentials)). A provider never uses another provider's credential, and Ollama needs none. The root scripts run through `tsx` and do not load `.env`, so export the variable in the shell first.

### Unified SEO CLI (recommended)

The unified CLI uses the runtime archetype system and the archetype database at `persistence.sqlite.path`:

```bash
pnpm run seo config show              # Show all archetype configurations
pnpm run seo config set-site <Type>   # Set site-level Schema.org type
pnpm run seo config set <col> <Types> # Set collection archetype types
pnpm run seo preview <col/slug>       # Preview effective config for a document
pnpm run seo validate --all           # Check rich result eligibility
pnpm run seo --root ../site config show      # Run against another project
```

### Programmatic Usage

```typescript
import {
  generateBusinessData,
  generateFAQData,
  loadConfig,
  mapBusiness,
  setToolPaths,
} from '@krantho/tools'

setToolPaths(await loadConfig('/path/to/project'))
const businessData = mapBusiness() // returns the data
generateBusinessData()             // writes structured-data.json
generateFAQData()                  // writes faq-pages.json
```

Without `setToolPaths`, the mappers read and write under the working directory.

## Dependencies

### Runtime Dependencies

- `gray-matter` -- YAML frontmatter parsing
- `p-limit` -- concurrency limiter for parallel operations
- `yaml` -- YAML parsing and serialization

### Workspace Dependencies

- `@krantho/ai` -- LLM client for AI-enriched operations
- `@krantho/config` -- the configuration tree the runtime resolves
- `@krantho/core` -- content types
- `@krantho/persistence` -- persistence interfaces
- `@krantho/persistence-sqlite` -- SQLite adapter for CLI operations
- `@krantho/schema` -- content configuration types
- `@krantho/seo` -- archetype catalog and composition (used by unified CLI)
- `@krantho/seo-shared` -- SEO field discovery primitives
