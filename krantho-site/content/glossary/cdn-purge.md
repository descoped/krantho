---
title: CDN purge
definition: The request krantho sends to your CDN after a content change so that it drops the pages that change affected.
docs-page: deploy-cdn
status: published
---

`cache.cdn.provider` names the CDN — Vercel, CloudFront or Cloud CDN — and krantho purges by cache tag under the `cdn` strategy. Behind CloudFront or Cloud CDN with `next-isr`, it purges the whole site (`/*`) on every published change instead. A purge that fails is logged and never fails the write that caused it.
