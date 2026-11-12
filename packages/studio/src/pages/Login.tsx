import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.js'
import './login.css'
import { buttonClass } from '../ui/button.js'

interface OidcProvider {
  name: string
  login_url: string
}

function isOidcProvider(value: unknown): value is OidcProvider {
  if (typeof value !== 'object' || value === null) return false
  const { name, login_url } = value as { name?: unknown; login_url?: unknown }
  return typeof name === 'string' && typeof login_url === 'string'
}

/** The sign-in providers a capabilities answer lists; none when it lists none or is malformed */
function oidcProvidersOf(body: unknown): OidcProvider[] {
  const providers = (body as { capabilities?: { oidc_providers?: unknown } } | null)?.capabilities
    ?.oidc_providers
  return Array.isArray(providers) ? providers.filter(isOidcProvider) : []
}

export function Login(): React.ReactElement {
  const { login, authMode } = useAuth()
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [oidcProviders, setOidcProviders] = useState<OidcProvider[]>([])

  // Focus the field as it mounts
  const focusOnMount = useCallback((input: HTMLInputElement | null): void => {
    input?.focus()
  }, [])

  // Check for error in URL (from OIDC callback redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlError = params.get('error')
    if (urlError) {
      setError(urlError)
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Fetch OIDC providers from capabilities
  useEffect(() => {
    if (authMode === 'oidc') {
      fetch('/api/auth/capabilities')
        .then((res) => res.json() as Promise<unknown>)
        .then((body) => {
          setOidcProviders(oidcProvidersOf(body))
        })
        .catch(() => {})
    }
  }, [authMode])

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!token.trim()) return

    setIsSubmitting(true)
    setError(null)

    const success = await login(token.trim())
    if (!success) {
      setError('Invalid access token')
    }
    setIsSubmitting(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">krantho</h1>
        <p className="login-subtitle">
          {authMode === 'token' ? 'Enter your access token to continue' : 'Sign in to continue'}
        </p>

        {error && <div className="login-error">{error}</div>}

        {authMode === 'token' && (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="field">
              <label className="field-label" htmlFor="token">
                Access Token
              </label>
              <input
                id="token"
                type="password"
                className="field-input"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter token"
                ref={focusOnMount}
              />
            </div>

            <button
              type="submit"
              className={buttonClass('primary', 'md', 'login-btn')}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {authMode === 'oidc' && (
          <div className="login-oidc">
            {oidcProviders.map((provider) => (
              <a
                key={provider.login_url}
                href={provider.login_url}
                className={buttonClass('primary', 'md', 'login-btn')}
              >
                Sign in with {provider.name}
              </a>
            ))}
            {oidcProviders.length === 0 && (
              <p className="login-subtitle">No OIDC providers configured</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
