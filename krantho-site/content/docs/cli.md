---
title: The krantho CLI
description: Krantho, the terminal client for a running krantho site — sign in, read and edit content, manage schemas and checkpoints, run the SEO pipeline, and start the dev server.
area: reference
order: 50
level: intermediate
stacks: [next, sveltekit, express]
prerequisites: [project-status]
related: [api, configuration, seo-pipeline, studio, content-fields]
status: published
---

`krantho` is a command-line client for a running krantho site. Every command that touches content goes through the site's [REST API](/docs/api) — your local dev server or a deployment — and never reads the database or the content files directly. What you can do from the terminal is exactly what the API allows your role to do.

Two commands are local instead: `krantho dev` and `krantho build` run your framework's own dev server and production build.

> [!NOTE]
> The CLI is not distributed as a binary yet. It is a Go program in the `cli/` directory of the krantho repository; you build it from a checkout.

## Build it from source

The CLI needs Go 1.26 or later. From the root of a krantho checkout:

```bash
cd cli
go build -o krantho ./cmd/krantho
./krantho --help
```

`go install ./cmd/krantho` builds it into your Go bin directory instead, so `krantho` is on your `PATH` when that directory is.

## Choose the site

The CLI talks to one API origin at a time. It takes the first of:

1. the `--api-url` flag,
2. the `KRANTHO_API_URL` environment variable,
3. `http://localhost:3000`.

A trailing `/` or `/api` is dropped, so `https://example.com/api` and `https://example.com` name the same site.

```bash
export KRANTHO_API_URL=https://example.com
krantho info
```

The commands that call the API also take `--json`. It prints the server's JSON response as it came, which is the form to use in scripts.

## Sign in

```bash
krantho auth login --token "$KRANTHO_API_TOKEN"
krantho auth status
krantho auth logout
```

`auth login` first asks the site which auth mode it uses:

- **none** — there is nothing to store, and the CLI says so.
- **token** — `--token` is the site's shared secret (`KRANTHO_API_TOKEN`). The CLI exchanges it for a session and stores the session, not the secret.
- **oidc** — `--token` is a session token you obtained by signing in to the site's Studio. The CLI stores it as given.

Sessions are stored per API origin in `~/.krantho/credentials.json`, readable only by you. When a stored session has expired, the CLI renews it once with its refresh token and retries; if that fails, it asks you to run `krantho auth login` again. `auth status` shows who you are signed in as and with which roles. `auth logout` removes the stored session for the current origin.

## Commands

### Project

| Command | What it does |
|---------|--------------|
| `krantho info` | Site identity, API origin, sign-in state and collections |

### Content

| Command | What it does |
|---------|--------------|
| `krantho content list <collection>` | List documents; `--status draft\|published`, `--locale en` |
| `krantho content get <collection> <slug>` | Show one document as frontmatter and body |
| `krantho content search <query>` | Search every collection; `--locale` |
| `krantho content create <collection> <slug>` | Create a document; `--field key=value` (repeatable), `--body <file>` (`-` reads stdin), `--locale` |
| `krantho content set <collection> <slug> <field> <value>` | Set one field, as a new version |
| `krantho content publish <collection> <slug>` | Publish the current version |
| `krantho content unpublish <collection> <slug>` | Take the document offline, back to draft |
| `krantho content delete <collection> <slug>` | Delete a document; asks first unless `--force` |
| `krantho content edit <collection> <slug>` | Edit a document in the terminal editor |

Field values from `--field` and `set` are sent as strings; the collection's schema on the server decides whether they are valid. `set` sends the version it read, so if someone saved the document in the meantime the server answers with a conflict instead of overwriting their change. `create` and `set` save; visitors see the change once you run `publish`.

```bash
krantho content create pages privacy --field title="Privacy" --field description="What krantho.com stores about its visitors." --body privacy.md
krantho content publish pages privacy
```

### The terminal editor

`krantho content edit` opens a full-screen editor with the document's fields on top, in the order of the collection's schema, and the Markdown body below. It works like a small vim:

| Key | Action |
|-----|--------|
| `Tab` | Switch between the fields and the body |
| `i`, `Esc` | Start and stop typing in the body |
| `h` `j` `k` `l` or arrows | Move in the body |
| `dd`, `yy`, `p`, `u` | Delete, copy and paste a line; undo |
| `:w` | Save |
| `:wq` | Save and quit |
| `:q`, `:q!` | Quit; `:q` refuses while there are unsaved changes, `:q!` discards them |
| `:preview` | Show the rendered body; `Esc` closes it |

