import { createStudioRouteHandler } from '@krantho/server-next'
import config from '../../../krantho.config'

export const { GET } = createStudioRouteHandler({ config })
