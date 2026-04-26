import type { Payment as PrismaPayment } from '@prisma/client'
import type { Payment, PaymentStatus } from './payments.model.js'

export function mapPayment(row: PrismaPayment): Payment {
  return {
    id: row.id,
    nickname: row.nickname,
    productId: row.productId,
    productName: row.productName,
    amountRub: row.amountRub,
    status: row.status as PaymentStatus,
    provider: row.provider,
    providerPaymentId: row.providerPaymentId,
    confirmationUrl: row.confirmationUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
