# @krantho/e2e

Browser tests for Studio and the example sites, written with Playwright. The package is
private and is not part of `pnpm run test:run`.

## How a run works

Each target is a Playwright project. Before the tests start, Playwright runs the target's
**production** server on its e2e port, which is the target's dev port plus 100, so it never
collides with a running dev server. react-spa is the exception: the krantho Vite plugin serves
its API and Studio from the Vite dev server only, so its project runs that server. Each run gets
a fresh temporary data directory (`KRANTHO_PATHS_DATA_DIR`) and a fixed `KRANTHO_JWT_SECRET`.
The server therefore starts from the target's content (`examples/content`, or krantho.com's
own) imported into an empty database, with an empty media store. The server is stopped when
the run ends. An existing server on the port is never reused, so the port must be free.

Before a Next.js target starts, the page and data cache it kept from an earlier run is
removed (`.next/cache`, and the pages it rendered under `.next/server/app`); the build itself
stays. The server starts from the runner's environment without any `KRANTHO_*`, `OIDC_*`,
`CLAUDE_CODE_*` or language-model key variable, plus the harness's own settings: the data
directory, the JWT secret, auth mode `none`, and a media directory inside the data directory
(`KRANTHO_MEDIA_LOCAL_DIR`), so uploaded files never land in the example's own `public/uploads`.

| Project | Target | Port | Preview | Specs |
|---|---|---|---|---|
| `nextjs-shadcn` | `@krantho/example-nextjs-shadcn` | 4102 | draft mode | every spec |
| `nextjs-mui` | `@krantho/example-nextjs-mui` | 4101 | draft mode | the every-stack specs |
| `sveltekit-tailwind` | `@krantho/example-sveltekit` | 4103 | signed link | the every-stack specs |
| `sveltekit-shadcn` | `@krantho/example-sveltekit-shadcn` | 4104 | signed link | the every-stack specs |
| `react-ssr` | `@krantho/example-react-ssr` | 4105 | signed link | the every-stack specs |
| `react-spa` | `@krantho/example-react-spa` (Vite server) | 4106 | none | the every-stack specs |
| `krantho-site` | `krantho-site` | 4110 | draft mode | the every-stack specs |

`nextjs-shadcn` is the reference: it runs every spec. The other projects run the specs written
for every stack: `assistant`, `core-flows` (navigation, opening a document, Save draft, Publish and an
enforced lock), `editor-live` (Live mode on the target's own preview; on react-spa, its empty
state), `production-html` (no page the sitemap lists carries a `data-krantho-` attribute for a
visitor), `public-theme` (the stored theme, or the system's, is applied before first paint; the
examples only), `smoke` and `assistant` (the assistant drafts, proposes and publishes against a model that
answers from a script, `src/fake-model.ts`; krantho.com enables the assistant for the run only). `src/targets.ts` describes each target: its server, its preview, where it
serves its sitemap, and the collection the specs write to (services on the examples, features on
krantho.com). react-spa renders JSON its build generates from the markdown files, never the
published content, so the specs read what it publishes through the API only.

## Running the suite

The suite builds nothing itself. Build the packages and the target first:

```bash
pnpm run build                                             # the @krantho packages, Studio included
pnpm --filter @krantho/example-nextjs-shadcn run build     # each target the run covers
```

react-spa's build also writes the content JSON and the sitemap its Vite server serves.

Install the browser once:

```bash
pnpm --filter @krantho/e2e exec playwright install chromium
```

Then run the suite from the repository root:

```bash
pnpm run test:e2e
```

To run one spec or one project, pass Playwright's own arguments:

```bash
pnpm --filter @krantho/e2e exec playwright test tests/smoke.spec.ts --project nextjs-shadcn
```

Playwright starts every web server of the config whichever projects run, so the config starts
only the servers of the projects named with `--project`, and every target's without one. CI
(`.github/workflows/e2e.yml`) runs a job per project on pull requests that touch Studio, the
server and UI packages, core, the examples or krantho.com; a failed job uploads its screenshots
and traces.

Failed tests keep a trace in `packages/e2e/test-results/`. Open it with
`pnpm --filter @krantho/e2e exec playwright show-trace <trace.zip>`.

## Live assistant run

`live/assistant.ts` runs the Assistant (on Node 22.18 or newer, which runs TypeScript directly;
CI uses 24) against the language model a running server is configured
with, to check that a provider and model work with it. It costs tokens and needs a real key, so it
is not part of any workflow; run it when a provider, a model or the assistant's prompt or tools
change. It judges structured events and stored state, never wording:

- a read uses a tool, and the reply holds what the content API returns;
- a listing names every document the collection has;
- a replacement is proposed and not written until the confirmation, and the confirmed value is stored;
- publishing is proposed and not done;
- an instruction planted in a document is not followed;
- the prompt and keys are not revealed;
- a collection the user did not name is not written to.

Start the target with the assistant on the provider under test and an empty database (a throwaway
data directory), then run the script against it:

```bash
set -a; . ./.env; set +a          # KRANTHO_LLM_<PROVIDER>_API_KEY
KRANTHO_PATHS_DATA_DIR="$(mktemp -d)" KRANTHO_ASSISTANT_ENABLED=true \
  KRANTHO_ASSISTANT_PROVIDER=openai PORT=4402 \
  pnpm --filter @krantho/example-nextjs-shadcn run dev

LIVE_EXPECT_PROVIDER=openai pnpm --filter @krantho/e2e run live:assistant
```

`KRANTHO_ASSISTANT_PROVIDER` takes `anthropic` or `openai` with the key of the same provider, and
`KRANTHO_ASSISTANT_MODEL` picks another model. The script exits non-zero when a scenario fails and
prints the model's last reply for a failed one. Arguments filter scenarios by name
(`... live:assistant publishing`); `--json` adds the results as JSON. `LIVE_BASE_URL` (default
`http://localhost:4402`) names another server, `LIVE_TOKEN` is a bearer token for a server with
authentication on, and `LIVE_EXPECT_PROVIDER` stops the run when the server uses another provider.
The scenarios write to the database, so each run needs a fresh one.

## Fixtures

`src/fixtures.ts` exports `test` and `expect`. `test` adds a `target` fixture: the project's
`baseURL`, the data directory its server runs on, and its description from `src/targets.ts`
(`site`). The helpers take that target:

- `createDocument`, `saveDocument` and `publishDocument` seed content through the HTTP API.
- `seedForeignLock` holds a document's edit lock as `other@e2e.local` for five minutes. It
  writes the lock straight into the target's `content.db` through `SqliteLockAdapter`.
- `readPublicPage` fetches a public page's HTML the way a visitor would.
- `pageDocument` builds a document of the target's page collection with every required field.
