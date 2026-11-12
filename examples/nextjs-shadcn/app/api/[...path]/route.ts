import { createApiRouteHandlers } from '@krantho/server-next'
import config from '../../../krantho.config'
import { collections } from '../../../krantho.collections'

export const { GET, POST, PUT, DELETE } = createApiRouteHandlers({
  config,
  collections,
})
