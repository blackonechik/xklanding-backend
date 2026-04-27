import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import { isDatabaseConfigured } from '../database/prisma.js'
import { getProductById } from '../products/products.service.js'
import {
  createYookassaPayment,
  isYookassaConfigured,
} from '../providers/yookassa/yookassa.client.js'
import { applyLifePurchase, findLimitedLivesPlayerByName } from './lives.repository.js'
import {
  findPaymentById,
  findStoredPaymentByProviderPaymentId,
  insertPayment,
  markPaymentPaid,
  markPaymentPaidIfPending,
} from './payments.repository.js'

export function normalizeNickname(value: string | undefined) {
  const nickname = value?.trim()

  if (!nickname || !/^[A-Za-z0-9_]{3,16}$/.test(nickname)) {
    return undefined
  }

  return nickname
}

export function normalizeContactEmail(value: string | undefined) {
  const email = value?.trim()

  if (!email || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return undefined
  }

  return email
}

export function normalizeTelegram(value: string | undefined) {
  const telegram = value?.trim()

  if (!telegram || !/^@?[A-Za-z0-9_]{5,32}$/.test(telegram)) {
    return undefined
  }

  return telegram.startsWith('@') ? telegram : `@${telegram}`
}

export type YookassaWebhookBody = {
  event?: string
  object?: {
    id?: string
    status?: string
    metadata?: Record<string, string>
  }
}

export async function createPayment(params: {
  nickname: string
  contactEmail: string
  contactTelegram: string
  productId: string | undefined
}) {
  if (!isDatabaseConfigured()) {
    return {
      ok: false as const,
      status: 503,
      error: 'DATABASE_NOT_CONFIGURED',
      message: 'Укажите DATABASE_URL для подключения PostgreSQL.',
    }
  }

  const product = getProductById(params.productId)

  if (!product) {
    return {
      ok: false as const,
      status: 400,
      error: 'INVALID_PRODUCT',
      message: 'Выберите товар для оплаты.',
    }
  }

  if (!isYookassaConfigured()) {
    return {
      ok: false as const,
      status: 503,
      error: 'YOOKASSA_NOT_CONFIGURED',
      message: 'ЮKassa не настроена: укажите YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.',
    }
  }

  let lifePlayer:
    | {
        playerUuid: string
        playerName: string
      }
    | undefined

  if (product.id === 'life') {
    const player = await findLimitedLivesPlayerByName(params.nickname)

    if (!player) {
      return {
        ok: false as const,
        status: 409,
        error: 'PLAYER_NOT_FOUND',
        message: 'Игрок ещё ни разу не заходил на сервер. Начисление жизни невозможно.',
      }
    }

    lifePlayer = {
      playerUuid: player.playerUuid,
      playerName: player.playerName,
    }
  }

  const id = randomUUID()
  const returnUrl = `${env.frontendUrl}/payment/pending?orderId=${id}`

  let providerPayment: {
    provider: string
    providerPaymentId: string
    confirmationUrl: string
  }

  try {
    providerPayment = await createYookassaPayment({
      orderId: id,
      amountRub: product.amountRub,
      description: `${product.name} для ${params.nickname}`,
      returnUrl,
      metadata: {
        localPaymentId: id,
        productId: product.id,
        nickname: params.nickname,
        playerUuid: lifePlayer?.playerUuid ?? '',
        playerName: lifePlayer?.playerName ?? '',
      },
    })
  } catch (error) {
    return {
      ok: false as const,
      status: 502,
      error: 'YOOKASSA_CREATE_FAILED',
      message:
        error instanceof Error
          ? `Не удалось создать платёж в ЮKassa: ${error.message}`
          : 'Не удалось создать платёж в ЮKassa.',
    }
  }

  const payment = await insertPayment({
    id,
    nickname: params.nickname,
    contactEmail: params.contactEmail,
    contactTelegram: params.contactTelegram,
    product,
    provider: providerPayment.provider,
    providerPaymentId: providerPayment.providerPaymentId,
    confirmationUrl: providerPayment.confirmationUrl,
    metadata: {
      providerMode: 'live',
      playerUuid: lifePlayer?.playerUuid ?? '',
      playerName: lifePlayer?.playerName ?? '',
    },
  })

  return {
    ok: true as const,
    payment,
    provider: {
      name: 'yookassa',
      mode: 'live',
      confirmationUrl: payment.confirmationUrl,
    },
  }
}

