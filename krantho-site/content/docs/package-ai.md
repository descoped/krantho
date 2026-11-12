---
title: "@krantho/ai"
description: A zero-dependency LLM client for Anthropic, OpenAI, Gemini, OpenRouter and Ollama, using only fetch().
area: reference
order: 101
level: intermediate
next: [seo-pipeline]
related: [configuration, package-server, package-studio, package-tools]
status: published
---

A zero-dependency LLM client. It supports Anthropic, OpenAI, Gemini, OpenRouter and Ollama through one interface, using only `fetch()`. Krantho uses it for SEO enrichment at runtime and in the build-time tools.

## Install

```bash
pnpm add @krantho/ai
```

No runtime dependencies and no SDKs.

## Send a completion

```ts
import { createLLMAdapter } from '@krantho/ai'

const llm = createLLMAdapter({
  provider: 'anthropic',
  apiKey: process.env.KRANTHO_LLM_ANTHROPIC_API_KEY,
})

const result = await llm.complete('Summarize this page for SEO.', {
  maxTokens: 1024,
})

console.log(result.text)
console.log(`Tokens: ${result.usage.inputTokens} in, ${result.usage.outputTokens} out`)
```

## Structured output

Send a prompt and parse the response as typed JSON.

```ts
import { createLLMAdapter, structuredComplete } from '@krantho/ai'

const llm = createLLMAdapter({ provider: 'openai', apiKey: '...' })

const seo = await structuredComplete<{
  metaDescription: string
  keywords: string[]
}>(
  llm,
  'Generate SEO metadata for a TypeScript CMS tools page.',
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

`structuredComplete` has the provider enforce the schema: Anthropic natively, and OpenAI, Gemini, OpenRouter and Ollama through `response_format`. If a model refuses a schema, it embeds the schema in the prompt instead and extracts the JSON, whether it comes back raw, fenced or after a preamble.

## Supported providers

| Provider | Wire format | Default model |
|----------|-------------|---------------|
| `anthropic` | Anthropic Messages | `claude-haiku-4-5` |
| `claude-code` | Anthropic Messages | `claude-haiku-4-5-20251001`, pinned |
| `openai` | OpenAI Chat Completions | `gpt-4o` |
| `gemini` | OpenAI Chat Completions | `gemini-3.6-flash` |
| `openrouter` | OpenAI Chat Completions | `anthropic/claude-haiku-4.5` |
| `ollama` | OpenAI Chat Completions | `llama3.1` |

The Anthropic and OpenRouter defaults are Haiku 4.5, the least expensive current model, on purpose: enrichment writes short SEO strings. Pick Sonnet 5 (`claude-sonnet-5`) or Opus 5.5 (`claude-opus-5-5`, on OpenRouter `anthropic/claude-opus-5.5`) in Studio's **Setup › AI provider**, or through `llm.model`, when a site needs more.

Two wire formats cover every provider. Anthropic has its own Messages API, which `anthropic` and `claude-code` both speak; the others speak OpenAI Chat Completions.

`claude-code` runs on your Claude subscription instead of an API key, so enrichment on your own machine costs no tokens. It is for development only, and Haiku is the only model it runs: a `model` that differs from the pinned `CLAUDE_CODE_MODEL` is an error, not a silent downgrade.

## Model profiles

What a model accepts differs by model, not by provider, so krantho shapes the request per model and Studio shows no choice about it. The gpt-5 and later models and the o-series reject `max_tokens` and a temperature, and count their thinking against the output cap: a cap spent on thinking returns no text. So the `openai` provider uses `max_completion_tokens`, asks a reasoning model for the lowest reasoning effort it accepts, and adds room to the cap for the models that cannot reason less.

| Models | Effort asked for | Room added to the cap |
|---|---|---|
| `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | `minimal` | none |
| `gpt-5.1` and later, `gpt-6-sol`, `gpt-6-luna` | `none` | none |
| the rest of `gpt-6`, such as `gpt-6-astra` | `low` | 1024 |
| the o-series | `low` | 4096 |
| any other model, such as `gpt-4o` or `gpt-4.1` | nothing sent | none |

The `-pro` and `-codex` models are served by OpenAI's Responses API only, so no profile reaches them. `gpt-6-astra` and `gpt-6.1-sol` take function tools through OpenAI's Responses API only, so they work for enrichment and not for the assistant: the assistant says the model cannot use tools. A model that rejects what its family accepts is set right in `krantho.config.ts`, by model id; an override changes only what it sets:

```ts title="krantho.config.ts"
export default defineConfig({
  llm: {
    profiles: {
      'gpt-5.7': { reasoningEffort: 'low', reasoningHeadroom: 2048 },
      'gpt-4o': { temperature: 0.2 },
    },
  },
})
```

`reasoningEffort` (`default` sends nothing), `temperature` and `reasoningHeadroom` are read by the providers on the OpenAI-compatible wire. An override for a provider that cannot carry it, `anthropic` and `claude-code`, fails when the adapter is created.

