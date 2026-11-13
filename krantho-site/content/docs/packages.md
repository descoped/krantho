---
title: Packages
description: Every krantho package on npm, what it is for, and which ones a site installs.
area: reference
order: 95
level: beginner
prerequisites: [installation]
related: [installation, package-server, package-studio]
status: published
---

Krantho is published to npm as one package per concern. They share one version and are released together, so a site keeps every `@krantho/*` package on the same version. Most sites install one bundle for their framework and the few packages their own code imports; [Installation](/docs/installation) shows the commands.

## Start here

| Package | What it is |
|---|---|
| [`create-krantho`](https://www.npmjs.com/package/create-krantho) | Scaffolds a new project: `npx create-krantho my-site` |
| [`@krantho/next`](https://www.npmjs.com/package/@krantho/next) | One install for Next.js: the server adapter, React UI, Studio, local media and SEO |
| [`@krantho/sveltekit`](https://www.npmjs.com/package/@krantho/sveltekit) | One install for SvelteKit: the server adapter, Svelte UI, Studio, local media and SEO |
| [`@krantho/node`](https://www.npmjs.com/package/@krantho/node) | One install for Express, Vite or Node: the server adapter, Studio, local media and SEO; pick a UI package separately |
| [`@krantho/static`](https://www.npmjs.com/package/@krantho/static) | A site built from its markdown to static files, for GitHub Pages or any file host. [Docs](/docs/package-static) |

## Server

| Package | What it is |
|---|---|
| [`@krantho/server`](https://www.npmjs.com/package/@krantho/server) | The runtime every adapter uses: persistence, the API, Studio and the in-process content loader. [Docs](/docs/package-server) |
| [`@krantho/server-next`](https://www.npmjs.com/package/@krantho/server-next) | The Next.js App Router adapter |
| [`@krantho/server-sveltekit`](https://www.npmjs.com/package/@krantho/server-sveltekit) | The SvelteKit adapter |
| [`@krantho/server-node`](https://www.npmjs.com/package/@krantho/server-node) | The Node.js, Express and Vite adapter |
| [`@krantho/api`](https://www.npmjs.com/package/@krantho/api) | The REST API handlers, with the OpenAPI specification. [Docs](/docs/api) |
| [`@krantho/studio`](https://www.npmjs.com/package/@krantho/studio) | Studio, prebuilt; the server serves it at `/studio`. [Docs](/docs/package-studio) |

## Content and configuration

| Package | What it is |
|---|---|
| [`@krantho/core`](https://www.npmjs.com/package/@krantho/core) | The content engine, with no UI framework dependencies. [Docs](/docs/package-core) |
| [`@krantho/schema`](https://www.npmjs.com/package/@krantho/schema) | Collections defined with Zod schemas. [Docs](/docs/package-schema) |
| [`@krantho/config`](https://www.npmjs.com/package/@krantho/config) | The typed configuration from `krantho.config.ts` and the environment. [Docs](/docs/configuration) |

## Persistence

| Package | What it is |
|---|---|
| [`@krantho/persistence`](https://www.npmjs.com/package/@krantho/persistence) | The persistence contract every store implements. [Docs](/docs/package-persistence) |
| [`@krantho/persistence-sqlite`](https://www.npmjs.com/package/@krantho/persistence-sqlite) | SQLite, the default |
| [`@krantho/persistence-postgres`](https://www.npmjs.com/package/@krantho/persistence-postgres) | Postgres, for production and serverless hosts |
| [`@krantho/persistence-fs`](https://www.npmjs.com/package/@krantho/persistence-fs) | Markdown files as the store, for prototypes and static sites |

## Media

| Package | What it is |
|---|---|
| [`@krantho/media-local`](https://www.npmjs.com/package/@krantho/media-local) | Local disk. [Docs](/docs/package-media-local) |
| [`@krantho/media-vercel-blob`](https://www.npmjs.com/package/@krantho/media-vercel-blob) | Vercel Blob. [Docs](/docs/package-media-vercel-blob) |
| [`@krantho/media-s3`](https://www.npmjs.com/package/@krantho/media-s3) | S3-compatible storage. [Docs](/docs/package-media-s3) |
| [`@krantho/media-gcs`](https://www.npmjs.com/package/@krantho/media-gcs) | Google Cloud Storage. [Docs](/docs/package-media-gcs) |

## Rendering

| Package | What it is |
|---|---|
| [`@krantho/ui-react`](https://www.npmjs.com/package/@krantho/ui-react) | React server components and hooks. [Docs](/docs/package-ui-react) |
| [`@krantho/ui-svelte`](https://www.npmjs.com/package/@krantho/ui-svelte) | Svelte 5 components |
| [`@krantho/ui-mui`](https://www.npmjs.com/package/@krantho/ui-mui) | Material UI components |
| [`@krantho/ui-tailwind`](https://www.npmjs.com/package/@krantho/ui-tailwind) | Tailwind CSS components |

## SEO and AI

| Package | What it is |
|---|---|
| [`@krantho/seo`](https://www.npmjs.com/package/@krantho/seo) | Schema.org structured data and the archetype catalog. [Docs](/docs/package-seo) |
| [`@krantho/seo-shared`](https://www.npmjs.com/package/@krantho/seo-shared) | SEO field discovery and shared types, with no dependencies |
| [`@krantho/ai`](https://www.npmjs.com/package/@krantho/ai) | The language model client for enrichment and the assistant. [Docs](/docs/package-ai) |
