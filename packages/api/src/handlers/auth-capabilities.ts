import type { ApiHandler } from '../types.js'

/** GET /api/auth/capabilities — public, returns auth mode and capabilities */
export const authCapabilities: ApiHandler = async (_req, ctx) => {
  const mode = ctx.config.auth.mode

  return {
    status: 200,
    body: {
      auth_mode: mode,
      login_required: mode !== 'none',
      capabilities: {
        password_management: false,
        role_management: mode !== 'none',
        self_registration: false,
        user_management: mode !== 'none' && ctx.authAdapter !== undefined,
        oidc_providers:
          mode === 'oidc' ? [{ name: 'OIDC Provider', login_url: '/api/auth/login/oidc' }] : [],
      },
    },
  }
}
