---
title: 'Does the AI enrichment require Anthropic?'
topic: product
order: 8
docs-page: seo-pipeline
status: published
---

No. Enrichment runs through `@krantho/ai`, which speaks to Anthropic, OpenAI, Gemini, OpenRouter and Ollama. Anthropic is the default provider; the site's configuration chooses another, and Settings in Studio can change the provider and model later. Ollama runs locally and needs no key.

Enrichment is optional. Structured data, meta tags and Studio's SEO tools work without it. When it runs, it fills missing meta descriptions and Schema.org properties, and never overwrites what an editor wrote.
