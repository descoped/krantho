import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

/** Site-wide roles: admin > editor > viewer */
export type Role = 'admin' | 'editor' | 'viewer'

export interface AuthUser {
  id?: string | undefined
  email: string
  name: string
  roles: Role[]
}

interface AuthState {
  isLoading: boolean
  isAuthenticated: boolean
  loginRequired: boolean
  authMode: 'none' | 'token' | 'oidc'
  user: AuthUser | null
  /** Check if the current user has at least the given role */
  hasRole: (required: Role) => boolean
  login: (token: string) => Promise<boolean>
  logout: () => Promise<void>
}

const ROLE_LEVEL: Record<Role, number> = { admin: 3, editor: 2, viewer: 1 }

/** Whether any of the roles reaches the required one */
export function roleAtLeast(roles: readonly Role[], required: Role): boolean {
  return roles.some((r) => (ROLE_LEVEL[r] ?? 0) >= ROLE_LEVEL[required])
}

const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx)
    throw new Error('useAuth must be used within AuthProvider. Wrap your app with <AuthProvider>.')
  return ctx
}

/**
 * Fetch wrapper with auto-refresh on 401.
 *
 * If a request fails with 401, attempts to refresh the session
 * via POST /api/auth/refresh, then retries the original request once.
 */
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  let res = await fetch(url, init)

  if (res.status === 401) {
    // Attempt refresh
    const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' })
    if (refreshRes.ok) {
      // Retry original request
      res = await fetch(url, init)
    }
  }

  return res
}

export function AuthProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loginRequired, setLoginRequired] = useState(false)
  const [authMode, setAuthMode] = useState<'none' | 'token' | 'oidc'>('none')
  const [user, setUser] = useState<AuthUser | null>(null)
  const initialized = useRef(false)

  const checkAuth = useCallback(async (): Promise<void> => {
    // Check capabilities
    const capRes = await fetch('/api/auth/capabilities')
    if (capRes.ok) {
      const caps = (await capRes.json()) as {
        auth_mode: 'none' | 'token' | 'oidc'
        login_required: boolean
      }
      setAuthMode(caps.auth_mode)
      setLoginRequired(caps.login_required)

      if (!caps.login_required) {
        setIsAuthenticated(true)
        setUser({ email: 'anonymous', name: 'Anonymous', roles: ['admin'] })
        setIsLoading(false)
        return
      }
    }

    // Check existing session
    const meRes = await fetch('/api/auth/me')
    if (meRes.ok) {
      const me = (await meRes.json()) as {
        identity?: string
        email?: string
        name?: string
        roles?: Role[]
        id?: string
      }
      setIsAuthenticated(true)
      setUser({
        id: me.id,
        email: me.email ?? me.identity ?? 'unknown',
        name: me.name ?? me.email ?? 'User',
        roles: me.roles ?? ['viewer'],
      })
    } else {
      setIsAuthenticated(false)
      setUser(null)
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    checkAuth().catch(() => setIsLoading(false))
  }, [checkAuth])

  const hasRole = useCallback(
    (required: Role): boolean => {
      if (!user) return false
      return roleAtLeast(user.roles, required)
    },
    [user],
  )

  const login = useCallback(async (token: string): Promise<boolean> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })

    if (res.ok) {
      const data = (await res.json()) as {
        identity?: string
        email?: string
        name?: string
        roles?: Role[]
      }
      setIsAuthenticated(true)
      setUser({
        email: data.email ?? data.identity ?? 'admin',
        name: data.name ?? 'Admin',
        roles: Array.isArray(data.roles) ? (data.roles as Role[]) : ['admin'],
      })
      return true
    }
    return false
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    const res = await fetch('/api/auth/logout', { method: 'POST' })
    setIsAuthenticated(false)
    setUser(null)

    // Redirect to OIDC provider's end-session endpoint to clear SSO
    if (res.ok) {
      const data = (await res.json()) as { ssoLogoutUrl?: string }
      if (data.ssoLogoutUrl) {
        window.location.href = data.ssoLogoutUrl
        return
      }
    }
  }, [])

  return (
    <AuthContext
      value={{
        isLoading,
        isAuthenticated,
        loginRequired,
        authMode,
        user,
        hasRole,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext>
  )
}
