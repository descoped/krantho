---
title: 'About krantho'
description: 'Krantho is a CMS library built by Descoped AS for developers who build content sites in their own codebase. Why it exists and where it stands.'
eyebrow: 'About'
status: published
---

Krantho is built by Descoped AS. It is a CMS library: it adds content management, an admin and structured SEO to a site you build yourself, in the framework you already use, on the host and database you already have.

## Why it exists

Most content sites are built by developers and written by other people. The developer wants the content model in code, reviewed and typed like the rest of the site. The editors want a calm place to write, preview and publish without a deploy. The business wants to choose its own host and keep its content in its own database.

A hosted CMS answers the editors and asks the rest to give way. Markdown in a repository answers the developer and leaves the editors out. Krantho starts from the other end: the CMS is a set of packages inside the site's own app, and Studio, the API and the database come with it.

## How it is built

A few decisions shape everything else:

- **A library, not a service.** Krantho runs in your app's process and serves `/api` and `/studio` from your routes. There is no krantho server to sign up for.
- **Providers side by side.** Databases, media stores, CDNs and LLM providers are alternatives, chosen by configuration rather than by code. A default gets a new project running; it is a starting point, not a recommendation.
- **Content first, layout in code.** Content is fields and a markdown body. How it looks is written in your components.
- **Honest about limits.** Each feature page says what krantho does not do yet.

## Where it stands

Krantho's code is open on GitHub, under the MIT licence. Its packages are not yet published to npm. [The project status page](/docs/project-status) explains what that means and how to run krantho from source today.

## This site

krantho.com runs on krantho. Every page you read here is a document in its Studio, rendered by a page template in a Next.js app, and cached until an editor changes it. The note at the end of each page shows which template and documents made it.
