# Enrichment with a language model

krantho can ask a language model to fill what is missing: `meta-description` values, and the
Schema.org properties a page's types call for that neither an editor nor a field supplies. It
never overwrites a value a person wrote unless forced. The client is `@krantho/ai`: no SDKs,
plain `fetch`, two wire formats.

## Providers

| `llm.provider` | Default model | Notes |
|---|---|---|
| `anthropic` (default) | `claude-haiku-4-5` | Anthropic Messages API; native structured output |
| `claude-code` | `claude-haiku-4-5-20251001`, pinned | Anthropic Messages API on a Claude subscription token; development only |
| `openai` | `gpt-4o` | OpenAI Chat Completions |
| `gemini` | `gemini-3.6-flash` | Google's OpenAI-compatible endpoint |
| `openrouter` | `anthropic/claude-haiku-4.5` | OpenRouter |
| `ollama` | `llama3.1` | a local Ollama at `http://localhost:11434`, no key |

Enrichment writes short strings, so a small, fast model is the default. Choose another with
`llm.model` / `KRANTHO_LLM_MODEL`; point at a proxy or self-hosted endpoint with
`KRANTHO_LLM_BASE_URL`.

## Credentials

| Provider | Credential | Variable (config leaf) | Order |
|---|---|---|---|
| `anthropic` | Provider API key | `KRANTHO_LLM_ANTHROPIC_API_KEY` (`llm.anthropic.apiKey`) | 1. the environment, 2. the key stored for it in Studio → Setup › AI provider |
| `openai` | Provider API key | `KRANTHO_LLM_OPENAI_API_KEY` (`llm.openai.apiKey`) | the same |
| `gemini` | Provider API key | `KRANTHO_LLM_GEMINI_API_KEY` (`llm.gemini.apiKey`) | the same |
| `openrouter` | Provider API key | `KRANTHO_LLM_OPENROUTER_API_KEY` (`llm.openrouter.apiKey`) | the same |
| `claude-code` | Claude subscription token, from `claude setup-token` | `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN` (`llm.claudeCode.authToken`) | the token only |
| `ollama` | none | | |

Every variable also accepts a `_FILE` suffix naming a file that holds the value. Every provider
has a credential of its own and never uses another's: `anthropic` ignores the OpenAI key and the
subscription token. krantho reads no other variable for a credential; `CLAUDE_CODE_OAUTH_TOKEN`
belongs to Claude Code, not to the site.

- **Development:** a developer with a Claude subscription can run enrichment on it by choosing the
  `claude-code` provider and setting `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN` on their own machine.
  Its model is pinned to Haiku: configuring another model is an error. The token is never stored
  in the database.
- **Deployments:** use the `anthropic` provider (or another) with that provider's API key
  (`KRANTHO_LLM_ANTHROPIC_API_KEY` for `anthropic`), set as a secret in the host's environment. The
  server refuses `claude-code` in production; a subscription token is not a deployment credential.
- Never put a key in `krantho.config.ts`, a committed `.env`, or a page.

The server seeds the provider, model and each provider's key into its stored settings once, on
the first boot where the code has an `llm` block or the environment chooses a provider with
`KRANTHO_LLM_PROVIDER` and supplies that provider's key. A key alone, for a provider nobody chose,
seeds no provider. Afterwards the stored settings win for provider and model (edit them in the
admin), while the credential is picked per request, so a rotated environment key applies on the
next restart. Studio shows which credential is active and where it came from, never its
value, and each provider shows its own key state. A key saved in Studio belongs to the provider
it was saved for; switching provider never carries it over.

The Studio assistant can use another provider than enrichment: set `assistant.provider`
(`KRANTHO_ASSISTANT_PROVIDER`) and, if wanted, `assistant.model`. It then runs on that provider's
own credential, and enrichment keeps the provider chosen in Setup › AI provider.

```ts
// krantho.config.ts — provider and model are data; the key stays in the environment
llm: { provider: 'anthropic', model: 'claude-haiku-4-5' },
```

## Running enrichment

- **Admin:** Structure → **Fill what's missing** (the whole site or one collection), Setup › AI
  provider → **Run across the site** (also **Meta only** and **Force regenerate**), or
  **Enrich this document** in the editor's Data mode; progress shows as items complete.
- **API:** start a background job, then poll it:

```bash
curl -sS -X POST -b .krantho-cookies -H 'Content-Type: application/json' \
  -d '{"type":"meta-descriptions","scope":"collection","collection":"posts"}' \
  "$SITE/api/seo/enrich"
curl -sS -b .krantho-cookies "$SITE/api/seo/enrich/status?jobId=<jobId>"
```

`type` is `meta-descriptions` or `archetype`; `scope` is `all`, `collection` (with
`collection`) or `item` (with `collection` and `slug`); `force: true` regenerates filled values (a
description already in the document's SEO configuration is kept).
Each item ends `complete`, `skipped` or `error` with a message.

- **krantho CLI** (Go, built from the repository's `cli/`): `krantho seo enrich meta-descriptions`
  starts the same job and follows it to the end.

What it writes:

- `meta-descriptions`: a `meta-description` between `seo.enrichment.meta.minChars` and
  `maxChars` (120–155 by default) on the document, saved as a new version, and missing
  `og-title` / `og-description`. It is also written to the document-scope SEO configuration
  when that holds no description yet.
- `archetype`: missing properties of the document's effective types, into its document-scope
  SEO configuration (`doc:<collection>/<slug>`), never replacing properties a person set.

Document-scope SEO configuration has no versions, and pages read it first, so the live page's
meta description and structured data change as soon as an item completes, without a publish.
Review generated text in Studio; it is a first draft of an editor's work, not a substitute
for it. With cached pages, each completed item refreshes the pages it affects.

## Build-time enrichment

The repository's build-time tools (`@krantho/tools`, not published) have their own enrichment
commands for the file-based pipeline — see `build-pipeline.md`. They use the same provider,
model and credential order (without the stored key), read from the project's
`krantho.config.ts` and the shell environment; they do not load `.env`.
