---
title: 'Can editors preview a draft on the site before publishing?'
topic: studio
order: 10
docs-page: studio
status: published
---

Yes, when the site turns it on. The editor's Live mode shows the draft on its real page, and **Open on site** opens it in a tab. On Next.js this uses draft mode. On SvelteKit and Express it is a signed link, valid for ten minutes and for that page only; set `KRANTHO_JWT_SECRET` wherever editors preview, so the page can verify the link.

A preview reads the current version, draft included, and is never cached. Visitors keep seeing the published version until the editor publishes.
