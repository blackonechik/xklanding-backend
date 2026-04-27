import type { Product } from '../products/products.model.js'
import { prisma } from '../database/prisma.js'
import { mapPayment } from './payments.mapper.js'
import type { Payment } from './payments.model.js'

export async function insertPayment(params: {
  id: string
  nickname: string
  contactEmail: string
  contactTelegram: string
  product: Product
  provider: string
  providerPaymentId: string
  confirmationUrl: string
}): Promise<Payment> {
  const payment = await prisma.payment.create({
    data: {
      id: params.id,
      nickname: params.nickname,
      productId: params.product.id,
      productName: params.product.name,
      amountRub: params.product.amountRub,
      status: 'pending',
      provider: params.provider,
      providerPaymentId: params.providerPaymentId,
      confirmationUrl: params.confirmationUrl,
      metadata: {
        contactEmail: params.contactEmail,
        contactTelegram: params.contactTelegram,
        productDescription: params.product.description,
        providerMode: 'stub',
      },
    },
  })

  return mapPayment(payment)
}

export async function findPaymentById(id: string): Promise<Payment | undefined> {
  const payment = await prisma.payment.findUnique({
    where: {
      id,
    },
  })

  return payment ? mapPayment(payment) : undefined
}

export async function markPaymentPaid(id: string): Promise<Payment | undefined> {
  const payment = await prisma.payment
    .update({
      where: {
        id,
      },
      data: {
        status: 'paid',
      },
    })
    .catch((error: unknown) => {
      if (isRecordNotFoundError(error)) {
        return undefined
      }

      throw error
    })

  return payment ? mapPayment(payment) : undefined
}

function isRecordNotFoundError(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false
  }

  return (error as { code?: unknown }).code === 'P2025'
}
