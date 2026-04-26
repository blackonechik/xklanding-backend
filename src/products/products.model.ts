export type Product = {
  id: 'smp-pass' | 'life'
  name: string
  description: string
  amountRub: number
}

export const products: Product[] = [
  {
    id: 'smp-pass',
    name: 'Проходка на XK HARDCORE',
    description: 'Доступ к приватному SMP и whitelist после подтверждения.',
    amountRub: 200,
  },
  {
    id: 'life',
    name: 'Жизнь',
    description: 'Одна дополнительная RP-жизнь для активного игрока.',
    amountRub: 200,
  },
]
