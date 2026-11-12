import { PROVIDER_PRESETS, type ProviderPreset } from './providers.js'
import type { Provider } from './types.js'

/** A reasoning effort an OpenAI-compatible provider accepts */
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

/**
 * How requests to one model are shaped, beyond the provider's own preset: what a model
 * accepts differs by model, not by provider. Defaults come from {@link DEFAULT_MODEL_PROFILES};
 * a site overrides one model with `llm.profiles`.
 */
export interface ModelProfile {
  /**
   * The reasoning effort to ask for, or `default` to leave it to the model. The assistant and
   * enrichment want an answer, not a deliberation, so a reasoning model is asked for the
   * lowest effort it accepts. Read by the providers that name a `reasoningParam`.
   */
  reasoningEffort: ReasoningEffort | 'default'
  /**
   * Output tokens added to a request's cap for the thinking a model spends before it answers:
   * a reasoning model counts that thinking against the cap, and a cap spent on it returns no text.
   */
  reasoningHeadroom: number
  /** The sampling temperature to send; unset sends none, the model's own default */
  temperature?: number | undefined
  /**
   * The effort comes from a default that was not checked against the provider's API: a request
   * the provider refuses over it is sent again without it, and the model is not asked again.
   */
  refusable: boolean
}

/** The parts of a profile a site sets; the rest stay as the default gives them */
export interface ModelProfileInput {
  reasoningEffort?: ReasoningEffort | 'default' | undefined
  reasoningHeadroom?: number | undefined
  temperature?: number | undefined
}

/** What a model with no matching profile is sent: nothing beyond the provider's own request */
const PLAIN: ModelProfile = { reasoningEffort: 'default', reasoningHeadroom: 0, refusable: false }

interface ProfileRule {
  provider: Provider
  /** Matches the model id */
  model: RegExp
  profile: ModelProfileInput
  /** Checked against the provider's API with a real key; otherwise taken from its documentation */
  verified: boolean
}

/**
 * Where reasoning is asked for. A short answer should be an answer, not a deliberation, so a
 * model is asked for the lowest effort its family accepts, and a model that still reasons at
 * its lowest gets headroom in the output cap. A model no rule matches (gpt-4o, a future
 * family) is sent no reasoning setting. The list is point-in-time: a family a rule gets wrong
 * is set right in `llm.profiles`.
 *
 * Rules with `verified: true` were checked against the provider's API. These are the `openai`
 * ones: `minimal` for gpt-5 and its mini and nano, `none` from gpt-5.1 and for gpt-6-sol and
 * gpt-6-luna, `low` for the o-series and the rest of gpt-6, which cannot reason less, and the
 * o-series reasons at length even at `low`. The `-pro` and `-codex` models are served by the
 * Responses API only, so no setting here reaches them.
 *
 * Rules with `verified: false` come from the provider's documentation, for its
 * OpenAI-compatible endpoint's `reasoning_effort`. Gemini 2.5 Flash can turn thinking off,
 * 2.5 Pro and Gemini 3 cannot. Ollama maps `none` to no thinking for the models that allow it,
 * and gpt-oss only to `low`. An OpenRouter model id (`vendor/model`) takes its vendor's rule.
 */
export const DEFAULT_MODEL_PROFILES: readonly ProfileRule[] = [
  {
    provider: 'openai',
    model: /^gpt-5(-mini|-nano)?(-\d{4}-\d{2}-\d{2})?$/,
    profile: { reasoningEffort: 'minimal' },
    verified: true,
  },
  {
    provider: 'openai',
    model: /^gpt-5\.\d/,
    profile: { reasoningEffort: 'none' },
    verified: true,
  },
  {
    provider: 'openai',
    model: /^gpt-6-(sol|luna)/,
    profile: { reasoningEffort: 'none' },
    verified: true,
  },
  {
    provider: 'openai',
    model: /^gpt-6/,
    profile: { reasoningEffort: 'low', reasoningHeadroom: 1024 },
    verified: true,
  },
  {
    provider: 'openai',
    model: /^o\d/,
    profile: { reasoningEffort: 'low', reasoningHeadroom: 4096 },
    verified: true,
  },
  {
    provider: 'gemini',
    model: /^gemini-2\.5-flash/,
    profile: { reasoningEffort: 'none' },
    verified: false,
  },
  {
    provider: 'gemini',
    model: /^gemini-2\.5-pro/,
    profile: { reasoningEffort: 'low', reasoningHeadroom: 1024 },
    verified: false,
  },
  {
    provider: 'gemini',
    model: /^gemini-3(\.[56])?-flash/,
    profile: { reasoningEffort: 'minimal' },
    verified: false,
  },
  {
    provider: 'gemini',
    model: /^gemini-3\.[78]-flash/,
    profile: { reasoningEffort: 'low', reasoningHeadroom: 512 },
    verified: false,
  },
  {
    provider: 'gemini',
    model: /^gemini-3(\.\d)?-pro/,
    profile: { reasoningEffort: 'low', reasoningHeadroom: 1024 },
    verified: false,
  },
  {
    provider: 'ollama',
    model: /^(qwen3|gemma4)/,
    profile: { reasoningEffort: 'none' },
    verified: false,
  },
  {
    provider: 'ollama',
    model: /^gpt-oss/,
    profile: { reasoningEffort: 'low', reasoningHeadroom: 2048 },
    verified: false,
  },
]

