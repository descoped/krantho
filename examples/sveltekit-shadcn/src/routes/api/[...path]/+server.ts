import { createApiHandlers } from '@krantho/server-sveltekit'
import config from '../../../../krantho.config'
import { collections } from '../../../../krantho.collections'

export const { GET, POST, PUT, DELETE } = createApiHandlers({
  config,
  collections,
  // Editors preview drafts through a short-lived link signed with auth.jwtSecret
  sitePreview: 'signed-url',
})
