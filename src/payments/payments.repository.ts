import type { Payment as PrismaPayment } from '@prisma/client'
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
  amountRub: number
  discountRub: number
  promoCodeId?: string
  provider: string
  providerPaymentId: string
  confirmationUrl: string
  metadata: Record<string, string>
}): Promise<Payment> {
  const payment = await prisma.payment.create({
    data: {
      id: params.id,
      nickname: params.nickname,
      productId: params.product.id,
      productName: params.product.name,
      amountRub: params.amountRub,
      discountRub: params.discountRub,
      status: 'pending',
      provider: params.provider,
      providerPaymentId: params.providerPaymentId,
      confirmationUrl: params.confirmationUrl,
      promoCodeId: params.promoCodeId,
      metadata: {
        contactEmail: params.contactEmail,
        contactTelegram: params.contactTelegram,
        productDescription: params.product.description,
        ...params.metadata,
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

export async function findStoredPaymentById(id: string): Promise<PrismaPayment | undefined> {
  const payment = await prisma.payment.findUnique({
    where: {
      id,
    },
  })

  return payment ?? undefined
}

export async function findStoredPaymentByProviderPaymentId(
  providerPaymentId: string,
): Promise<PrismaPayment | undefined> {
  const payment = await prisma.payment.findFirst({
    where: {
      providerPaymentId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  return payment ?? undefined
}

export async function markPaymentPaidIfPending(id: string) {
  const updated = await prisma.payment.updateMany({
    where: {
      id,
      status: 'pending',
    },
    data: {
      status: 'paid',
    },
  })

  if (updated.count > 0) {
    return 'paid-now' as const
  }

  const payment = await prisma.payment.findUnique({
    where: {
      id,
    },
    select: {
      status: true,
    },
  })

  if (!payment) {
    return 'not-found' as const
  }

  return payment.status === 'paid' ? ('already-paid' as const) : ('not-changed' as const)
}

export async function markPaymentFailedIfPending(id: string) {
  const updated = await prisma.payment.updateMany({
    where: {
      id,
      status: 'pending',
    },
    data: {
      status: 'failed',
    },
  })

  if (updated.count > 0) {
    return 'failed-now' as const
  }

  const payment = await prisma.payment.findUnique({
    where: {
      id,
    },
    select: {
      status: true,
    },
  })

  if (!payment) {
    return 'not-found' as const
  }

  return payment.status === 'failed' ? ('already-failed' as const) : ('not-changed' as const)
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
