---
title: Locale
definition: The language of a document, such as en or nb, stored in its metadata and used to filter content.
docs-page: configuration
status: published
---

The site names its locales in `site.supportedLocales` and its default in `site.defaultLocale`. Each document carries a `locale`, which defaults to `en`, and the API takes a `locale` parameter to read one language. With more than one locale, Studio shows translation coverage.
