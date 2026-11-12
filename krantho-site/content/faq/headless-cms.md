---
title: 'How is krantho different from a headless CMS?'
topic: product
order: 3
docs-page: introduction
status: published
---

A headless CMS runs as a separate service, and your site fetches its content over the network. Krantho runs in the same app as your site. Page templates read published content in-process, through the content loader, and Studio is served by your own routes. The content model is Zod schemas in your codebase, reviewed and versioned with the site.

You still have an API. Everything Studio does goes through a REST API, described by an OpenAPI 3.1 specification at `/api/openapi.json`, so other tools and the `krantho` command-line tool can work with the same content.
