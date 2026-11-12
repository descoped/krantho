---
title: 'Where can I host a krantho site?'
topic: hosting
order: 9
docs-page: deploy-vercel
status: published
---

Wherever your framework runs on Node.js: on Vercel, in a container or on a virtual machine, with or without a CDN in front. Page caching works with Vercel, Amazon CloudFront and Google Cloud CDN, and none of them is preferred.

What changes with the host is configuration. On serverless hosts, use Postgres and a remote media store, since functions have no persistent disk. On a server with a persistent disk, SQLite and local media work. A site that must be purely static files does not fit: the API and Studio need a server.
