---
title: Deep Dive into the Agentic SEO Pipeline
date: '2026-03-25'
author: Acme Editorial Team
tags:
  - seo
  - ai
  - tutorial
excerpt: Explore how krantho uses Claude CLI to automatically enrich your content with structured data, FAQs, and meta descriptions.
status: published
---

Krantho's SEO pipeline is not a static template generator. It uses Claude CLI as an agentic tool to analyze your content and produce optimized structured data.

## How It Works

1. **Content analysis** — the pipeline reads all your content files and extracts key information
2. **Schema.org generation** — Claude generates appropriate structured data (LocalBusiness, FAQPage, BreadcrumbList)
3. **FAQ enrichment** — for service pages, Claude generates relevant Q&A pairs
4. **Meta descriptions** — page-level meta descriptions are generated from content context

## Running the Pipeline

```bash
pnpm run seo:generate          # Generate structured data
pnpm run seo:enrich:faq        # Enrich FAQ content
pnpm run seo:enrich:meta       # Generate meta descriptions
```

## The Output

Generated files land in `content/seo/generated/` and are consumed by `@krantho/seo` components at render time. They are never hand-edited — regenerate any time content changes.
