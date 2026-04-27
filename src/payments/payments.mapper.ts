import type { Payment as PrismaPayment } from '@prisma/client'
import type { Payment, PaymentStatus } from './payments.model.js'

export function mapPayment(row: PrismaPayment): Payment {
  const metadata = readMetadata(row.metadata)

  return {
    id: row.id,
    nickname: row.nickname,
    contactEmail: readString(metadata.contactEmail),
    contactTelegram: readString(metadata.contactTelegram),
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

function readMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : null
}