/** The vendor whose rules an OpenRouter model id (`vendor/model`) takes */
const ROUTED_VENDORS: Readonly<Record<string, Provider>> = { openai: 'openai', google: 'gemini' }

/** The rule for a model, and whether it was found through OpenRouter's routing */
function ruleFor(
  provider: Provider,
  model: string,
): { rule: ProfileRule; routed: boolean } | undefined {
  const own = DEFAULT_MODEL_PROFILES.find((r) => r.provider === provider && r.model.test(model))
  if (own) return { rule: own, routed: false }
  if (provider !== 'openrouter') return undefined
  const [vendor, ...rest] = model.split('/')
  const vendorProvider = vendor === undefined ? undefined : ROUTED_VENDORS[vendor]
  if (vendorProvider === undefined || rest.length === 0) return undefined
  const id = rest.join('/')
  const routed = DEFAULT_MODEL_PROFILES.find(
    (r) => r.provider === vendorProvider && r.model.test(id),
  )
  return routed ? { rule: routed, routed: true } : undefined
}

/**
 * The profile for one model: the default rule that matches it, with the site's override for
 * that model id over it. Throws when an override sets what the provider's wire cannot carry.
 */
export function resolveModelProfile(
  provider: Provider,
  model: string,
  overrides: Readonly<Record<string, ModelProfileInput>> = {},
): ModelProfile {
  const found = ruleFor(provider, model)
  const base: ModelProfile = found
    ? {
        reasoningEffort: found.rule.profile.reasoningEffort ?? PLAIN.reasoningEffort,
        reasoningHeadroom: found.rule.profile.reasoningHeadroom ?? PLAIN.reasoningHeadroom,
        refusable: !found.rule.verified || found.routed,
      }
    : PLAIN
  const override = overrides[model]
  if (!override) return base
  checkOverride(provider, model, override)
  return {
    reasoningEffort: override.reasoningEffort ?? base.reasoningEffort,
    reasoningHeadroom: override.reasoningHeadroom ?? base.reasoningHeadroom,
    temperature: override.temperature ?? base.temperature,
    refusable: override.reasoningEffort === undefined && base.refusable,
  }
}

function checkOverride(provider: Provider, model: string, override: ModelProfileInput): void {
  const name = `llm.profiles["${model}"]`
  const preset = PROVIDER_PRESETS[provider]
  if (preset.format !== 'openai') {
    throw new Error(
      `${name} does not apply to the ${provider} provider, which only takes the OpenAI-compatible settings`,
    )
  }
  if (override.reasoningEffort !== undefined && preset.reasoningParam === undefined) {
    throw new Error(`${name}.reasoningEffort is not read by the ${provider} provider`)
  }
}

/** Models whose provider refused the reasoning setting asked for: they are not asked again */
const refused = new Set<string>()

/** Whether a request to `key` (`baseUrl|model`) is to carry the reasoning setting */
function asksReasoning(profile: ModelProfile, key: string): boolean {
  return profile.reasoningEffort !== 'default' && !refused.has(key)
}

/**
 * Whether a provider's refusal is of the reasoning setting a request carried, so the request
 * goes again without it: the setting came from an unchecked default, and the error names it.
 */
export function refusesReasoning(
  profile: ModelProfile,
  key: string,
  status: number | undefined,
  message: string,
): boolean {
  if (!profile.refusable || !asksReasoning(profile, key)) return false
  if (status !== 400 && status !== 422) return false
  if (!/reasoning|thinking/i.test(message)) return false
  refused.add(key)
  return true
}

/** What shapes one request to a model */
export interface ShapeOptions {
  profile: ModelProfile
  maxTokensParam: ProviderPreset['maxTokensParam']
  reasoningParam: ProviderPreset['reasoningParam']
  /** `baseUrl|model`: what a refusal is remembered under */
  key: string
  maxTokens: number | undefined
}

/**
 * Put the profile's settings on a request body: the output cap with its headroom, the
 * reasoning effort in the shape the provider reads, and the temperature.
 */
export function shapeRequest(body: Record<string, unknown>, o: ShapeOptions): void {
  const { profile } = o
  if (o.maxTokens !== undefined) body[o.maxTokensParam] = o.maxTokens + profile.reasoningHeadroom
  if (o.reasoningParam !== undefined && asksReasoning(profile, o.key)) {
    if (o.reasoningParam === 'reasoning') body.reasoning = { effort: profile.reasoningEffort }
    else body.reasoning_effort = profile.reasoningEffort
  }
  if (profile.temperature !== undefined) body.temperature = profile.temperature
}