A save asserts the version you loaded, like `set`, so a concurrent edit surfaces as a conflict on `:w`.

### Schema

| Command | What it does |
|---------|--------------|
| `krantho schema list` | Every collection with its field counts, from code and runtime |
| `krantho schema show <collection>` | A collection's fields and where each is defined |
| `krantho schema export <collection>` | The merged schema as Zod source |
| `krantho schema add-field <collection> <name> <type>` | Add or update a runtime field; `--description`, `--required`, `--values a,b,c` (enum only) |
| `krantho schema remove-field <collection> <name>` | Remove a runtime field; asks first unless `--force` |

The field types are `string`, `number`, `boolean`, `date`, `enum`, `url`, `email`, `textarea`, `color` and `reference`. A runtime field adds to a collection; a field defined in code cannot be changed from the CLI.

### Export and import

| Command | What it does |
|---------|--------------|
| `krantho export <collection>` | Print a collection as JSON; `--locale` |
| `krantho export <collection> --out <dir>` | Write one Markdown file per document |
| `krantho export --bundle <file>` | Export the whole site as one JSON bundle (`-` for stdout) |
| `krantho import <collection> <file>` | Import documents from a JSON export |
| `krantho import <collection> --dir <dir>` | Import exported portable Markdown files; identity supplies the slug and locale |
| `krantho import --bundle <file>` | Import a whole-site bundle |

### Production edits

| Command | What it does |
|---------|--------------|
| `krantho pull` | Write the edits editors made in production since its last content import as a commit on a new branch cut from the commit that import came from; `--content-dir`, `--branch`, `--base`, `--push`, `--dry-run`, `--token` |

`pull` reads `GET /api/changes` and writes published content only. A CI job passes its token as `KRANTHO_TOKEN`. Your working tree and current branch stay as they are. [Bring production edits back to git](/docs/content-round-trip) sets it up.

### Checkpoints

| Command | What it does |
|---------|--------------|
| `krantho snapshot create [name]` | Create a checkpoint of the content store |
| `krantho snapshot list` | List checkpoints, newest first |
| `krantho snapshot restore <version>` | Restore the content store to a checkpoint; asks first unless `--force` |
| `krantho snapshot delete <version>` | Delete a checkpoint; asks first unless `--force` |

### SEO

| Command | What it does |
|---------|--------------|
| `krantho seo status` | Which generated SEO files exist, with their size in entries, routes, URLs or bytes |
| `krantho seo generate` | Regenerate the SEO files the server can build |
| `krantho seo enrich <type>` | Start an AI enrichment job and follow it to the end |

`seo generate` writes `sitemap.xml` on the server. `structured-data.json`, `faq-pages.json` and `llms.txt` come from the build-time tools, and the result says so — see [The SEO pipeline](/docs/seo-pipeline).

`seo enrich` takes the kind of enrichment to run: `meta-descriptions` or `archetype`. The job runs on the server with the site's language model settings and needs the admin role. The CLI prints progress as items complete and a tally at the end, and exits with an error if the job fails or any item does. It stops watching after 30 minutes; the job itself keeps running on the server.

### Dev server and build

| Command | What it does |
|---------|--------------|
| `krantho dev` | Run the framework's dev server; `--port`, `--dir`, `--dry-run` |
| `krantho build` | Run the framework's production build; `--dir`, `--dry-run` |

Both look in the project directory (`--dir`, default `.`) for a framework config file:

| Config file | Framework | Dev | Build |
|-------------|-----------|-----|-------|
| `next.config.ts`, `.js` or `.mjs` | Next.js | `next dev` | `next build` |
| `@sveltejs/kit` in `package.json` | SvelteKit | `vite dev` | `vite build` |
| `vite.config.ts` or `.js` | Vite | `vite` | `vite build` |

The command runs through `pnpm exec` when the directory has a `pnpm-lock.yaml`, and through `npx` otherwise. `--dry-run` prints the command instead of running it:

```bash
krantho dev --port 4002 --dry-run
# pnpm exec next dev --port 4002
```

### Portable content transfers

Collection and bundle imports save drafts. JSON exports include identity, locale, the full contract, metadata, shared-default provenance and repository basis. Exported contract IDs and revisions must match the active definition.

Directory imports consume the JSON-valued portable frontmatter written by export, including document identity; they do not parse arbitrary multiline YAML. Export Markdown one locale at a time when slugs repeat, using `--locale en`. Conflicting filenames are rejected. Use JSON for nested slugs or all-locale transfers. Choose `--state current` (default) or `--state published` when exporting.
