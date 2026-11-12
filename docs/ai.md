# @krantho/ai

Zero-dependency LLM client for krantho. Provides a provider-agnostic adapter interface over multiple LLM providers using only the platform `fetch()` API — no SDKs, no transitive dependencies. Two surfaces: single-shot completions (`LLMAdapter`) and streaming, tool-using chat (`ChatAdapter`).

## Context

krantho uses LLM completions for SEO enrichment (generating meta descriptions, Schema.org properties) and content analysis, and a streaming chat with tool calls for the [Studio assistant](assistant.md). Rather than coupling to a specific provider SDK, `@krantho/ai` abstracts over the two dominant wire formats — Anthropic Messages and OpenAI Chat Completions — behind the `LLMAdapter` and `ChatAdapter` interfaces. This keeps the dependency tree clean and lets site operators choose their provider.

## Rationale

- **Zero dependencies.** The package has no runtime dependencies at all. Both wire formats are simple enough to implement with `fetch()` and JSON parsing. Adding an SDK would bring transitive dependencies into every krantho installation.
- **Two wire formats cover all providers.** Anthropic uses its own Messages API. OpenAI, Gemini, OpenRouter, and Ollama all speak the OpenAI Chat Completions format. Two adapter classes cover the entire provider landscape.
- **Separate package.** Used by `@krantho/api` (runtime enrichment and the assistant), `@krantho/tools` (CLI pipelines) and `@krantho/studio` (the SSE parser). Keeping it separate avoids pulling API/server code into CLI tools and vice versa.
- **Completions stay single-shot; chat streams.** Enrichment asks for short results (a paragraph of text, a JSON object), where streaming adds complexity with no benefit, so `LLMAdapter.complete()` returns one result. The assistant is a conversation the user watches, with tool calls between model turns, so `ChatAdapter.stream()` yields events as the provider sends them.
- **Tool calls are never emulated.** A model without tool use is reported as the error code `tools_unsupported`, from the provider's own answer; nothing falls back to describing tools in the prompt.
- **Browser-safe.** No Node imports: `fetch`, `ReadableStream`, `TextDecoder` and `AbortSignal` only, so Studio reuses the SSE parser.

## Architecture

```
create-adapter.ts       createLLMAdapter() — factory, selects wire format from provider
create-chat-adapter.ts  createChatAdapter() — the same for streaming chat
      |
providers.ts            PROVIDER_PRESETS — base URL, default model, chat path, output-cap field per provider; CLAUDE_CODE_MODEL
      |
anthropic-format.ts     AnthropicFormatAdapter — Anthropic Messages API via fetch()
openai-format.ts        OpenAIFormatAdapter — OpenAI Chat Completions via fetch()
provider-config.ts      resolveProvider() — preset, model and credentials for a configuration; enforces the claude-code rules (internal)
anthropic-headers.ts    anthropicHeaders() — API key or OAuth headers, shared by both Anthropic adapters
      |
anthropic-chat.ts       AnthropicChatAdapter — streamed Messages API turns with tools and thinking replay
openai-chat.ts          OpenAIChatAdapter — streamed Chat Completions turns with tools and provider replay
chat-transport.ts       streamChatTurn() — the POST, HTTP errors and abort, shared by both (internal)
chat-errors.ts          isToolsUnsupportedMessage() and the HTTP/exception → ChatErrorCode mapping
sse.ts                  parseServerSentEvents() — WHATWG event-stream parser
      |
structured.ts           structuredComplete() — native structured output, prompt-embedded schema fallback
      |
types.ts                Provider, WireFormat, LLMConfig, LLMOptions, CompletionResult, LLMAdapter
chat-types.ts           ChatAdapter, ChatRequest, ChatMessage, ChatTool, ToolCall, ChatEvent, …
```

## Where the configuration comes from

Inside a krantho site the provider, model, base URL and each provider's credential
are leaves of the configuration tree (`llm.*` in [configuration.md](configuration.md)),
not values a call site invents. The deployment home of a key is the variable of its
own provider, such as `KRANTHO_LLM_ANTHROPIC_API_KEY`, or the same name with `_FILE`
naming a file to read it from; `krantho.config.ts` may set the provider and model.
Build-time tools and runtime enrichment resolve the same tree, so a site runs one
provider for enrichment, each with a key of its own.

Runtime enrichment and the [Studio assistant](assistant.md) use the providers that are
**on**: a provider is on when it has a key, whether the key is in the environment, in the
app's code or saved in Setup › AI provider, so setting a provider's variable is all it
takes to turn it on. The site uses one of them: the provider chosen in Setup › AI provider
(`llm.provider`) while it is on, otherwise the first one that is on, in the order
`anthropic`, `openai`, `gemini`, `openrouter`. `claude-code` and `ollama` are never picked
for a site: they are for a developer, who chooses them. The model and base URL are kept
per provider (`llm.model.<provider>`, `llm.baseUrl.<provider>`), so choosing another
provider never carries them over; empty uses the provider's own.

