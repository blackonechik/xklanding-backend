import { prisma } from '../database/prisma.js'

type PaymentRow = {
  id: string
  nickname: string
  productId: string
  productName: string
  amountRub: number
  status: string
  provider: string
  providerPaymentId: string | null
  createdAt: string
  updatedAt: string
}

type LifeLogRow = {
  id: string
  orderId: string
  paymentId: string
  providerPaymentId: string
  playerUuid: string
  playerName: string
  productId: string
  livesDelta: number
  previousLives: number
  newLives: number
  createdAt: string
}

export async function getAdminDashboard() {
  const [payments, lifeLogs] = await Promise.all([
    prisma.payment.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    }),
    prisma.lifePurchaseLog.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    }),
  ])

  const paymentRows: PaymentRow[] = payments.map((item) => ({
    id: item.id,
    nickname: item.nickname,
    productId: item.productId,
    productName: item.productName,
    amountRub: item.amountRub,
    status: item.status,
    provider: item.provider,
    providerPaymentId: item.providerPaymentId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }))

  const lifeLogRows: LifeLogRow[] = lifeLogs.map((item) => ({
    id: item.id,
    orderId: item.orderId,
    paymentId: item.paymentId,
    providerPaymentId: item.providerPaymentId,
    playerUuid: item.playerUuid,
    playerName: item.playerName,
    productId: item.productId,
    livesDelta: item.livesDelta,
    previousLives: item.previousLives,
    newLives: item.newLives,
    createdAt: item.createdAt.toISOString(),
  }))

  return {
    payments: paymentRows,
    lifeLogs: lifeLogRows,
  }
}
