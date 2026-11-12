---
title: "@krantho/tools"
description: The SEO command line and the legacy build-time pipeline that writes structured data, FAQ pages and llms.txt.
area: reference
order: 111
level: advanced
prerequisites: [seo-pipeline]
related: [package-seo, package-ai, cli, configuration]
status: published
---

The build-time SEO tooling. It holds the unified `seo` command line, which reads and writes the archetype configuration, and the legacy pipeline, which reads CMS content and YAML files and maps them deterministically to Schema.org structured data, FAQ pages and `llms.txt`.

`@krantho/tools` is a private package: it runs inside the krantho repository, not as a package you install. The commands on this page run from the repository root; [Project status](/docs/project-status) explains how to work from source.

> [!CAUTION]
> The mappers and `seo:*` scripts are the legacy SEO pipeline. For new projects, use the runtime archetype system in [@krantho/seo](/docs/package-seo), configured in Studio or with the SEO command line below.

## Configuration

Every script resolves the project's `krantho.config.ts` through `@krantho/config`, the same tree the running site resolves, layered as defaults, then `krantho.config.ts`, then `process.env`. The tools read the LLM provider, model and key from that tree. The running site's enrichment reads its provider and model from the settings stored in Studio, which the server seeds from the same tree.

```bash
pnpm run seo:enrich:llms --root ../site   # run against another project
```

`--root <dir>` defaults to the working directory. The API key is the configured provider's own: `KRANTHO_LLM_ANTHROPIC_API_KEY` for the default provider (or `llm: { anthropic: { apiKey } }` in the config file), and the error names the variable the provider reads. The `claude-code` provider instead needs `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN`, the token `claude setup-token` prints, for development on your own machine, and runs Haiku only; no other provider reads the token (see [@krantho/ai](/docs/package-ai#inside-a-krantho-site)). Parallel calls come from `tools.concurrency` (`CLAUDE_CONCURRENCY`, or `--concurrency <n>` on the command line), and the content, generated and database paths from `paths` and `persistence`. The root `seo*` scripts pass `--root examples/nextjs-shadcn`; a later `--root` overrides it. They run through `tsx` and do not load `.env`, so export the credential in the shell before an enrichment run.

## SEO command line

The `seo` command works with the runtime archetype system:

```bash
pnpm run seo config show [target]     # show archetype configuration (all, a collection, or col/slug)
pnpm run seo config set-site <Type>   # set the site-level Schema.org type
pnpm run seo config set <col> <Types> # set collection archetype types, comma-separated (Article,FAQPage)
pnpm run seo config reset <target>    # remove one configuration override
pnpm run seo config clean             # remove every SEO configuration (clean slate)
pnpm run seo preview <col/slug>       # preview the effective configuration for a document
pnpm run seo validate --all           # check rich result eligibility (or validate <col/slug>)
pnpm run seo --root ../site config show   # run against another project
```

The SEO command line reads and writes the project's SQLite database (`persistence.sqlite.path`); it exits with an error on any other persistence provider.

> [!CAUTION]
> The command line writes the database directly, not through the API, so it announces no content change. Pages cached under `cache.pages: 'next-isr'` or `'cdn'` keep showing the previous SEO until something else refreshes them. For a running site, change SEO in Studio instead.

## Legacy pipeline

```bash
pnpm run seo:generate          # generate structured-data.json, llms.txt and faq-pages.json
pnpm run seo:enrich:llms       # preview LLM-written llms.txt link descriptions; --apply writes business.yaml
```

### mapBusiness

Reads `business.yaml` and CMS content, and generates `ProfessionalService` (a `LocalBusiness` subtype) and `Person` structured data. It parses opening hours, address, services and contact details.

```ts
import { loadConfig, mapBusiness, generateBusinessData, setToolPaths } from '@krantho/tools'

// Point the mappers at a project; without this they use the working directory
setToolPaths(await loadConfig('/path/to/project'))

// Get the structured data object
const data = mapBusiness()

// Or write structured-data.json to the project's generated SEO directory
generateBusinessData()
```

### mapFAQ

Reads FAQ YAML files, resolves route-based inheritance, and generates `FAQPage` structured data per route.

```ts
import { mapFAQ, generateFAQData } from '@krantho/tools'

const faqData = mapFAQ() // FAQ entries per route

generateFAQData()
// Writes faq-pages.json to the project's generated SEO directory
```

### mapLlmsTxt

Renders the `llms.txt` text, with link descriptions for language models. `pnpm run seo:generate` writes it to the generated SEO directory.

```ts
import { mapLlmsTxt } from '@krantho/tools'

const text = mapLlmsTxt()
```

## Site configuration

The legacy mappers also read `site-config.json` from the project's SEO directory. This file is for `@krantho/tools` only; the CMS, Studio and API never read it.

```ts
import { loadSiteConfig } from '@krantho/tools'

const config = loadSiteConfig()
// { domain, siteName, language, serviceIds, appRoutes, ... }
```

## YAML utilities

```ts
import { writeYAMLWithHeader, YAML_WRITE_OPTIONS } from '@krantho/tools'

writeYAMLWithHeader('path/to/file.yaml', data, '# Generated file')
```

## Next steps

- Use the runtime archetype system: [@krantho/seo](/docs/package-seo)
- Configure SEO from Studio: [@krantho/studio](/docs/package-studio)
