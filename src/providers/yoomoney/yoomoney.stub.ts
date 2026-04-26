import { env } from '../../config/env.js'

export function createYooMoneyStubPayment(paymentId: string) {
  const publicApiUrl = env.publicApiUrl ?? `http://localhost:${env.port}`

  return {
    provider: 'yoomoney',
    providerPaymentId: `stub_${paymentId}`,
    confirmationUrl: `${publicApiUrl}/api/payments/${paymentId}/mock-confirm`,
  }
}
