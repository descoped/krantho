---
title: next-isr
definition: The page cache strategy in which Next.js keeps each rendered page until a content change invalidates it.
docs-page: rendering-modes
status: published
---

Pages read content through krantho's loader, which tags every read. When an editor publishes, krantho revalidates the tags that change touched, and the pages that read what changed render again on their next request. `@krantho/server-next` is the one package that talks to Next.js's cache.