Gemini, OpenRouter and Ollama have defaults too, taken from each provider's documentation and not yet run against the live services: Gemini 2.5 Flash is asked for no thinking, the Gemini 3 Flash models for `minimal` or `low`, and 2.5 Pro and the Gemini 3 Pro models, which cannot stop thinking, for `low` with room added to the cap; OpenRouter's `openai/` and `google/` models take the same rules; Ollama's `qwen3` and `gemma4` models are asked for no thinking and `gpt-oss` for `low`. If a provider refuses a setting a default added, the request is sent again without it. A setting you chose in `llm.profiles` is never dropped.

## Local models with Ollama

```ts
import { createLLMAdapter } from '@krantho/ai'

const llm = createLLMAdapter({
  provider: 'ollama',
  model: 'mistral',
  // No API key: Ollama runs locally.
  // baseUrl defaults to http://localhost:11434
})

const result = await llm.complete('Explain krantho in one paragraph.')
```

## Model routing with OpenRouter

```ts
import { createLLMAdapter } from '@krantho/ai'

const llm = createLLMAdapter({
  provider: 'openrouter',
  apiKey: process.env.KRANTHO_LLM_OPENROUTER_API_KEY,
  model: 'google/gemini-2.0-flash',
})
```

## Configuration options

```ts
interface LLMConfig {
  provider: 'anthropic' | 'claude-code' | 'openai' | 'gemini' | 'openrouter' | 'ollama'
  model?: string       // override the default model; claude-code accepts only its pinned model
  apiKey?: string      // omit for Ollama; claude-code never uses it
  authToken?: string   // Claude subscription token: required by claude-code, read by no other provider
  baseUrl?: string     // override the default endpoint
  profiles?: Record<string, { reasoningEffort?: string; reasoningHeadroom?: number; temperature?: number }>  // per-model request settings, by model id
}

interface LLMOptions {
  maxTokens?: number
  jsonSchema?: Record<string, unknown>
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  system?: string      // system prompt
}
```

`effort` is sent to Anthropic as `output_config.effort` and ignored by the other providers. Haiku 4.5, the default, does not support it: set `effort` only with Sonnet 5 or Opus 5.5.

The `claude-code` provider requires `authToken` and sends it as `Authorization: Bearer` with the `anthropic-beta: oauth-2025-04-20` header; it throws without one and never uses `apiKey`. Every other provider authenticates with `apiKey` and ignores `authToken`, `anthropic` included.

## Inside a krantho site

You rarely build the adapter yourself. The provider, model and each provider's key are the `llm` section of the [configuration](/docs/configuration), and the build-time tools and runtime enrichment resolve the same tree.

A provider is on when it has a key, from the environment, the code or **Setup › AI provider** in Studio, so setting a provider's variable is all it takes. The site uses the provider chosen in Studio while it is on, otherwise the first one that is on, in the order `anthropic`, `openai`, `gemini`, `openrouter`; `claude-code` and `ollama` are never picked for a site, only chosen. The model and base URL are kept for each provider, so choosing another provider never carries them over. The server seeds the chosen provider once, on the first start where the code passes an `llm` block, or the environment chooses a provider (`KRANTHO_LLM_PROVIDER`) and supplies that provider's key; after that, the stored settings win. The credential is picked on every request, and every provider has one of its own:

| Provider | Credential | Variable | Order |
|----------|------------|----------|-------|
| `anthropic` | API key | `KRANTHO_LLM_ANTHROPIC_API_KEY` (`llm.anthropic.apiKey`) | 1. the environment, 2. the key stored for it in **Setup › AI provider** |
| `openai` | API key | `KRANTHO_LLM_OPENAI_API_KEY` (`llm.openai.apiKey`) | the same |
| `gemini` | API key | `KRANTHO_LLM_GEMINI_API_KEY` (`llm.gemini.apiKey`) | the same |
| `openrouter` | API key | `KRANTHO_LLM_OPENROUTER_API_KEY` (`llm.openrouter.apiKey`) | the same |
| `claude-code` | Claude subscription token | `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN` (`llm.claudeCode.authToken`) | the token only |
| `ollama` | none | | |

Every variable accepts the `_FILE` suffix, naming a file to read the value from. A provider never uses another provider's credential: `anthropic` reads neither the OpenAI key nor the subscription token, and with only those set it has no credential. A key saved in Studio belongs to the provider it was saved for, and switching provider never carries it over. krantho reads no other variable for a credential: `CLAUDE_CODE_OAUTH_TOKEN` belongs to Claude Code, not to your site.

The assistant can use a different provider from enrichment. Set `assistant.provider` (`KRANTHO_ASSISTANT_PROVIDER`) and the assistant runs on that provider and that provider's own credential, with `assistant.model` or else the provider's default model; enrichment keeps the provider the site uses. A user can also pick another provider that is on in the assistant's dialog.

`claude-code` is a development provider. The token is what `claude setup-token` prints, and it works on your own machine only: the server refuses the provider when `NODE_ENV` is `production`, and **Setup › AI provider** will not save it there. The token is never written to the database. A deployment uses the `anthropic` provider with an API key. In Studio, Claude Code sits under **For developers**, with its pinned model and no key field. **Setup › AI provider** lists the providers that are on and where each key comes from, in words rather than variable names, and the providers a key turns on; it never shows a value.

## Next steps

- Configure enrichment on the server: [@krantho/server](/docs/package-server#llm-configuration)
- Enrich SEO from Studio: [@krantho/studio](/docs/package-studio)