The server seeds the chosen provider, its model and its base URL once, on the first boot
where the code passes an `llm` block, or the environment chooses a provider
(`KRANTHO_LLM_PROVIDER`) and supplies that provider's key; after that the stored settings
win. A key that is the only thing set seeds nothing, and needs to: the provider is on
because it has a key. The credential is picked on every request, so changing the
environment takes effect on the next restart without touching the stored settings.

The assistant may use another provider than enrichment: `assistant.provider` names it,
and the assistant then runs on that provider's own credential and model
(`assistant.model`, else the provider's default). Enrichment is unaffected. In the
assistant's dialog a user picks among the providers that are on, by their plain names
(Claude, ChatGPT, Gemini); the pick is sent with each message and refused when that
provider has no key.

### Credentials

Every provider has a credential of its own, and a provider never uses another's.

| Provider | Credential | Variable (leaf) | Order |
|---|---|---|---|
| `anthropic` | Console API key | `KRANTHO_LLM_ANTHROPIC_API_KEY` (`llm.anthropic.apiKey`) | 1. the configuration (the environment, or the app's code), 2. the key stored for it in Setup › AI provider |
| `openai` | API key | `KRANTHO_LLM_OPENAI_API_KEY` (`llm.openai.apiKey`) | the same |
| `gemini` | API key | `KRANTHO_LLM_GEMINI_API_KEY` (`llm.gemini.apiKey`) | the same |
| `openrouter` | API key | `KRANTHO_LLM_OPENROUTER_API_KEY` (`llm.openrouter.apiKey`) | the same |
| `claude-code` | Claude subscription token | `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN` (`llm.claudeCode.authToken`) | the token only |
| `ollama` | none | | |

Every variable accepts the `_FILE` suffix. Setup › AI provider stores a key for the
provider it is saved under and for that provider only: switching provider never
carries a key over, and each provider shows its own key state. The stored settings
keep one key per provider (`llm.apiKey.<provider>`). krantho reads no other variable
for a credential — not `KRANTHO_LLM_API_KEY`, and not `CLAUDE_CODE_OAUTH_TOKEN`,
which belongs to Claude Code and the repository's tooling.

The `claude-code` provider is **development only**. It runs on the Claude
subscription of the developer's own machine instead of a paid key, with the token
`claude setup-token` prints, sent as `Authorization: Bearer` with the
`anthropic-beta: oauth-2025-04-20` header. The token is never written to the
database. Its model is pinned to Haiku (`CLAUDE_CODE_MODEL`, exported from
`@krantho/ai`): configuring another model is an error, never a silent downgrade, and
that includes `assistant.model`. In production (`NODE_ENV=production`) the server
refuses the provider: resolving it fails and Setup › AI provider rejects saving it
with 400. Deployments use the `anthropic` provider with a Console API key
(`KRANTHO_LLM_ANTHROPIC_API_KEY`).

Setup › AI provider lists the providers that are on, with where each key comes from in
words a person uses — set up by the developer, or saved here — and the providers a key
turns on, never a value. `GET /api/settings/llm` reports the same. The build-time tools
follow the same rule, minus the stored key.

```typescript
import { createLLMAdapter } from '@krantho/ai'
import type { Provider } from '@krantho/ai'

// llm.provider is a plain string in the tree; check it against PROVIDER_PRESETS first.
// Each provider's key is its own leaf: llm.anthropic.apiKey, llm.openai.apiKey, …
const llm = createLLMAdapter({
  provider: config.llm.provider as Provider,
  apiKey: config.llm.openai.apiKey,
  ...(config.llm.model ? { model: config.llm.model } : {}),
  ...(config.llm.baseUrl ? { baseUrl: config.llm.baseUrl } : {}),
})
```

The examples below call the adapter directly, which is what a standalone script
outside a krantho handler does.

### Stored keys are sealed

A key pasted in Setup › AI provider is **sealed** before it reaches the database, and
only the running system can open it. The database holds ciphertext, so a dump or a
backup reveals nothing. The key to open it is never in the database: it comes from
the deployment, through the secret vault `secrets.provider` selects.

- **`local`** (the default) seals with AES-256-GCM under a subkey derived (HKDF) from
  `secrets.local.key` (`KRANTHO_SECRETS_LOCAL_KEY`, at least 32 characters), or from
  `auth.jwtSecret` (`KRANTHO_JWT_SECRET`) when that is unset, which then needs at least
  32 characters too. The setting name is bound to the sealed value, so a value copied to
  another setting does not open.
- **No key, no stored secrets.** A site with neither variable, or with a signing secret
  shorter than 32 characters, refuses a pasted key with a message that names them; set
  the provider's own variable instead.
- **Rotating the key** makes the stored keys unreadable. Without `secrets.local.key`
  the key is the signing secret, so rotating `KRANTHO_JWT_SECRET` does it too: set
  `secrets.local.key` to keep the two apart. Setup › AI provider then shows
  no key for that provider, and the key is entered again. A value that is not sealed by
  the current vault is never used.
- **Environment and code keys are never copied into the database.** On a platform that
  injects secrets (Vercel, Coolify, a cloud secret store), the injected variable is the
  only copy.
- **Not exported.** Stored secrets are not part of any import or export; they are set up
  by hand, with tofu, or with the cloud's own CLI.

A cloud key service (AWS KMS, Google Cloud KMS, Azure Key Vault) is one more vault: a
package that implements `ISecretVault` from `@krantho/persistence`, a name in
`secrets.provider`, and a case in `createSecretVault` in `@krantho/server`, loaded by
dynamic import like the media stores.

## Provider matrix

The app stack's LLM surface, as `PROVIDER_PRESETS` declares it. Completions are single-turn, plain `fetch`, no tools; chat is streamed, multi-turn and tool-using over the same endpoint.

| Provider | Wire format | Endpoint | Auth | Default model | Structured output |
|---|---|---|---|---|---|
| `anthropic` | Anthropic Messages | `api.anthropic.com/v1/messages` | `x-api-key` + `anthropic-version` | `claude-haiku-4-5` | native, schema enforced server-side |
| `claude-code` | Anthropic Messages | `api.anthropic.com/v1/messages` | `Authorization: Bearer` (subscription token) + `anthropic-version` + `anthropic-beta: oauth-2025-04-20`; never an API key | `claude-haiku-4-5-20251001`, pinned | native, schema enforced server-side |
| `openai` | OpenAI Chat Completions | `api.openai.com/v1/chat/completions` | `Authorization: Bearer` | `gpt-4o` | native `response_format`, prompt-embedded when the model refuses it |
| `gemini` | OpenAI Chat Completions | `generativelanguage.googleapis.com/v1beta/openai/chat/completions` | Bearer | `gemini-3.6-flash` | native `response_format`, prompt-embedded when the model refuses it |
| `openrouter` | OpenAI Chat Completions | `openrouter.ai/api/v1/chat/completions` | Bearer | `anthropic/claude-haiku-4.5` | native `response_format`, prompt-embedded when the model refuses it |
| `ollama` | OpenAI Chat Completions | `localhost:11434/v1/chat/completions` | none | `llama3.1` | native `response_format`, prompt-embedded when the model refuses it |

The endpoint is the preset's `baseUrl` plus its `chatPath`; a `baseUrl` override (`LLMConfig.baseUrl`, the stored `llm.baseUrl`) replaces the root the path is appended to.

Tool use in chat:

| Provider | Tools | Streamed tool calls | Provider state replayed | Output cap field (chat) | Notes |
|---|---|---|---|---|---|
| `anthropic`, `claude-code` | Messages API `tools` | `input_json_delta` fragments | thinking and redacted-thinking blocks | `max_tokens` | `tool_choice` only `auto` or `none`; no `thinking` field is sent, so the model's default applies |
| `openai` | `tools` (function) | `delta.tool_calls[].index` | — | `max_completion_tokens` | |
| `gemini` | OpenAI-compatible `tools` | calls may arrive without `index` | `extra_content` thought signatures | `max_tokens` | |
| `openrouter` | per upstream model | as upstream | `reasoning_details` | `max_tokens` | no tool-capable endpoint → 404 "No endpoints found that support tool use" |
| `ollama` | per model | per model | — | `max_tokens` | a model without tools → 400 "… does not support tools"; `tool_choice` may be ignored |

The Anthropic completion adapter defaults `max_tokens` to 4096 and surfaces a refusal as an error; the OpenAI-format completion adapter sends the preset's `maxTokensParam` only when a caller sets it (`max_completion_tokens` for `openai`: the gpt-5 and o-series models reject `max_tokens`). The Anthropic chat adapter defaults `max_tokens` to 16000. Anthropic and OpenRouter default to Haiku 4.5 on purpose: enrichment writes short SEO strings, so the cheapest current model is the shipped default. A site opts into `claude-sonnet-5` or `claude-opus-5-5` through the `llm` configuration section (`docs/configuration.md`) or in Setup › AI provider.

The key a deployment uses here is the product's own: a provider's API key from its own variable (`KRANTHO_LLM_ANTHROPIC_API_KEY` for the default provider), billed per token to whoever deploys. The `claude-code` provider takes a subscription token from `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN`, a variable of the product's own; the repository's development tooling keeps `CLAUDE_CODE_OAUTH_TOKEN` to itself, and krantho never reads it (see [Credentials](#credentials)).

### Model profiles

What a model accepts differs by model, not by provider, so a **model profile** shapes the request
beyond the provider's preset. Nothing about it is a choice in Setup: krantho picks, and a site
overrides one model in code.

| Setting | Meaning |
|---|---|
| `reasoningEffort` | The effort to ask for, or `default` to leave it to the model: `reasoning_effort` for `openai`, `gemini` and `ollama`, `reasoning: { effort }` for `openrouter`. The Anthropic providers have none: Claude thinks only when asked to |
| `reasoningHeadroom` | Output tokens added to a request's cap for the thinking a model does before it answers |
| `temperature` | The sampling temperature to send; unset sends none |

**Reasoning is asked for as little as the model allows.** The assistant and enrichment want an
answer, not a deliberation. A reasoning model counts its thinking against the output cap, and a
cap spent on thinking returns no text: with today's caps, gpt-5 and gpt-5-mini answered a short
SEO prompt with an empty reply, and every gpt-5, gpt-6 and o-series model rejected `max_tokens`.
The lowest effort each family accepts differs, and a model rejects an effort it does not
support, so the defaults (`DEFAULT_MODEL_PROFILES`, checked against the OpenAI API) name it per family:

| Models | Effort | Headroom |
|---|---|---|
| `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | `minimal` | none |
| `gpt-5.1` and later, `gpt-6-sol`, `gpt-6-luna` | `none` | none |
| the rest of `gpt-6` (such as `gpt-6-astra`), which cannot reason less than `low` | `low` | 1024 |
| the o-series, which reasons at length even at `low` | `low` | 4096 |
| any other model (`gpt-4o`, `gpt-4.1`, a future family) | none sent | none |

A model no rule matches is sent no reasoning setting, as before. The `-pro` and `-codex` models are served by OpenAI's Responses API only, so Chat Completions refuses them whatever a profile says.

The other providers follow their documentation, which is not the same as having run them: the
`openai` rules above were checked against the API, and these were not.

| Provider and models | Effort | Headroom | Source |
|---|---|---|---|
| `gemini`: `gemini-2.5-flash`, `-flash-lite` | `none` | none | the compatible endpoint documents `none` for 2.5 |
| `gemini`: `gemini-2.5-pro`, which cannot stop thinking | `low` | 1024 | 1,024-token budget |
| `gemini`: `gemini-3.5-flash(-lite)`, `gemini-3.6-flash`, `gemini-3-flash-preview` | `minimal` | none | thinking level `minimal` |
| `gemini`: `gemini-3.7-flash`, `gemini-3.8-flash` | `low` | 512 | no `minimal` level listed |
| `gemini`: the Gemini 3 Pro models | `low` | 1024 | cannot be turned off |
| `ollama`: `qwen3*`, `gemma4*` | `none` | none | the endpoint maps `none` to no thinking |
| `ollama`: `gpt-oss*` | `low` | 2048 | thinks at `low`, `medium` or `high` only |
| `openrouter`: `openai/…` and `google/…` ids | the vendor's rule above, as `reasoning: { effort }` | as the vendor's | OpenRouter passes effort on |
| anything else, including every Anthropic model | none sent | none | Claude thinks only when asked to |

Gemini's own guidance is to leave `temperature` at its default of 1.0 on Gemini 3, so no
default sets one. Ollama's compatible endpoint cannot set the context window (`num_ctx`): the
server's `OLLAMA_CONTEXT_LENGTH`, or a Modelfile, does, and the default on a small GPU is 4k
tokens, which tool definitions and a conversation can fill.

**A default that was not checked is asked, not insisted on.** When a provider refuses a request
over a reasoning setting a default added (a 400 or 422 whose message names reasoning or
thinking), the request is sent again without it, and the model is not asked again until the
process restarts. A setting a site chose in `llm.profiles`, and a rule checked against the API,
are never dropped: their refusal is the error the user reads.

A model that rejects what its family accepts is set right in `krantho.config.ts`, by model id:

```typescript
export default defineConfig({
  llm: {
    profiles: {
      'gpt-5.7': { reasoningEffort: 'low', reasoningHeadroom: 2048 },
      'gpt-4o': { temperature: 0.2 },
    },
  },
})
```

An override replaces only what it sets. `reasoningEffort` is read by `openai`, `gemini`, `openrouter` and `ollama` and
`temperature` by the providers on the OpenAI-compatible wire: an override on a model of a provider
that cannot carry it fails when the adapter is created, never silently. The gpt-5 and later models
and the o-series reject a temperature other than the default.

## API Reference

### `createLLMAdapter(config): LLMAdapter`

Factory function. Creates an adapter for the given provider, selecting the correct wire format automatically.

```typescript
import { createLLMAdapter } from '@krantho/ai'

const llm = createLLMAdapter({
  provider: 'anthropic',
  apiKey: process.env.KRANTHO_LLM_ANTHROPIC_API_KEY,
})

const result = await llm.complete('Summarize this page for SEO.')
console.log(result.text)
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.provider` | `Provider` | `'anthropic'` \| `'claude-code'` \| `'openai'` \| `'gemini'` \| `'openrouter'` \| `'ollama'` |
| `config.model` | `string?` | Override the provider's default model; `claude-code` accepts only its pinned model and throws on another. Anthropic and OpenRouter default to Haiku 4.5, the cheapest current model; choose Sonnet 5 (`claude-sonnet-5`) or Opus 5.5 (`claude-opus-5-5`) for demanding content |
| `config.apiKey` | `string?` | API key (omitted for Ollama); `claude-code` never uses it |
| `config.authToken` | `string?` | Claude subscription token (what `claude setup-token` prints). Required by `claude-code` and read by no other provider. Development on your own machine only |
| `config.baseUrl` | `string?` | Override the default base URL |

**Returns:** `LLMAdapter`

Throws if the provider is unknown, or for `claude-code` when `authToken` is missing or `model` differs from `CLAUDE_CODE_MODEL`.

### `structuredComplete<T>(llm, prompt, schema, options?): Promise<T>`

Send a prompt to an LLM and parse the response as typed JSON. Wraps the prompt with JSON schema instructions, then extracts JSON from the response — handling raw JSON, markdown code fences, and preamble text before JSON.

```typescript
import { createLLMAdapter, structuredComplete } from '@krantho/ai'

const llm = createLLMAdapter({ provider: 'openai', apiKey: '...' })

const result = await structuredComplete<{ description: string }>(
  llm,
  'Write a meta description for a page about TypeScript CMS tools.',
  {
    type: 'object',
    properties: { description: { type: 'string' } },
    required: ['description'],
  },
)

console.log(result.description)
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `llm` | `LLMAdapter` | Adapter instance from `createLLMAdapter()` |
| `prompt` | `string` | The user prompt |
| `schema` | `Record<string, unknown>` | JSON Schema describing the expected response shape |
| `options` | `LLMOptions?` | Max tokens, system prompt (the schema is passed by `structuredComplete` itself) |

**Returns:** `Promise<T>` — parsed JSON matching the schema

On adapters with native structured output the schema is enforced server-side and the reply is parsed directly: Anthropic through `output_config`, the OpenAI-format providers through `response_format` (`json_schema`, strict when every object in the schema is closed and lists all its properties). When a model refuses `response_format` (a 400, 404 or 422 that names the schema), the adapter throws `StructuredOutputUnsupportedError` and `structuredComplete` goes again with the schema embedded in the prompt; a model whose message says it takes no schema is remembered, so later calls skip the attempt. On the fallback path the reply is extracted from raw, fenced, or preamble-wrapped JSON; throws if none parses.

### `PROVIDER_PRESETS`

Default configuration for each supported provider. Maps `Provider` to `ProviderPreset`.

```typescript
import { PROVIDER_PRESETS } from '@krantho/ai'

const geminiDefaults = PROVIDER_PRESETS.gemini
// {
//   format: 'openai',
//   baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
//   defaultModel: 'gemini-3.6-flash',
//   chatPath: '/chat/completions',
//   maxTokensParam: 'max_tokens',
//   forbidTools: 'tool_choice',
//   openObjects: 'json_string',
// }
```

Each preset contains:

| Field | Type | Description |
|-------|------|-------------|
| `format` | `WireFormat` | `'anthropic'` or `'openai'` |
| `baseUrl` | `string` | Default API endpoint |
| `defaultModel` | `string` | Default model ID (overridable via `LLMConfig.model`) |
| `chatPath` | `string` | Path of the chat completions endpoint under `baseUrl`, used by both OpenAI-format adapters (Anthropic's names its Messages endpoint, which its adapters build themselves) |
| `maxTokensParam` | `'max_tokens'` \| `'max_completion_tokens'` | The field the chat adapter caps output tokens with |
| `forbidTools` | `'tool_choice'` \| `'omit_tools'` | How a chat request forbids tool calls, as the agent loop does on its last turn: `tool_choice: 'none'`, or by leaving the tools out where the provider does not read `tool_choice` (Ollama) |
| `openObjects` | `'native'` \| `'json_string'` | How a tool parameter that is an object without named properties is declared. Gemini has been reported to reject one, so its adapter declares it as a string the model fills with JSON, decodes the call's arguments back to an object, and sends no `parameters` for a tool without arguments |

### `AnthropicFormatAdapter`

Class implementing `LLMAdapter` for the Anthropic Messages API. Uses `POST {baseUrl}/v1/messages` with `x-api-key` authentication, or `Authorization: Bearer` plus `anthropic-beta: oauth-2025-04-20` when `authToken` is set; `createLLMAdapter()` passes `authToken` for `claude-code` only and `apiKey` for `anthropic`. `LLMOptions.jsonSchema` and `LLMOptions.effort` are sent as `output_config.format` and `output_config.effort`. Haiku 4.5, the shipped default, does not support `effort` — set it only when the configured model is Sonnet 5 or Opus 5.5. Created internally by `createLLMAdapter()` — direct instantiation is available for advanced use.

### `OpenAIFormatAdapter`

Class implementing `LLMAdapter` for the OpenAI Chat Completions API: `new OpenAIFormatAdapter({ baseUrl, apiKey, model, chatPath, maxTokensParam, profile })` (`OpenAIFormatOptions`). Uses `POST {baseUrl}{chatPath}` with `Authorization: Bearer` authentication (omitted without a key). Covers OpenAI, Gemini, OpenRouter, and Ollama. Created internally by `createLLMAdapter()`, which passes the preset's `chatPath` and `maxTokensParam` and the model's profile.

### Types

```typescript
/** Supported LLM providers */
type Provider = 'anthropic' | 'claude-code' | 'openai' | 'gemini' | 'openrouter' | 'ollama'

/** Wire format — Anthropic has its own, everyone else uses OpenAI-compatible */
type WireFormat = 'anthropic' | 'openai'

interface LLMConfig {
  provider: Provider
  model?: string | undefined
  apiKey?: string | undefined
  authToken?: string | undefined  // Claude subscription token — claude-code only, development only
  baseUrl?: string | undefined
}

interface LLMOptions {
  maxTokens?: number | undefined      // Default: 4096 for Anthropic
  jsonSchema?: Record<string, unknown> | undefined  // enforced server-side where supported
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined  // Anthropic only; unset leaves the API default
  system?: string | undefined          // System prompt
}

interface CompletionResult {
  text: string
  usage: { inputTokens: number; outputTokens: number }
  model: string
  finishReason: string
}

interface LLMAdapter {
  readonly supportsJsonSchema: boolean
  complete(prompt: string, options?: LLMOptions): Promise<CompletionResult>
}

interface ProviderPreset {
  format: WireFormat
  baseUrl: string
  defaultModel: string
  chatPath: string                                    // chat completions path under baseUrl
  maxTokensParam: 'max_tokens' | 'max_completion_tokens'
}
```

## Chat with tools and streaming

The chat API streams one model turn at a time and lets the model call tools the caller defines. It is what the [Studio assistant](assistant.md) runs on; the caller owns the loop — it runs the tools and sends their results back in the next turn.

### `createChatAdapter(config): ChatAdapter`

Same `LLMConfig`, provider presets and model default as `createLLMAdapter()`. `anthropic` gets an `AnthropicChatAdapter` (Messages API); every other provider an `OpenAIChatAdapter` posting to its preset's `baseUrl` + `chatPath` with its `maxTokensParam`. Throws if the provider is unknown.

```typescript
import { createChatAdapter } from '@krantho/ai'

const chat = createChatAdapter({ provider: 'anthropic', apiKey: process.env.KRANTHO_LLM_ANTHROPIC_API_KEY })

for await (const event of chat.stream({ messages: [{ role: 'user', content: 'Hello' }] })) {
  if (event.type === 'text') process.stdout.write(event.text)
  if (event.type === 'error') console.error(event.code, event.message)
}
```

### `ChatAdapter`

```typescript
interface ChatAdapter {
  readonly provider: Provider
  readonly model: string
  /**
   * Stream one model turn. Never throws for provider, network or abort
   * failures — they arrive as one `error` event, after which the stream ends.
   * A successful turn ends with `usage` then `stop`.
   */
  stream(request: ChatRequest): AsyncIterable<ChatEvent>
}
```

The contract every adapter keeps:

- `text` events arrive in order as the model writes.
- Each `tool_call` is emitted once, complete, with its arguments parsed. Arguments that are not a JSON object give `input: {}` and an `inputError`.
- A successful turn ends with exactly one `usage` and one `stop`. When the turn emitted a tool call, the stop reason is `tool_use` whatever the provider reported (some OpenAI-compatible providers report `stop` with tool calls).
- A failed turn ends with one `error` event and nothing after it. A stream that ends before the provider finished the turn is an `error` with code `provider`, so a cut-off answer never looks like a finished one.

### Types

```typescript
/** A tool the model may call; `inputSchema` is a JSON Schema object */
interface ChatTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** A complete tool call from the model */
interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>        // `{}` when `inputError` is set
  inputError?: string | undefined       // the arguments were not a JSON object
  extra?: Record<string, unknown> | undefined  // provider fields sent back with this call unchanged
}

/** Provider state attached to one model turn, sent back unchanged with that turn */
interface ProviderReplay {
  provider: Provider
  data: unknown
}

type ChatMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant'
      content: string
      toolCalls?: readonly ToolCall[] | undefined
      replay?: ProviderReplay | undefined
    }
  | { role: 'tool'; toolCallId: string; content: string; isError?: boolean | undefined }

interface ChatRequest {
  system?: string | undefined
  messages: readonly ChatMessage[]
  tools?: readonly ChatTool[] | undefined
  /** 'none' keeps the tool definitions but forbids calling them (the history may hold tool calls) */
  toolChoice?: 'auto' | 'none' | undefined
  maxTokens?: number | undefined
  signal?: AbortSignal | undefined
}

type ChatStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other'

type ChatErrorCode =
  | 'tools_unsupported'
  | 'auth'
  | 'rate_limited'
  | 'overloaded'
  | 'bad_request'
  | 'network'
  | 'aborted'
  | 'provider'

type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'stop'; reason: ChatStopReason; raw: string; replay?: ProviderReplay | undefined }
  | { type: 'error'; code: ChatErrorCode; message: string; status?: number | undefined }
```

`stop.raw` is the provider's own stop or finish reason. Stop reasons map as: Anthropic `end_turn`/`stop_sequence` → `end_turn`, `max_tokens` and `model_context_window_exceeded` → `max_tokens`, `refusal` → `refusal`; OpenAI-format `stop` → `end_turn`, `tool_calls`/`function_call` → `tool_use`, `length` → `max_tokens`, `content_filter` → `refusal`; anything else (Anthropic's `pause_turn`, …) → `other`.

### A tool loop

After a turn with tool calls, append the assistant turn — its text, its calls and the `replay` from its `stop` event — then one `tool` message per call, and stream the next turn. Keep the turns of one loop append-only and send the same tool definitions on every turn: providers validate replayed state against the conversation it came from.

```typescript
import { createChatAdapter } from '@krantho/ai'
import type { ChatMessage, ChatTool, ProviderReplay, ToolCall } from '@krantho/ai'

const tools: ChatTool[] = [
  {
    name: 'get_time',
    description: 'The current time as an ISO string',
    inputSchema: { type: 'object', properties: {} },
  },
]
const messages: ChatMessage[] = [{ role: 'user', content: 'What time is it?' }]
const chat = createChatAdapter({ provider: 'openai', apiKey: process.env.KRANTHO_LLM_OPENAI_API_KEY })

for (let turn = 0; turn < 4; turn++) {
  let text = ''
  const calls: ToolCall[] = []
  let replay: ProviderReplay | undefined
  for await (const event of chat.stream({ messages, tools, toolChoice: turn === 3 ? 'none' : 'auto' })) {
    if (event.type === 'text') text += event.text
    if (event.type === 'tool_call') calls.push(event.call)
    if (event.type === 'stop') replay = event.replay
    if (event.type === 'error') throw new Error(`${event.code}: ${event.message}`)
  }
  if (calls.length === 0) break
  messages.push({ role: 'assistant', content: text, toolCalls: calls, replay })
  for (const call of calls) {
    messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify({ now: new Date().toISOString() }) })
  }
}
```

### Provider state replay

Some providers attach opaque state to a turn that must go back unchanged with the tool results, or the next request is rejected:

- **Anthropic** thinking and redacted-thinking blocks. The current Opus and Sonnet models think by default. For a turn with a tool call, `stop.replay` carries the turn's content blocks exactly as received — thinking, redacted thinking, text and tool use, in order — and the adapter sends them back verbatim as that assistant turn's content. Thinking text is never emitted as `text`.
- **Gemini** thought signatures: a tool call's `extra_content` is kept as `ToolCall.extra` and spread back onto that call.
- **OpenRouter** `reasoning_details`: kept in `stop.replay` and spread back onto the assistant message.

A `replay` whose `provider` differs from the adapter's is ignored. Replayed state is for the turns of one loop; turns from an earlier conversation go back as plain text.

### Errors and tool support

HTTP errors take their message from the provider's `error.message` (both formats), else `LLM API error: <status>`, and carry the `status`:

| Status | Code |
|---|---|
| 400, 404, 422 with a tools-unsupported message | `tools_unsupported` |
| 401, 403 | `auth` |
| 429 | `rate_limited` |
| 503, 529 | `overloaded` |
| other 4xx | `bad_request` |
| 5xx | `provider` |

A rejected `fetch` is `network`; an aborted `signal` is `aborted`. Errors inside the stream map too: Anthropic `error` events by type (`overloaded_error` → `overloaded`, `rate_limit_error` → `rate_limited`, `authentication_error`/`permission_error` → `auth`, `invalid_request_error` → `bad_request`, else `provider`), and an OpenAI-format chunk carrying an `error` object (OpenRouter mid-stream) by its numeric `code` with the HTTP rules, else as `provider` or `tools_unsupported` by its message.

`isToolsUnsupportedMessage(message: string): boolean` recognizes the providers' "this model cannot use tools" answers — Ollama's "… does not support tools", OpenRouter's "No endpoints found that support tool use", and the common "does not support tool use / function calling" and "tools are not supported" phrasings. A model that accepts tools and never calls them is not detected.

### `AnthropicChatAdapter`

`new AnthropicChatAdapter(baseUrl, apiKey, model, authToken?, provider?)` (`provider` is `'anthropic'` unless `createChatAdapter()` passes `'claude-code'`). Posts to `{baseUrl}/v1/messages` with `stream: true` and `max_tokens` (`request.maxTokens`, default 16000), authenticated as the completion adapter is (`x-api-key`, or the OAuth bearer token and beta header when `authToken` is given, which `createChatAdapter()` does for `claude-code` only). Tools are sent as `input_schema`, `tool_choice` as `{ type: 'auto' }` or `{ type: 'none' }` — never a forced tool, which the current models reject. No `thinking` field is sent. Consecutive `tool` messages are grouped into one user turn of `tool_result` blocks (`is_error` from `isError`).

### `OpenAIChatAdapter`

```typescript
interface OpenAIChatOptions {
  provider: Provider
  baseUrl: string
  apiKey?: string | undefined
  model: string
  chatPath: string
  maxTokensParam: 'max_tokens' | 'max_completion_tokens'
  forbidTools: 'tool_choice' | 'omit_tools'
  openObjects: 'native' | 'json_string'
  profile: ModelProfile
}

new OpenAIChatAdapter(options: OpenAIChatOptions)
```

Posts to `{baseUrl}{chatPath}` with `stream: true` and `stream_options: { include_usage: true }`; `Authorization: Bearer` only when a key is set. Tools are sent as `{ type: 'function', function: { name, description, parameters } }` with `tool_choice: 'auto' | 'none'`, the system prompt as the first message, and `request.maxTokens` plus the profile's `reasoningHeadroom` under `maxTokensParam` when set, with the profile's `reasoning_effort` and `temperature` when it names them. Streamed tool calls are accumulated by `index`, by `id` when a provider sends no index, and emitted when the turn completes (`[DONE]`, or the end of a stream that carried a finish reason); a call without an id gets `call_<n>`. `isError` has no wire field: say so in the tool message's content.

### `parseServerSentEvents(body, signal?): AsyncGenerator<ServerSentEvent>`

```typescript
interface ServerSentEvent {
  event: string        // 'message' when the stream names none
  data: string         // several data lines joined with '\n'
  id?: string | undefined
}

function parseServerSentEvents(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal | undefined,
): AsyncGenerator<ServerSentEvent>
```

A `text/event-stream` parser following the WHATWG rules: UTF-8 decoded across chunk boundaries, `\r\n`, `\n` and `\r` line endings, comment lines (`: …`) skipped, a single leading space after the colon stripped, `retry` and unknown fields ignored, an event with empty data not dispatched, and a final event without a trailing blank line dispatched at the end. The reader is cancelled when the consumer stops early or `signal` aborts, and released in every case. Both chat adapters use it, and Studio reads the assistant's stream with it.

## Usage

### Installation

```bash
pnpm add @krantho/ai
```

### Basic completion

```typescript
import { createLLMAdapter } from '@krantho/ai'

const llm = createLLMAdapter({
  provider: 'anthropic',
  apiKey: process.env.KRANTHO_LLM_ANTHROPIC_API_KEY,
})

const result = await llm.complete('Write a one-sentence summary.', {
  maxTokens: 1024,
})

console.log(result.text)
console.log(`Tokens: ${result.usage.inputTokens} in, ${result.usage.outputTokens} out`)
```

### Local models with Ollama

```typescript
import { createLLMAdapter } from '@krantho/ai'

const llm = createLLMAdapter({
  provider: 'ollama',
  model: 'mistral',
  // No apiKey needed — Ollama runs locally
  // baseUrl defaults to http://localhost:11434
})

const result = await llm.complete('Explain krantho in one paragraph.')
```

### OpenRouter for model routing

```typescript
import { createLLMAdapter } from '@krantho/ai'

const llm = createLLMAdapter({
  provider: 'openrouter',
  apiKey: process.env.KRANTHO_LLM_OPENROUTER_API_KEY,
  model: 'google/gemini-2.0-flash',
})
```

### Structured output for SEO

```typescript
import { createLLMAdapter, structuredComplete } from '@krantho/ai'

const llm = createLLMAdapter({ provider: 'anthropic', apiKey: '...' })

const seo = await structuredComplete<{
  metaDescription: string
  keywords: string[]
}>(
  llm,
  `Analyze this content and generate SEO metadata:\n\n${pageContent}`,
  {
    type: 'object',
    properties: {
      metaDescription: { type: 'string', maxLength: 160 },
      keywords: { type: 'array', items: { type: 'string' } },
    },
    required: ['metaDescription', 'keywords'],
  },
  { system: 'You are an SEO specialist.' },
)
```

## Dependencies

### Runtime Dependencies

None. Zero dependencies by design.

### Workspace Dependencies

None. This package has no workspace dependencies. It is consumed by `@krantho/api`, `@krantho/tools` and `@krantho/studio`.

### Peer Dependencies

None.
