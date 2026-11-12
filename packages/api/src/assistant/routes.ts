import type { ApiRouter } from '../router.js'
import { assistantChat } from './chat-handler.js'
import { assistantConfirm } from './confirm-handler.js'
import { assistantStatus } from './status-handler.js'

/** The assistant's routes — registered only when `assistant.enabled` */
export function registerAssistantRoutes(router: ApiRouter): void {
  router.add('GET', '/api/assistant', assistantStatus)
  router.add('POST', '/api/assistant/chat', assistantChat)
  router.add('POST', '/api/assistant/confirm', assistantConfirm)
}
