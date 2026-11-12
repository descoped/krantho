/** Role in the krantho permission system */
export type Role = 'admin' | 'editor' | 'viewer'

/** A user record in the database */
export interface UserRecord {
  id: string
  email: string | null
  name: string | null
  roles: Role[]
  oidcSubject: string | null
  oidcIssuer: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/** Data for creating a new user */
export interface CreateUserData {
  email: string | null
  name: string | null
  roles: Role[]
  oidcSubject?: string | undefined
  oidcIssuer?: string | undefined
}

/** Data for updating a user */
export interface UpdateUserData {
  email?: string | undefined
  name?: string | undefined
  roles?: Role[] | undefined
  isActive?: boolean | undefined
  oidcSubject?: string | undefined
  oidcIssuer?: string | undefined
}

/** A refresh token record */
export interface RefreshTokenRecord {
  id: string
  userId: string
  tokenHash: string
  expiresAt: string
  createdAt: string
}

/** Per-collection permission override */
export interface UserPermission {
  userId: string
  collection: string
  role: Role
}

/** Auth adapter interface — users, refresh tokens, permissions */
export interface IAuthAdapter {
  // --- Users ---
  /** Create a user and return the created record */
  createUser(data: CreateUserData): Promise<UserRecord>
  /** Get a user by ID */
  getUser(id: string): Promise<UserRecord | null>
  /** Get a user by email */
  getUserByEmail(email: string): Promise<UserRecord | null>
  /** Get a user by OIDC identity (issuer + subject) */
  getUserByOidc(issuer: string, subject: string): Promise<UserRecord | null>
  /** List all users */
  listUsers(): Promise<UserRecord[]>
  /** Update a user */
  updateUser(id: string, data: UpdateUserData): Promise<UserRecord | null>
  /** Delete a user (cascades refresh tokens and permissions) */
  deleteUser(id: string): Promise<boolean>

  // --- Refresh Tokens ---
  /** Store a refresh token hash for a user */
  createRefreshToken(userId: string, tokenHash: string, expiresAt: string): Promise<string>
  /** Find a refresh token by hash */
  getRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>
  /** Delete a refresh token by ID (used during rotation) */
  deleteRefreshToken(id: string): Promise<void>
  /** Delete all refresh tokens for a user (used on logout/deactivation) */
  deleteUserRefreshTokens(userId: string): Promise<void>
  /** Delete expired refresh tokens (cleanup on startup) */
  deleteExpiredRefreshTokens(): Promise<number>

  // --- Per-Collection Permissions ---
  /** Get all permission overrides for a user */
  getUserPermissions(userId: string): Promise<UserPermission[]>
  /** Set a per-collection permission override (upsert) */
  setUserPermission(userId: string, collection: string, role: Role): Promise<void>
  /** Delete a per-collection permission override */
  deleteUserPermission(userId: string, collection: string): Promise<boolean>
}
