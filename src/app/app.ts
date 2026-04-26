import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { env } from '../config/env.js'
import { checkDatabase } from '../database/prisma.js'
import { getProducts } from '../products/products.service.js'
import { readString } from '../shared/http.js'
import { confirmMockPayment, createPayment, getPayment, normalizeNickname } from '../payments/payments.service.js'

export function createApp() {
  const app = new Hono()

  app.use(
    '*',
    cors({
      origin: env.corsOrigin ?? env.frontendUrl,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    }),
  )

  app.get('/', (c) => c.json({ service: 'xksite-backend', status: 'ok' }))

  app.get('/api/health', async (c) => {
    const database = await checkDatabase()

    return c.json({
      status: database.connected ? 'ok' : 'degraded',
      database,
      provider: {
        name: 'yoomoney',
        mode: 'stub',
      },
    })
  })

  app.get('/api/products', (c) => c.json({ products: getProducts() }))

  app.post('/api/payments', async (c) => {
    const body = await c.req.json().catch(() => undefined)
    const nickname = normalizeNickname(readString(body, 'nickname'))

    if (!nickname) {
      return c.json(
        {
          error: 'INVALID_NICKNAME',
          message: 'Ник должен быть от 3 до 16 символов: латиница, цифры и подчёркивание.',
        },
        400,
      )
    }

    const result = await createPayment({
      nickname,
      productId: readString(body, 'productId'),
    })

    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          message: 'message' in result ? result.message : undefined,
        },
        result.status as ContentfulStatusCode,
      )
    }

    return c.json(
      {
        payment: result.payment,
        provider: result.provider,
      },
      201,
    )
  })

  app.get('/api/payments/:id', async (c) => {
    const result = await getPayment(c.req.param('id'))

    if (!result.ok) {
      return c.json({ error: result.error }, result.status as ContentfulStatusCode)
    }

    return c.json({ payment: result.payment })
  })

  app.get('/api/payments/:id/mock-confirm', async (c) => {
    const result = await confirmMockPayment(c.req.param('id'))

    if (!result.ok) {
      return c.json({ error: result.error }, result.status as ContentfulStatusCode)
    }

    return c.redirect(
      `${env.frontendUrl}/payment?orderId=${result.payment.id}&status=${result.payment.status}`,
    )
  })

  return app
}
