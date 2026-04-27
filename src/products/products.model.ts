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
    description:
      'Цифровая услуга: доступ к приватному серверу и автоматическое добавление никнейма в whitelist после успешной оплаты.',
    amountRub: 200,
  },
  {
    id: 'life',
    name: 'Дополнительная RP-жизнь',
    description:
      'Цифровая услуга: одна дополнительная RP-жизнь для активного игрока текущего сезона после подтверждения администратором.',
    amountRub: 200,
  },
]
