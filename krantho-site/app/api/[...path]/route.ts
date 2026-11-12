import { createApiRouteHandlers } from '@krantho/server-next'
import config from '../../../krantho.config'
import { collections } from '../../../krantho.collections'

// Headroom on a serverless host for first-boot migrations and content import
export const maxDuration = 60

export const { GET, POST, PUT, DELETE } = createApiRouteHandlers({
  config,
  collections,
})
