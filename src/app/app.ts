import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { registerAccountRoutes } from '../account/account.routes.js'
import { getAdminDashboard } from '../admin/admin.service.js'
import { env } from '../config/env.js'
import { checkDatabase } from '../database/prisma.js'
import { isYookassaConfigured } from '../providers/yookassa/yookassa.client.js'
import { createPromoCode, listPromoCodes, updatePromoCode } from '../promocodes/promocodes.service.js'
import { getProducts } from '../products/products.service.js'
import { readString } from '../shared/http.js'
import {
  confirmMockPayment,
  createPayment,
  getPayment,
  handleYookassaWebhook,
  normalizeContactEmail,
  normalizeNickname,
  normalizeTelegram,
} from '../payments/payments.service.js'
import type { YookassaWebhookBody } from '../payments/payments.service.js'

export function createApp() {
  const app = new Hono()

  app.use(
    '*',
    cors({
      origin: env.corsOrigin ?? env.frontendUrl,
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'x-admin-token'],
      credentials: true,
    }),
  )

  function checkAdmin(c: Context) {
    if (!env.adminToken) {
      return c.json({ error: 'ADMIN_NOT_CONFIGURED' }, 503)
    }

    const token = c.req.header('x-admin-token')

    if (token !== env.adminToken) {
      return c.json({ error: 'UNAUTHORIZED' }, 401)
    }

    return undefined
  }

  function readOptionalNumber(body: unknown, key: string) {
    if (!body || typeof body !== 'object' || !(key in body)) {
      return undefined
    }

    const value = (body as Record<string, unknown>)[key]

    if (value === null || value === '') {
      return null
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : Number.NaN
    }

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) {
        return null
      }

      const num = Number(trimmed)
      return Number.isFinite(num) ? num : Number.NaN
    }

    return Number.NaN
  }

  function readOptionalBoolean(body: unknown, key: string) {
    if (!body || typeof body !== 'object' || !(key in body)) {
      return undefined
    }

    const value = (body as Record<string, unknown>)[key]

    if (typeof value === 'boolean') {
      return value
    }

    if (typeof value === 'string') {
      if (value === 'true') {
        return true
      }

      if (value === 'false') {
        return false
      }
    }

    return undefined
  }

  app.get('/', (c) => c.json({ service: 'xksite-backend', status: 'ok' }))

  app.get('/api/health', async (c) => {
    const database = await checkDatabase()

    return c.json({
      status: database.connected ? 'ok' : 'degraded',
      database,
      provider: {
        name: 'yookassa',
        mode: isYookassaConfigured() ? 'live' : 'not-configured',
      },
    })
  })

  app.get('/api/products', (c) => c.json({ products: getProducts() }))

  registerAccountRoutes(app)

  app.post('/api/payments', async (c) => {
    const body = await c.req.json().catch(() => undefined)
    const nickname = normalizeNickname(readString(body, 'nickname'))
    const contactEmail = normalizeContactEmail(readString(body, 'email'))
    const contactTelegram = normalizeTelegram(readString(body, 'telegram'))

    if (!nickname) {
      return c.json(
        {
          error: 'INVALID_NICKNAME',
          message: 'Ник должен быть от 3 до 16 символов: латиница, цифры и подчёркивание.',
        },
        400,
      )
    }

    if (!contactEmail) {
      return c.json(
        {
          error: 'INVALID_EMAIL',
          message: 'Укажите корректную почту для связи с администратором.',
        },
        400,
      )
    }

    if (!contactTelegram) {
      return c.json(
        {
          error: 'INVALID_TELEGRAM',
          message: 'Укажите Telegram username: от 5 до 32 символов, можно с @ в начале.',
        },
        400,
      )
    }

    const result = await createPayment({
      nickname,
      contactEmail,
      contactTelegram,
      productId: readString(body, 'productId'),
      promoCode: readString(body, 'promoCode'),
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

    const statusPath = result.payment.status === 'paid' ? 'success' : 'failed'
    return c.redirect(`${env.frontendUrl}/payment/${statusPath}?orderId=${result.payment.id}`)
  })

  app.post('/api/payments/yookassa/webhook', async (c) => {
    if (env.yookassaWebhookSecret) {
      const auth = c.req.header('Authorization')
      const expected = `Bearer ${env.yookassaWebhookSecret}`

      if (auth !== expected) {
        return c.json({ error: 'UNAUTHORIZED' }, 401)
      }
    }

    const body = await c.req.json().catch(() => undefined)
    const payload: YookassaWebhookBody =
      body && typeof body === 'object' ? (body as YookassaWebhookBody) : {}
    const result = await handleYookassaWebhook(payload)

    if (!result.ok) {
      return c.json({ error: result.error }, result.status as ContentfulStatusCode)
    }

    return c.json({ ok: true, applied: result.applied, ignored: result.ignored })
  })

  app.get('/api/admin/dashboard', async (c) => {
    const authError = checkAdmin(c)
    if (authError) {
      return authError
    }

    const dashboard = await getAdminDashboard()
    return c.json(dashboard)
  })

  app.get('/api/admin/promocodes', async (c) => {
    const authError = checkAdmin(c)
    if (authError) {
      return authError
    }

    const promoCodes = await listPromoCodes()
    return c.json({ promoCodes })
  })

  app.post('/api/admin/promocodes', async (c) => {
    const authError = checkAdmin(c)
    if (authError) {
      return authError
    }

    const body = await c.req.json().catch(() => undefined)
    const result = await createPromoCode({
      code: readString(body, 'code'),
      discountType: readString(body, 'discountType'),
      discountValue: readOptionalNumber(body, 'discountValue') ?? undefined,
      maxUses: readOptionalNumber(body, 'maxUses') ?? undefined,
      maxUsesPerNickname: readOptionalNumber(body, 'maxUsesPerNickname') ?? undefined,
      startsAt: readString(body, 'startsAt'),
      endsAt: readString(body, 'endsAt'),
      isActive: readOptionalBoolean(body, 'isActive'),
    })

    if (!result.ok) {
      return c.json({ error: result.error, message: result.message }, result.status as ContentfulStatusCode)
    }

    return c.json({ promoCode: result.promo }, 201)
  })

  app.patch('/api/admin/promocodes/:id', async (c) => {
    const authError = checkAdmin(c)
    if (authError) {
      return authError
    }

    const body = await c.req.json().catch(() => undefined)
    const result = await updatePromoCode({
      id: c.req.param('id'),
      maxUses: readOptionalNumber(body, 'maxUses') ?? undefined,
      maxUsesPerNickname: readOptionalNumber(body, 'maxUsesPerNickname') ?? undefined,
      isActive: readOptionalBoolean(body, 'isActive'),
      startsAt: readString(body, 'startsAt'),
      endsAt: readString(body, 'endsAt'),
    })

    if (!result.ok) {
      return c.json({ error: result.error, message: result.message }, result.status as ContentfulStatusCode)
    }

    return c.json({ promoCode: result.promo })
  })

  return app
}
