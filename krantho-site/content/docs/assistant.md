---
title: The Studio assistant
description: A chat in Studio that finds, drafts and improves content and SEO through krantho's own API, on the language model you configure, and waits for your confirmation before anything goes live or is replaced.
area: guides
order: 17
level: intermediate
stacks: [next, sveltekit, express]
prerequisites: [studio]
related: [studio, content-model, package-ai, configuration, seo-pipeline]
status: published
---

The assistant is a chat panel in [Studio](/docs/studio). A signed-in editor asks for work in plain language, and krantho does it through its own API, as that editor, on the language model you configure. It is off by default, and nothing about it appears in Studio or the API until you turn it on.

It saves what it writes as a draft. It publishes, deletes and replaces existing text only after you confirm the exact change in the chat.

## Turn it on

```ts title="krantho.config.ts"
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  assistant: { enabled: true },
})
```

or `KRANTHO_ASSISTANT_ENABLED=true`. It needs:

- **SQLite or Postgres.** The assistant relies on version history and on the stored AI provider settings. The filesystem backend is refused.
- **An AI provider**, chosen in Studio under **Setup › AI provider** or named by `assistant.provider`: provider, model and, for hosted providers, that provider's own credential. Until one is set, the panel says so and links admins to the settings. See [Providers and credentials](#providers-and-credentials).
- **Sign-in in production.** With `auth.mode: 'none'`, every visitor is an admin and could use the assistant on your credential. The server logs a warning when it is enabled that way.
- **A stable `KRANTHO_JWT_SECRET`** on every instance, since proposals are signed with it.

The launcher is the **Assistant** item at the bottom of Studio's navigation. The panel knows which page you have open, so "shorten this description" needs no names.

## Who can use it

The assistant acts as the signed-in user and never holds more permission than that user. Every write goes through the same role checks as the Studio screen that does the same thing, and a tool above the user's role is not offered to the model.

`assistant.role` is the lowest role that may open the assistant. The default is `editor`, so viewers don't see it. It is also the control over who spends your language-model credential: lower it to `viewer` for read-only reviewers who should be able to ask questions, or raise it to `admin`.

## What you can ask

| Task | What it does | Needs |
|---|---|---|
| Find and read | Lists collections and fields, searches every collection, reads a document and its sections | viewer |
| Check SEO | Checks a page's title, meta description and rich-result eligibility, and explains the findings | viewer |
| Draft from a brief | Creates a new document in a collection you name, shaped by its schema | editor |
| Rewrite or shorten | Changes fields, the whole body or named `##` sections, as a new draft version | editor |
| Fill what is empty | Writes values into empty fields | editor |
| Answer-ready summary | Writes a short, standalone summary a search or answer engine can quote | editor |
| FAQ from a document | Proposes question and answer entries into a collection you pick | editor |
| Publish | Proposes publishing documents, and shows what goes live | editor |
| Meta descriptions and Schema.org properties | The same enrichment as Structure › **Fill what's missing**, on request | admin |
| Regenerate `llms.txt` | Proposes a new `llms.txt` snapshot | admin |
| Delete | Proposes deleting documents; one that other content references is left out and reported | admin |

A document the assistant can't write to, such as a collection with no summary field, gets the result as a copyable block with the reason, not a write.

## Drafts and confirmation

Everything the assistant writes is a save: a new version in the document's history, recorded as `<role>:<email> via assistant`. A save never changes what visitors see. Over a published document it leaves the live version in place, and the new version waits ahead of it, as with any edit in Studio. See [Drafts, publishing and versions](/docs/content-model#drafts-publishing-and-versions).

In one chat request, **one** document may be written at once, and only when the write creates it or fills values that were empty. Everything else is a proposal that writes nothing until you confirm:

- replacing or removing a value or body text;
- a second document in the same request;
- publishing and deleting;
- Schema.org properties, which are saved in versioned document metadata as a draft;
- `llms.txt`.

A proposal is a card in the chat with what confirming does, the documents, the difference (fields word by word, the body line by line), when it expires, and **Confirm** and **Cancel**. Several proposals in one reply get **Confirm all**. Confirming checks again that every document is as it was when the proposal was made, so a page someone edited in between is refused, not overwritten. A document another person is editing is not written.

