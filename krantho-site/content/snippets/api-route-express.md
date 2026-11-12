---
title: Wire the API and Studio (Express)
sample: api-route
stack: express
filename: server.ts
language: ts
order: 3
status: published
---

```ts
import express from 'express'
import { createStudioServer, createHandler, toWebRequest, writeResponseHeaders } from '@krantho/server-node'
import config from './krantho.config'
import { collections } from './krantho.collections'

const api = createHandler({ config, collections, sitePreview: 'signed-url' })
const studio = createStudioServer(config)
const app = express()

async function send(res: express.Response, response: Response): Promise<void> {
  res.status(response.status)
  writeResponseHeaders(res, response)
  res.end(Buffer.from(await response.arrayBuffer()))
}

const owns = (prefix: string, path: string) => path === prefix || path.startsWith(`${prefix}/`)

// Mounted without a path: the handler routes on the full URL
app.use(async (req, res, next) => {
  if (owns('/api', req.path)) return send(res, await api.handle(await toWebRequest(req)))
  if (!owns('/studio', req.path)) return next()
  const url = new URL(`http://localhost${req.originalUrl}`)
  return send(res, studio({ url, cookie: req.headers.cookie }))
})
```
