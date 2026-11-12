---
title: JSON-LD
definition: Structured data in JSON embedded in a page, telling search engines and assistants what the page describes.
docs-page: add-seo
status: published
---

Krantho builds one `@graph` per page from the site's and the document's archetypes with `composeFromConfig()` in `@krantho/seo`. A page renders it with `<SeoJsonLd>` from `@krantho/ui-react`, reading the published version of the document. The markup is what makes a page eligible for rich results.
