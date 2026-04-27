import { randomUUID } from 'node:crypto'
import { env } from '../../config/env.js'

type YookassaPaymentResponse = {
  id?: string
  status?: string
  confirmation?: {
    type?: string
    confirmation_url?: string
  }
  description?: string
}

function getAuthHeader() {
  if (!env.yookassaShopId || !env.yookassaSecretKey) {
    return undefined
  }

  return `Basic ${Buffer.from(`${env.yookassaShopId}:${env.yookassaSecretKey}`).toString('base64')}`
}

export function isYookassaConfigured() {
  return Boolean(env.yookassaShopId && env.yookassaSecretKey)
}

export async function createYookassaPayment(params: {
  orderId: string
  amountRub: number
  description: string
  returnUrl: string
  metadata: Record<string, string>
}) {
  const authHeader = getAuthHeader()

  if (!authHeader) {
    throw new Error('YOOKASSA_NOT_CONFIGURED')
  }

  const requestBody = {
    amount: {
      value: params.amountRub.toFixed(2),
      currency: 'RUB',
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: params.returnUrl,
    },
    description: params.description.slice(0, 128),
    metadata: {
      ...params.metadata,
      orderId: params.orderId,
    },
  }

  const response = await fetch(`${env.yookassaApiUrl}/payments`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      'Idempotence-Key': randomUUID(),
    },
    body: JSON.stringify(requestBody),
  })

  const json = (await response.json().catch(() => undefined)) as YookassaPaymentResponse | undefined

  if (!response.ok) {
    const statusPart = json?.status ? `, status=${json.status}` : ''
    throw new Error(`YOOKASSA_CREATE_FAILED: http=${response.status}${statusPart}`)
  }

  const providerPaymentId = json?.id
  const confirmationUrl = json?.confirmation?.confirmation_url

  if (!providerPaymentId || !confirmationUrl) {
    throw new Error('YOOKASSA_INVALID_RESPONSE')
  }

  return {
    provider: 'yookassa',
    providerPaymentId,
    confirmationUrl,
  }
}
