import { randomUUID } from 'node:crypto'
import { isDatabaseConfigured } from '../database/prisma.js'
import { getProductById } from '../products/products.service.js'
import { createYooMoneyStubPayment } from '../providers/yoomoney/yoomoney.stub.js'
import { findPaymentById, insertPayment, markPaymentPaid } from './payments.repository.js'

export function normalizeNickname(value: string | undefined) {
  const nickname = value?.trim()

  if (!nickname || !/^[A-Za-z0-9_]{3,16}$/.test(nickname)) {
    return undefined
  }

  return nickname
}

export async function createPayment(params: {
  nickname: string
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

  const id = randomUUID()
  const providerPayment = createYooMoneyStubPayment(id)
  const payment = await insertPayment({
    id,
    nickname: params.nickname,
    product,
    provider: providerPayment.provider,
    providerPaymentId: providerPayment.providerPaymentId,
    confirmationUrl: providerPayment.confirmationUrl,
  })

  return {
    ok: true as const,
    payment,
    provider: {
      name: 'yoomoney',
      mode: 'stub',
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
