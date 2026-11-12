---
title: 'How do editors sign in to Studio?'
topic: studio
order: 11
docs-page: configuration
status: published
---

With an access token, or through OIDC with any provider that supports it. Under OIDC you choose whether a first sign-in creates a user, which role new users get, and which email addresses become administrators. `/studio` can send a visitor without a session straight to the provider, and answer 404 when sign-in is refused.

Users have one of three roles: admin, editor or viewer. The default mode, `none`, treats every request as an administrator and is meant only for development on your own machine.
