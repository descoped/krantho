# Studio assistant

A chat panel in Studio that performs content, SEO and AEO work through krantho's own API, on
the LLM provider the site configures, with the signed-in user's permissions. It is opt-in and off
by default: with it off, nothing about it appears in Studio, the API or the OpenAPI spec.

A signed-in user opens the panel from the navigation on any Studio screen, asks for something ("draft
a page about our opening hours", "shorten the description of pages/about", "check the SEO of
pages/pricing"), and sees the answer stream in. Every action the assistant takes is listed under
the reply with a link to the document it touched. What it writes is saved, never published; publishing,
deleting, replacing text someone wrote, and changes to more than one document are only proposed,
and happen when the user confirms them in the chat.

## Enabling

```bash
KRANTHO_ASSISTANT_ENABLED=true
```

or in `krantho.config.ts`:

```ts
export default defineKranthoConfig({
  assistant: { enabled: true },
})
```

It needs:

- **SQLite or Postgres persistence.** The assistant relies on the stored LLM settings and on
  version history; configuration validation rejects `assistant.enabled` with
  `persistence.provider: 'filesystem'`.
- **An LLM** — the provider chosen in Setup › AI provider, or the one `assistant.provider`
  names, with a model and, for hosted providers, that provider's own credential (see
  [Credentials](#credentials)). Without one the panel says so and links admins to the settings
  page.
- **Sign-in in production.** With `auth.mode: 'none'` every visitor is an admin and could drive
  the model on the site's credential; the server logs a production warning when the assistant is
  enabled that way.
- **A stable `KRANTHO_JWT_SECRET`** on every instance. Proposals are signed with `auth.jwtSecret`;
  with the ephemeral secret the API generates when none is configured, a proposal made on one
  instance (or before a restart) cannot be confirmed on another.

### Configuration

The `assistant` section of the configuration tree. Every leaf has a mechanical environment name;
the full reference is in [configuration.md](configuration.md#studio-assistant).

| Leaf | Default | Meaning |
|---|---|---|
| `assistant.enabled` | `false` | Registers the routes, reports `features.assistant` and shows the Studio panel |
| `assistant.provider` | unset | Provider for the assistant, one of `anthropic`, `claude-code`, `openai`, `gemini`, `openrouter` or `ollama`; unset uses the provider in Setup › AI provider |
| `assistant.model` | unset | Model for the assistant; unset uses the model in Setup › AI provider, or the provider's default model when `assistant.provider` is set |
| `assistant.role` | `editor` | The lowest role that may use the assistant |
| `assistant.confirmTtlSec` | `600` | How long a proposal can be confirmed, in seconds (at most 3600) |
| `assistant.limits.maxTurns` | `8` | Model calls in one chat request |
| `assistant.limits.maxToolCalls` | `16` | Tool executions in one chat request |
| `assistant.limits.maxTokens` | `16000` | Output token cap for each model call |
| `assistant.limits.maxRequestTokens` | `200000` | Input plus output tokens across all model calls of one chat request |
| `assistant.limits.maxHistoryMessages` | `40` | Conversation messages accepted from Studio |
| `assistant.limits.maxInputChars` | `60000` | Characters accepted from Studio across the conversation |
| `assistant.limits.toolResultChars` | `12000` | Characters of one tool result sent to the model |

`assistant.provider` and `assistant.model` are how a site gives the assistant a different
provider or model from the one SEO enrichment uses: the stored provider and model are
enrichment's, and enrichment writes short SEO strings, so they are usually a small model.
An unknown `assistant.provider` is a startup error naming the providers it could be.

## Who can use it

The assistant acts as the signed-in user and never holds more permission than that user. There
is no service identity: every tool runs with the request's own authenticated context, and every
write goes through the same role checks as the REST handler (or Studio screen) that does the same
thing.

- **`assistant.role`** decides who may open a conversation. The default, `editor`, lets editors and admins
  use it: a viewer cannot write, so the assistant would give them little, and every account that
  can open it can spend the site's LLM credential. It is also the one control over who does:
  a site where read-only reviewers should ask questions lowers it to `viewer`, and one that wants
  fewer users raises it to `admin`.
- **Tools follow the user's role.** A tool above the user's role is not offered to the model, and
  the role is checked again when it runs and again when a proposal is confirmed.
- **An anonymous reader** of a site with sign-in (token or OIDC auth, reads allowed without a
  session) gets 401 and sees no launcher.
- **The role counts as the access token carries it**, as for every REST handler: a demotion takes
  effect when the user's token is refreshed, and a proposal made before it is refused on confirm
  once it has.

## What it can do

Tools run on the server, each mapped to an existing krantho operation. The model sees only the
tools the user's role and the deployment allow.

| Tool | Role | What it does |
|---|---|---|
| `list_collections` | viewer | Lists the collections and their field names |
| `get_schema` | viewer | Reads a collection's fields and their rules |
| `list_documents` | viewer | Lists a page of a collection's documents (`limit` up to 50, `offset`), optionally by status and locale, and reports `hasMore` |
| `search_documents` | viewer | Searches all collections in one query (`limit` up to 20), with a snippet around the match, and reports `hasMore` |
| `get_document` | viewer | Reads one document: fields, body, section headings, version |
| `seo_validate` | viewer | Checks title, meta description and rich-result eligibility; the model explains the findings |
| `create_draft` | editor | Creates a new document as a draft |
| `update_draft` | editor | Changes fields, the whole body, or named `## ` sections, as a new draft version |
| `answer_summary` | editor | Writes an answer-ready summary into the collection's `answer-summary`, `tldr` or `summary` field |
| `faq_from_document` | editor | Proposes FAQ entries from a document as drafts in a collection the user names |
| `publish_documents` | editor | Proposes publishing documents, showing what goes live |
| `seo_fill_meta_description` | admin | Generates a missing meta description with SEO enrichment |
| `seo_fill_archetype_properties` | admin | Proposes the unset Schema.org properties of a document with SEO enrichment |
| `regenerate_llms_txt` | admin | Proposes a new `llms.txt` with the model's summary and link descriptions |
| `delete_documents` | admin | Proposes deleting documents; a document others reference is left out and reported |

How the tasks map:

- **Content.** Find (`search_documents`, `list_documents`); draft from a brief (`get_schema`,
  `create_draft`); rewrite or shorten fields and sections (`get_document`, `update_draft`, shown
  as a diff first); fill empty fields (`update_draft`, written at once); summarise (the model's
  own answer after reading — there is no summarise tool).
- **SEO.** Meta descriptions and Schema.org properties through the existing enrichment, on
  request only (never by the assistant on its own); `seo_validate` for checks, explained in plain
  language. The meta tool never replaces an existing description — rewriting one is an
  `update_draft`, shown as a diff — and writes only the description field.
- **AEO.** An answer-ready summary (40–60 words, standalone, answering the page's main question);
  FAQ entries into a collection the user picks (the model asks when none is named); a new
  `llms.txt`.

When the target cannot take the result, the assistant shows it instead of writing it: a
collection with no summary field gets the summary as a copyable block with a hint to add an
`answer-summary` field in the schema editor; a FAQ collection whose schema has no `question`
string field, or requires fields the entries do not have, gets the entries as a list with the
reason.

A tool is available only where the deployment can run it: write tools need an adapter that
writes, reads single documents and keeps version history; the Schema.org tool needs the SEO
configuration store (and `@krantho/seo` installed to generate anything); `regenerate_llms_txt`
needs site settings and live-content reads.

## Drafts, proposals and confirmation

### Drafts

Everything the assistant writes is a save (`saveDocument`): a new version in the document's
history, recorded as `<role>:<email> via assistant`. A save never changes what visitors see — over
a published document it leaves the live version in place, and the document keeps its publication
state, with the new version as unpublished changes ahead of live. Only publishing, which is always
a proposal, makes it live. The assistant always writes the full document.

### The write policy

Per chat request, **one** document may be written immediately, and only when the write creates it
or fills values that were empty. A document created in the same request may be written again.
Everything else becomes a **proposal**:

- replacing or removing a non-empty value or body text;
- a second document in the same request;
- publishing and deleting;
- Schema.org properties (saved as versioned document draft metadata);
- `llms.txt`.

A proposal writes nothing. Studio shows a card with what confirming does, the documents, the
difference (fields word by word, the body line by line, status transitions), when it expires, and
Confirm and Cancel buttons; several proposals in one reply get a **Confirm all**. The model is
told a proposal waits for the user and must not report it as done.

`update_draft` requires the version the model read (`basedOnVersion`) and fails when the document
has moved on. A document another user is editing (a live advisory lock held by someone else) is
not written, and the message names nobody — Studio sends its conversation back to the model,
so what the user reads reaches the provider too. Opening the document in the editor shows who
holds the lock.

### Confirming

`POST /api/assistant/confirm` executes a proposal. The proposal travels as a signed token: an
HMAC-SHA256 over the action, keyed by `auth.jwtSecret`, bound to the user who asked, expiring
after `assistant.confirmTtlSec`, and bound to the state it was computed against — each document's
version and a hash of its status, fields and body, the Schema.org properties that must still be
unset, the `llms.txt` snapshot. Nothing is stored on the server, so confirmation works across
serverless instances.

On confirm the server verifies the token, checks the role for the kind of action again, and
compares every target with the state in the token before writing anything:

| Answer | When |
|---|---|
| 200 `{ ok, results }` | Executed; each document's result is listed |
| 400 | Missing, malformed, tampered or foreign token |
| 403 | Another user's proposal, or the user's role no longer allows it |
| 409 `Changed since the proposal` | A target changed — including a replay of a proposal already executed |
| 410 | The proposal expired; ask again |
| 423 | Another user holds the advisory lock on a target |

Executing several documents is not a transaction (the adapters offer none); the preflight makes a
partial failure unlikely, and each result is reported. Publish and delete are addressed by
collection, slug **and locale**, so they act on exactly the document the user saw.

Cancel needs no server call: an unconfirmed proposal expires. Studio tells the model on the
next message what was confirmed, refused or cancelled.

## What it will not do

- It has no tools for users, roles, settings, credentials, media, schemas, code or deployments,
  and no tool that fetches URLs, sends mail or reaches outside the site.
- It does not unpublish, archive or restore versions.
- It never emulates tool calls through prompt text: a model without tool use is reported, not
  worked around.
- It keeps no conversation: the history lives in Studio, text only, and is gone on reload. Tool
  calls and tool results exist only inside one request on the server and are never accepted from
  the client.

## What goes to the provider

- The system prompt: the site's name, base URL, language and locales, the collections and their
  field names, the user's **role** (never their name or e-mail), today's date, and the document
  the user is looking at.
- The conversation text the user and the assistant wrote.
- Document text the assistant reads through its tools: fields, bodies, titles, snippets, section
  headings.

Never sent: user names and e-mail addresses (tool results carry no `changedBy`, a lock refusal
says "another user"), credentials, settings, and proposal tokens.

## Prompt injection

Documents are written by people, and a document can contain text addressed to the model.

- Every document-derived string reaches the model inside an `<untrusted-content>` frame whose tag
  carries a random nonce fresh for each request, so a document cannot close its own frame; any
  `untrusted-content` inside document text is rewritten. The system prompt says framed text is
  data and only the user's messages are instructions.
- The write policy bounds what an injected instruction can achieve: at most one draft per request
  that creates a document or fills empty values — never live, restorable from history, and listed
  with its link — or a proposal the user must confirm after seeing the exact change.
- Studio renders the assistant's text without images and with links restricted to `http`,
  `https` and relative URLs, so rendered markdown cannot exfiltrate data by loading a URL.

Residual risks:

- A value the assistant fills into an empty field of a published document is saved as a new
  version ahead of live, and goes live when someone later publishes that document.
- A link the model writes into its answer is clickable (sanitized, never loaded automatically).

## Credentials

Without `assistant.provider` the assistant resolves its provider exactly as SEO enrichment
does: the provider the site uses (the one chosen in Setup › AI provider while it is on,
else the first provider that has a key), with that provider's model and base URL and its
credential picked on every request. With `assistant.provider` set, the assistant uses that
provider and that provider's own credential, and its model is `assistant.model` or else
the model chosen for that provider, or its default. Enrichment is unaffected.

A user can pick another provider that is on at the top of the assistant's dialog. The
request then carries `provider`, which must be on (else 503, "That AI is not set up"); it
runs that provider's own model and base URL, never `assistant.model`, which belongs to the
provider the site's settings gave the assistant. `GET /api/assistant` lists the providers
that are on, by plain name, as `providers`. Switching the provider in Setup never hands a
key to another provider.

Every provider has a credential of its own: an API key from `KRANTHO_LLM_<PROVIDER>_API_KEY`
(`KRANTHO_LLM_ANTHROPIC_API_KEY`, `KRANTHO_LLM_OPENAI_API_KEY`, `KRANTHO_LLM_GEMINI_API_KEY`,
`KRANTHO_LLM_OPENROUTER_API_KEY`), else the key stored in the settings for that provider.
The `claude-code` provider uses the Claude subscription token
(`KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN`) only, for development on your own machine, with its
pinned Haiku model; Ollama needs none. Deployments use a provider with an API key:
`claude-code` is refused in production. `assistant.model` replaces only the model, and for
`claude-code` any model but the pinned one is an error. The details are in
[ai.md](ai.md#credentials). `GET /api/assistant` reports the provider in use and the kind of
credential, never its value.

## Providers and tool use

The assistant works with every `@krantho/ai` provider whose model supports tool use:
`anthropic`, `claude-code`, `openai`, `gemini`, `openrouter` (per upstream model) and `ollama` (per model).
Provider state that must travel back with a tool call — Anthropic thinking blocks, Gemini thought
signatures, OpenRouter reasoning details — is replayed unchanged within the request (see
[ai.md](ai.md#chat-with-tools-and-streaming)).

A model without tool use is detected from the provider's answer to the first request that carries
tools, and reported in the chat as:

> The model `<model>` on `<provider>` does not support tool use, which the assistant needs. Choose
> a model that does in Setup › AI provider, or set assistant.model.

A model that accepts tools but never calls them is not detected; it answers without acting.

**Coverage.** Every provider's wire format — streaming, tool calls, provider-state replay and
the tools-unsupported answers — is covered by recorded fixtures in `@krantho/ai`'s tests. The
Anthropic path has been run live, through the `claude-code` provider with Haiku in Studio: reading,
drafting, replacing text with confirmation, SEO checks and publishing. OpenAI has been run live
through `assistant.provider` with its own key, with the live run in `packages/e2e/live`, which
judges structured events and stored state and not wording. `gpt-4o` passes it: a read uses a tool,
a listing is complete, a replacement is proposed and saved only when confirmed, publishing is
proposed and not done, an instruction planted in a document is not followed, the prompt and keys are
not revealed, and a write to a collection the user did not name is not made. The smaller
`gpt-4o-mini` passes all but publishing: it read a listing, said the page was already published and
proposed nothing. The `anthropic` provider with an API key and `claude-haiku-4-5` does the same: it
passes all but publishing, where it read the page, saw it published and asked whether to publish
anyway instead of proposing it. Models differ in how they take a request for a page that looks
published, so run the same script against your own model before you rely on it. The newer OpenAI
families pass it through the model profiles in `docs/ai.md#model-profiles`: `gpt-5.5`, `gpt-6-sol`
and `gpt-6-luna` pass every scenario, and `gpt-5-mini` passes all but publishing, as the other
small models do. `gpt-6-astra` and `gpt-6.1-sol` take function tools through OpenAI's Responses API
only, so on Chat Completions they work for enrichment and not for the assistant, which answers
that the model does not support tool use. Gemini, OpenRouter and Ollama have not been exercised against
their live APIs. They run through the whole chat route against mock models that answer in the
shape each vendor documents and refuse what it is documented, or widely reported, to refuse
(`packages/api/test/assistant/vendor-mock.ts`): Gemini's thought signatures and its rejection of
an object parameter without properties, OpenRouter's keep-alive comments, tools in every request
and `reasoning_details`, and Ollama's ignoring of `tool_choice`. Those mocks follow the vendors'
documentation, not a live run; report a provider that answers differently as a bug.

## Limits and costs

One chat request makes at most `limits.maxTurns` model calls, each capped at `limits.maxTokens`
output tokens, and stops once input plus output across its calls reaches
`limits.maxRequestTokens` — the chat turns and the model calls the SEO tools make themselves (a
provider that reports no usage is counted at about four characters a token). At `limits.maxToolCalls`, and on the last allowed turn, the model is told to answer
without tools; one that keeps calling them is stopped with "The assistant stopped after N steps.
Ask again to continue." Tool results are cut to `limits.toolResultChars` by truncating the text
inside them and saying so — a body the model saw only in part cannot be replaced whole, only by
section.

Studio resends the conversation with every message, trimmed to `limits.maxHistoryMessages`
messages and `limits.maxInputChars` characters, so a long conversation costs more per message.

**Nothing bounds the number of requests a user sends.** `assistant.role` is the spend control
across users.

## `llms.txt`

`GET /api/seo/llms.txt` serves the site's `llms.txt` whether or not the assistant is enabled: the
snapshot saved in site settings (`seo.llmsTxt`) when there is one, else one generated from the
live documents — the site name, the site SEO configuration's description as the summary, then a
section per collection (except `globals`) listing each live, indexable document with its URL and
description. The assistant's `regenerate_llms_txt` proposes a snapshot with the model's summary
and link descriptions; an admin confirms it.

A site serves it at `/llms.txt` by routing that path to the API route, as it does for the
sitemap and `robots.txt`. The build-time `seo:generate` file (see [tools.md](tools.md)) is
separate and unchanged.

## Streaming per host

`POST /api/assistant/chat` answers `text/event-stream`. The handler returns a `ReadableStream`
body; `toResponse` in `@krantho/server` passes it through unread.

| Host | What it needs |
|---|---|
| Next.js (`@krantho/server-next`) | Nothing: the route handler returns the streamed `Response` |
| SvelteKit (`@krantho/server-sveltekit`) | Nothing: the `Response` is passed through |
| Node / Express (`@krantho/server-node`) | Write API responses with `writeWebResponse(res, response)`, which pipes the body chunk by chunk; the standalone server and the Vite plugin already do (see [server-node.md](server-node.md#writewebresponseres-serverresponse-response-response-promisevoid)) |

- **Proxies must not buffer `text/event-stream`.** The response carries
  `cache-control: no-cache, no-transform` and `x-accel-buffering: no`, and a `: ping` comment
  every 15 seconds keeps an idle stream open.
- **The host's function duration bounds a chat request** on serverless platforms (on Vercel, the
  function's maximum duration). A request that runs into it is cut off; raise the route's limit or
  lower `limits.maxTurns`.
- **A client that goes away stops the work**: cancelling the stream aborts the loop at its next
  step, and Studio's Stop button does exactly that.
- Draft writes made while the stream runs are not live and invalidate no cached page. Publish and
  delete run in the confirm request, a plain JSON request, so page refresh and CDN purge behave as
  for the REST publish.

## Protocol for custom clients

Studio is one client; anything holding a session (the access cookie or
`Authorization: Bearer`) for a user at or above `assistant.role` can be another. `POST` bodies
must be `content-type: application/json` (415 otherwise).

| Method | Path | Answer |
|---|---|---|
| GET | `/api/assistant` | `{ configured: true, provider, model, credential, tools: [{ name, label }], limits, confirmTtlSec }`, or `{ configured: false, error }` |
| POST | `/api/assistant/chat` | `text/event-stream`, or a JSON error before the stream starts |
| POST | `/api/assistant/confirm` | `{ ok, results: [{ collection?, slug?, status, message, version? }] }` |

The chat request:

```ts
interface AssistantChatRequest {
  /** The conversation so far, oldest first, ending with the user's new message */
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  /** The Studio screen the user is on */
  context?: { collection: string; slug?: string; locale?: string }
}
```

The conversation must start and end with a user message (400); longer than the history limits it
is 413. Errors before the stream: 401/403 (access), 503 `{ code: 'llm_unconfigured' }` (no
provider configured) and 503 `{ code: 'llm_credential_missing' }` (no credential for a hosted
provider).

Each event is `event: <type>` and `data: <JSON>`, where the JSON is the whole event. Per request:
any number of `text`, `tool` → `activity` pairs and `usage`, then at most one `error`, then exactly
one `done`. The types are exported from `@krantho/api` (`AssistantEvent`, `AssistantActivity`,
`DocumentChange`, `PendingActionView`, …); the event list is in
[api.md](api.md#assistant-routes-registerassistantroutes). A client parses the stream with `parseServerSentEvents` from
`@krantho/ai`, and confirms a proposal by posting its `pending.token` to
`/api/assistant/confirm`.
