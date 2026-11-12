/** Webhook delivery from the API */
export interface WebhookDelivery {
  id: number
  url: string
  event: string
  status: number | null
  attempts: number
  nextRetryAt: string | null
  createdAt: string
  deliveredAt: string | null
}

/** What took a checkpoint: someone, or Studio before a restore, the server before a migration or an import */
export type CheckpointTrigger = 'manual' | 'pre-migration' | 'pre-restore' | 'pre-import'

/** A checkpoint as `GET /api/checkpoints` lists it: a point in time the content store can be rewound to */
export interface CheckpointInfo {
  id: number
  version: number
  name: string | null
  trigger: CheckpointTrigger
  createdAt: string
}

/** A user account as `GET /api/users` lists it */
export interface UserAccount {
  id: string
  email: string | null
  name: string | null
  roles: Array<'admin' | 'editor' | 'viewer'>
  isActive: boolean
  /** The sign-in provider that created the account; null for one created here */
  oidcIssuer: string | null
  createdAt: string
  updatedAt: string
}