## What it will not do

- It has no tools for users, roles, settings, credentials, media, schemas, code or deployments, and none that fetches a URL or sends mail.
- It does not unpublish, archive or restore versions.
- It keeps no conversation on the server. The history lives in Studio and is gone on reload.

## What goes to the provider

The model sees the site's name, base URL, language and locales, the collections and their field names, **your role** (never your name or e-mail), today's date and the page you have open. It also sees what you and the assistant write, and the text of documents it reads. Credentials, settings and other users' names are never sent.

Documents are written by people, and one can contain text addressed to the model. Document text reaches the model inside a frame marked as data, with a fresh random marker for each request. The write policy above bounds the worst an injected instruction can do: a draft you can restore from history, or a proposal you read before confirming. Studio shows the assistant's text without images, and with links restricted to `http`, `https` and relative addresses.

## Providers and credentials

Unless you say otherwise, the assistant uses the AI the site uses, the same one SEO enrichment uses: the one chosen in **Setup › AI provider** while it has a key, else the first AI that has one. With more than one AI turned on, the dialog's top section has a select of them by name (Claude, ChatGPT, Gemini), and what a user picks is remembered in their browser. `assistant.model` gives it a different model, since enrichment writes short strings and is usually set to a small one. `assistant.provider` gives it a different provider: it then runs on that provider's own credential, on `assistant.model` or else that provider's default model, while enrichment keeps its own provider. An unknown provider name stops the boot with an error that lists the providers it could be. Setup › AI provider says which provider the assistant uses.

It works with every provider whose model supports tool use: Anthropic, OpenAI, Gemini, OpenRouter and Ollama. A model without tool use is reported in the chat, not worked around. A model that accepts tools but never calls them answers without acting.

- **In a deployment,** use a provider with an API key: the variable of that provider, such as `KRANTHO_LLM_ANTHROPIC_API_KEY` or `KRANTHO_LLM_OPENAI_API_KEY`, or the key stored for it in Setup. Every provider has a key of its own, and a key is never used for another provider.
- **On your own machine,** the `claude-code` provider runs on your Claude subscription. Run `claude setup-token`, set the token it prints as `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN`, and choose the provider. It works with Haiku only, and refuses to run outside development.

Every provider's wire format is covered by recorded responses in the tests. Anthropic has been run live, through the `claude-code` provider with Haiku: reading, drafting, replacing text with confirmation, SEO checks and publishing. OpenAI has been run live with its own key, on `gpt-4o`: a read uses a tool, a replacement is proposed and saved only when confirmed, publishing is proposed and not done, an instruction planted in a document is not followed, and the prompt is not revealed. Two smaller models, `gpt-4o-mini` and Anthropic's `claude-haiku-4-5`, did not propose a publish for a page that already looked published, and passed the rest; check the model you choose with the live run. The newer OpenAI models were run too: `gpt-5.5`, `gpt-6-sol` and `gpt-6-luna` pass every scenario, `gpt-5-mini` passes all but publishing, and `gpt-6-astra` and `gpt-6.1-sol` cannot use the assistant, because OpenAI offers them function tools only through its Responses API; they work for enrichment. See [model profiles](/docs/package-ai#model-profiles). Gemini, OpenRouter and Ollama have not been run against their live APIs; they are checked against mock models that follow each provider's documentation, including what it refuses. Report a provider that answers differently as a bug. See [@krantho/ai](/docs/package-ai) for each provider's credential.

## Limits and costs

One chat request makes at most `assistant.limits.maxTurns` model calls and stops at `assistant.limits.maxRequestTokens` across all of them, including the model calls the SEO tools make. At `maxToolCalls` it is told to answer without tools. Tool results are cut to `toolResultChars`, and a body the model saw only in part can be replaced only by section. Studio resends the conversation with every message, trimmed to `maxHistoryMessages` and `maxInputChars`, so a long conversation costs more per message. The defaults and their environment names are in [Configuration](/docs/configuration).

Nothing bounds how many requests one user sends. `assistant.role` is the spend control across users.
