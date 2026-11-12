---
title: 'Does krantho support content in several languages?'
topic: content
order: 13
docs-page: configuration
status: published
---

Yes. The site declares the locales it publishes and its default locale in its configuration. Each locale of a document is stored and published on its own, the API filters by locale, and page reads take a locale, falling back to the site's default when none is given. Studio has locale chips in the editor, and its Setup › Locales shows which documents are missing a language.

How locales appear in your URLs is up to your routes.
