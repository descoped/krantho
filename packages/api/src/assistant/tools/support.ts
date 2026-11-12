import { type ContentDocument, canGetContent } from '@krantho/persistence'
import { changedByFromAuth } from '../../permissions.js'
import type { ApiContext, AuthenticatedUser } from '../../types.js'
import { type PendingAction, signPendingAction } from '../pending-action.js'
import type { AssistantActivity, DocumentRef } from '../protocol.js'
import type { ToolOutcome, ToolRunContext } from './define-tool.js'

/** `changedBy` of an assistant write: the user's own, marked as made through the assistant */
export function assistantChangedBy(user: AuthenticatedUser | undefined): string {
  return `${changedByFromAuth(user)} via assistant`
}

/** The locale a tool acts on: the one asked for, else the site's default */
export function localeOf(ctx: ApiContext, locale: string | undefined): string {
  return locale ?? ctx.config.site.defaultLocale
}

/** The current version of exactly this document in exactly this locale — never a fallback */
export async function exactDocument(
  ctx: ApiContext,
  collection: string,
  slug: string,
  locale: string,
): Promise<ContentDocument | null> {
  if (!canGetContent(ctx.adapter)) return null
  return ctx.adapter.getContent(collection, slug, locale)
}

/** A document's reference, with its version */
export function refOf(doc: ContentDocument): DocumentRef {
  const { collection, slug, locale, version } = doc.meta
  return { collection, slug, locale, version }
}

/** `collection/slug` */
export function pathOf(ref: { collection: string; slug: string }): string {
  return `${ref.collection}/${ref.slug}`
}

/** A failed tool call: the error for the model, and what Studio shows */
export function failure(
  error: string,
  activity: { summary?: string | undefined; documents?: DocumentRef[] | undefined } = {},
): ToolOutcome {
  return {
    result: { ok: false, error },
    activity: {
      status: 'failed',
      summary: activity.summary ?? error,
      documents: activity.documents ?? [],
    },
  }
}

/** The shown proposal: its one-line title, the confirm button and whether it destroys */
export interface ProposalView {
  title: string
  confirmLabel: string
  destructive: boolean
}

/**
 * A pending action: the signed token and what it does go to Studio in the
 * activity only; the model is told a proposal awaits the user, without the token.
 */
export function proposal(
  run: ToolRunContext,
  action: PendingAction,
  view: ProposalView,
  activity: Omit<AssistantActivity, 'id' | 'tool' | 'status' | 'pending'>,
): ToolOutcome {
  const { ctx } = run
  const secret = ctx.config.auth.jwtSecret
  if (!secret || !ctx.auth) throw new Error('Proposals need a signed-in user and a signing secret')
  const signed = signPendingAction(action, ctx.auth.id, secret, ctx.config.assistant.confirmTtlSec)
  return {
    result: {
      ok: true,
      pending: true,
      awaiting: 'user confirmation in the chat',
      note: 'Nothing is written, saved or published until the user confirms.',
      what: view.title,
    },
    activity: {
      ...activity,
      status: 'pending',
      pending: { token: signed.token, kind: action.kind, ...view, expiresAt: signed.expiresAt },
    },
  }
}
