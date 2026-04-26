export type PaymentStatus = 'pending' | 'paid'

export type Payment = {
  id: string
  nickname: string
  productId: string
  productName: string
  amountRub: number
  status: PaymentStatus
  provider: string
  providerPaymentId: string | null
  confirmationUrl: string
  createdAt: string
  updatedAt: string
}
