import { serve } from '@hono/node-server'
import { createApp } from './app/app.js'
import { env } from './config/env.js'

const app = createApp()

serve(
  {
    fetch: app.fetch,
    port: env.port,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`)
  },
)
