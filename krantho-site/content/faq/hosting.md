---
title: 'Where can I host a krantho site?'
topic: hosting
order: 9
docs-page: deploy-vercel
status: published
---

Wherever your framework runs on Node.js: on Vercel, in a container or on a virtual machine, with or without a CDN in front. Page caching works with Vercel, Amazon CloudFront and Google Cloud CDN, and none of them is preferred.

What changes with the host is configuration. On serverless hosts, use Postgres and a remote media store, since functions have no persistent disk. On a server with a persistent disk, SQLite and local media work. The API and Studio need a server. A site whose authors work in the repository can be built to static files instead, with no database, API or Studio, and published to GitHub Pages or any file host: see [Deploy to GitHub Pages](/docs/deploy-github-pages).
