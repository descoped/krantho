# Production Data

krantho.com is one production instance on Vercel, with its Neon database and Blob store. The
development machine is separate: the examples and `krantho-site` run there on SQLite and local
media, and their data is temporary.

- **Infra secrets live outside this repository and outside the checkout**, in the operator's own
  infra stack (mode 600 files beside it): `VERCEL_API_TOKEN`, the pooled database URL and the Blob
  token. They are what the Vercel CLI and the stack's wrapper use, and tofu keeps more of them in
  its state. The root `.env` is for development, loaded by the dev servers, so it holds none of
  them. Never read, print or copy those files, and never put their values in `.env`, a worktree, a
  shell file or a command line.
- **Dev servers use their own data.** Do not set `KRANTHO_PERSISTENCE_POSTGRES_URL` or
  `KRANTHO_MEDIA_VERCEL_BLOB_TOKEN` to the production values in `.env` or a shell.
- **`tofu apply` and `destroy` change the live site.** The stack's wrapper takes them with a saved plan
  (`plan -out=<file>`, read, then `apply <file>`) or a named resource (`-target=<resource>`). Read
  the plan before applying, and apply on the operator's instruction. A plan that replaces or deletes
  a resource, or touches the `site` variables, is shown to the operator first.
- **A database reset is the operator's act.** It follows the operator's deployment runbook,
  which is outside this repository, including its check of the project and branch and its backup
  branch. Never empty, restore or edit the production database on an agent's own initiative.
- **Preview is supported and not used.** Vercel's preview target stays in the infra; only
  production is deployed. A preview deployment of `krantho-site` would need its own database and
  Blob store, because it would otherwise read and write production.
- **An example can be purged** by deleting its `.krantho/content.db*` while its server is stopped.