export async function getPayment(id: string) {
  if (!isDatabaseConfigured()) {
    return {
      ok: false as const,
      status: 503,
      error: 'DATABASE_NOT_CONFIGURED',
    }
  }

  const payment = await findPaymentById(id)

  if (!payment) {
    return {
      ok: false as const,
      status: 404,
      error: 'PAYMENT_NOT_FOUND',
    }
  }

  return {
    ok: true as const,
    payment,
  }
}

export async function confirmMockPayment(id: string) {
  if (isYookassaConfigured()) {
    return {
      ok: false as const,
      status: 410,
      error: 'MOCK_CONFIRM_DISABLED',
    }
  }

  if (!isDatabaseConfigured()) {
    return {
      ok: false as const,
      status: 503,
      error: 'DATABASE_NOT_CONFIGURED',
    }
  }

  const payment = await markPaymentPaid(id)

  if (!payment) {
    return {
      ok: false as const,
      status: 404,
      error: 'PAYMENT_NOT_FOUND',
    }
  }

  return {
    ok: true as const,
    payment,
  }
}

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') {
    return undefined
  }

  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

export async function handleYookassaWebhook(payload: YookassaWebhookBody) {
  if (!isDatabaseConfigured()) {
    return {
      ok: false as const,
      status: 503,
      error: 'DATABASE_NOT_CONFIGURED',
    }
  }

  if (payload.event !== 'payment.succeeded' || payload.object?.status !== 'succeeded') {
    return {
      ok: true as const,
      applied: false,
      ignored: true,
    }
  }

  const providerPaymentId = payload.object.id

  if (!providerPaymentId) {
    return {
      ok: false as const,
      status: 400,
      error: 'INVALID_PROVIDER_PAYMENT_ID',
    }
  }

  const storedPayment = await findStoredPaymentByProviderPaymentId(providerPaymentId)

  if (!storedPayment) {
    return {
      ok: true as const,
      applied: false,
      ignored: true,
    }
  }

  const paymentStatus = await markPaymentPaidIfPending(storedPayment.id)

  if (paymentStatus === 'not-found') {
    return {
      ok: false as const,
      status: 404,
      error: 'PAYMENT_NOT_FOUND',
    }
  }

  if (storedPayment.productId !== 'life') {
    return {
      ok: true as const,
      applied: paymentStatus !== 'not-changed',
      ignored: false,
    }
  }

  const metadata =
    storedPayment.metadata &&
    typeof storedPayment.metadata === 'object' &&
    !Array.isArray(storedPayment.metadata)
      ? (storedPayment.metadata as Record<string, unknown>)
      : {}

  const playerUuid =
    readMetadataString(metadata, 'playerUuid') ??
    readMetadataString(payload.object.metadata, 'playerUuid')
  const playerName =
    readMetadataString(metadata, 'playerName') ??
    readMetadataString(payload.object.metadata, 'playerName') ??
    storedPayment.nickname

  if (!playerUuid) {
    return {
      ok: false as const,
      status: 409,
      error: 'PLAYER_UUID_NOT_FOUND',
    }
  }

  const lifeResult = await applyLifePurchase({
    paymentId: storedPayment.id,
    providerPaymentId,
    playerUuid,
    playerName,
    productId: storedPayment.productId,
    livesDelta: 1,
    defaultLives: env.livesDefault,
    maxLives: env.livesMax,
  })

  if (!lifeResult.ok) {
    return {
      ok: false as const,
      status: 409,
      error: lifeResult.reason,
    }
  }

  return {
    ok: true as const,
    applied: !lifeResult.alreadyApplied,
    ignored: false,
  }
}
