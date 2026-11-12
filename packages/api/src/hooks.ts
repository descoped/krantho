/** Data passed to before-save hooks */
export interface BeforeSaveContext {
  collection: string
  slug: string
  fields: Record<string, unknown>
  metadata: Record<string, Record<string, unknown>>
  body: string
  isNew: boolean
}

/** Data passed to after-mutation hooks */
export interface AfterMutationContext {
  collection: string
  slug: string
}

/** Lifecycle hooks for content operations */
export interface ContentHooks {
  /** Fires before content is created or updated. Can modify fields, metadata and body. Throw to abort. */
  beforeSave?: ((ctx: BeforeSaveContext) => Promise<BeforeSaveContext | void>) | undefined
  /** Fires after content is created */
  afterCreate?: ((ctx: AfterMutationContext) => Promise<void>) | undefined
  /** Fires after content is updated */
  afterUpdate?: ((ctx: AfterMutationContext) => Promise<void>) | undefined
  /** Fires after content status changes to published */
  afterPublish?: ((ctx: AfterMutationContext) => Promise<void>) | undefined
  /** Fires before content is deleted. Throw to abort. */
  beforeDelete?: ((ctx: AfterMutationContext) => Promise<void>) | undefined
  /** Fires after content is deleted */
  afterDelete?: ((ctx: AfterMutationContext) => Promise<void>) | undefined
}

/** Execute a before-save hook, returning possibly modified context */
export async function runBeforeSave(
  hooks: ContentHooks | undefined,
  ctx: BeforeSaveContext,
): Promise<BeforeSaveContext> {
  if (!hooks?.beforeSave) return ctx
  const result = await hooks.beforeSave(ctx)
  return result ?? ctx
}

/** Execute an after-mutation hook (fire and forget on error) */
export async function runAfterHook(
  fn: ((ctx: AfterMutationContext) => Promise<void>) | undefined,
  ctx: AfterMutationContext,
): Promise<void> {
  if (!fn) return
  try {
    await fn(ctx)
  } catch (err: unknown) {
    console.warn(`[hooks] Hook failed for ${ctx.collection}/${ctx.slug}:`, err)
  }
}
