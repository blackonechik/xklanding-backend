import { Prisma, PromoCodeDiscountType } from '@prisma/client'
import { prisma } from '../database/prisma.js'

type PromoCodeRow = {
  id: string
  code: string
  discountType: 'percent' | 'fixed'
  discountValue: number
  maxUses: number | null
  maxUsesPerNickname: number | null
  usedCount: number
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
}

type PromoResolveSuccess = {
  ok: true
  promoCodeId: string
  promoCode: string
  discountRub: number
  amountRub: number
}

type PromoResolveFail = {
  ok: false
  status: 400 | 404 | 409
  error:
    | 'PROMO_INVALID'
    | 'PROMO_NOT_FOUND'
    | 'PROMO_INACTIVE'
    | 'PROMO_NOT_STARTED'
    | 'PROMO_EXPIRED'
    | 'PROMO_LIMIT_REACHED'
    | 'PROMO_NICKNAME_LIMIT_REACHED'
  message: string
}

export function normalizePromoCode(value: string | undefined) {
  const code = value?.trim().toUpperCase()

  if (!code) {
    return undefined
  }

  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return undefined
  }

  return code
}

function mapPromoCode(row: {
  id: string
  code: string
  discountType: PromoCodeDiscountType
  discountValue: number
  maxUses: number | null
  maxUsesPerNickname: number | null
  usedCount: number
  isActive: boolean
  startsAt: Date | null
  endsAt: Date | null
  createdAt: Date
  updatedAt: Date
}): PromoCodeRow {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discountType,
    discountValue: row.discountValue,
    maxUses: row.maxUses,
    maxUsesPerNickname: row.maxUsesPerNickname,
    usedCount: row.usedCount,
    isActive: row.isActive,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function parseDate(value: string | undefined) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function normalizeOptionalLimit(value: number | undefined) {
  if (value === undefined || value === null) {
    return null
  }

  if (!Number.isInteger(value) || value <= 0) {
    return undefined
  }

  return value
}

function computeDiscountRub(discountType: PromoCodeDiscountType, discountValue: number, amountRub: number) {
  const rawDiscount =
    discountType === 'percent' ? Math.floor((amountRub * discountValue) / 100) : discountValue

  const cappedDiscount = Math.max(0, Math.min(amountRub - 1, rawDiscount))
  return cappedDiscount
}

export async function resolvePromoForPayment(params: {
  code: string | undefined
  nickname: string
  productAmountRub: number
}): Promise<PromoResolveSuccess | PromoResolveFail | { ok: true; promoCodeId?: undefined; promoCode?: undefined; discountRub: 0; amountRub: number }> {
  const normalizedCode = normalizePromoCode(params.code)

  if (!params.code?.trim()) {
    return {
      ok: true,
      discountRub: 0,
      amountRub: params.productAmountRub,
    }
  }

  if (!normalizedCode) {
    return {
      ok: false,
      status: 400,
      error: 'PROMO_INVALID',
      message: 'Некорректный формат промокода.',
    }
  }

  const promo = await prisma.promoCode.findUnique({
    where: {
      code: normalizedCode,
    },
  })

  if (!promo) {
    return {
      ok: false,
      status: 404,
      error: 'PROMO_NOT_FOUND',
      message: 'Промокод не найден.',
    }
  }

  const now = new Date()

  if (!promo.isActive) {
    return {
      ok: false,
      status: 409,
      error: 'PROMO_INACTIVE',
      message: 'Промокод отключён.',
    }
  }

  if (promo.startsAt && now < promo.startsAt) {
    return {
      ok: false,
      status: 409,
      error: 'PROMO_NOT_STARTED',
      message: 'Промокод ещё не активен.',
    }
  }

  if (promo.endsAt && now > promo.endsAt) {
    return {
      ok: false,
      status: 409,
      error: 'PROMO_EXPIRED',
      message: 'Срок действия промокода истёк.',
    }
  }

  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    return {
      ok: false,
      status: 409,
      error: 'PROMO_LIMIT_REACHED',
      message: 'Лимит активаций промокода исчерпан.',
    }
  }

  if (promo.maxUsesPerNickname !== null) {
    const nicknameUses = await prisma.payment.count({
      where: {
        promoCodeId: promo.id,
        nickname: params.nickname,
        status: {
          in: ['pending', 'paid'],
        },
      },
    })

    if (nicknameUses >= promo.maxUsesPerNickname) {
      return {
        ok: false,
        status: 409,
        error: 'PROMO_NICKNAME_LIMIT_REACHED',
        message: 'Для этого никнейма лимит по промокоду уже использован.',
      }
    }
  }

  const discountRub = computeDiscountRub(promo.discountType, promo.discountValue, params.productAmountRub)

  if (discountRub <= 0) {
    return {
      ok: false,
      status: 409,
      error: 'PROMO_INVALID',
      message: 'Промокод не применим к выбранному товару.',
    }
  }

  return {
    ok: true,
    promoCodeId: promo.id,
    promoCode: promo.code,
    discountRub,
    amountRub: params.productAmountRub - discountRub,
  }
}

export async function reservePromoUse(promoCodeId: string) {
  const promo = await prisma.promoCode.findUnique({
    where: {
      id: promoCodeId,
    },
    select: {
      id: true,
      maxUses: true,
      usedCount: true,
    },
  })

  if (!promo) {
    return false
  }

  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    return false
  }

  const updated = await prisma.promoCode.updateMany({
    where: {
      id: promo.id,
      usedCount: promo.usedCount,
    },
    data: {
      usedCount: {
        increment: 1,
      },
    },
  })

  return updated.count > 0
}

export async function releasePromoUse(promoCodeId: string) {
  await prisma.promoCode.updateMany({
    where: {
      id: promoCodeId,
      usedCount: {
        gt: 0,
      },
    },
    data: {
      usedCount: {
        decrement: 1,
      },
    },
  })
}

export async function listPromoCodes(): Promise<PromoCodeRow[]> {
  const promos = await prisma.promoCode.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    take: 200,
  })

  return promos.map(mapPromoCode)
}

export async function createPromoCode(params: {
  code: string | undefined
  discountType: string | undefined
  discountValue: number | undefined
  maxUses: number | undefined
  maxUsesPerNickname: number | undefined
  startsAt: string | undefined
  endsAt: string | undefined
  isActive: boolean | undefined
}) {
  const code = normalizePromoCode(params.code)

  if (!code) {
    return {
      ok: false as const,
      status: 400,
      error: 'INVALID_CODE',
      message: 'Код должен быть 3-32 символа: A-Z, 0-9, _ или -.',
    }
  }

  const discountType =
    params.discountType === 'percent' || params.discountType === 'fixed' ? params.discountType : undefined

  if (!discountType) {
    return {
      ok: false as const,
      status: 400,
      error: 'INVALID_DISCOUNT_TYPE',
      message: 'discountType должен быть percent или fixed.',
    }
  }

  if (!Number.isInteger(params.discountValue) || (params.discountValue ?? 0) <= 0) {
    return {
      ok: false as const,
      status: 400,
      error: 'INVALID_DISCOUNT_VALUE',
      message: 'discountValue должен быть целым числом больше 0.',
    }
  }

  if (discountType === 'percent' && (params.discountValue as number) >= 100) {
    return {
      ok: false as const,
      status: 400,
      error: 'INVALID_DISCOUNT_VALUE',
      message: 'Для percent discountValue должен быть в диапазоне 1..99.',
    }
  }

  const maxUses = normalizeOptionalLimit(params.maxUses)
  if (params.maxUses !== undefined && maxUses === undefined) {
    return {
      ok: false as const,
      status: 400,
      error: 'INVALID_MAX_USES',
      message: 'maxUses должен быть целым числом больше 0.',
    }
  }

  const maxUsesPerNickname = normalizeOptionalLimit(params.maxUsesPerNickname)
  if (params.maxUsesPerNickname !== undefined && maxUsesPerNickname === undefined) {
    return {
      ok: false as const,
      status: 400,
      error: 'INVALID_MAX_USES_PER_NICKNAME',
      message: 'maxUsesPerNickname должен быть целым числом больше 0.',
    }
  }

  const startsAt = parseDate(params.startsAt)
  if (params.startsAt !== undefined && startsAt === undefined) {
    return {
      ok: false as const,
      status: 400,
      error: 'INVALID_STARTS_AT',
      message: 'startsAt должен быть корректной датой.',
    }
  }

  const endsAt = parseDate(params.endsAt)
  if (params.endsAt !== undefined && endsAt === undefined) {
    return {
      ok: false as const,
      status: 400,
      error: 'INVALID_ENDS_AT',
      message: 'endsAt должен быть корректной датой.',
    }
  }

  if (startsAt && endsAt && startsAt >= endsAt) {
    return {
      ok: false as const,
      status: 400,
      error: 'INVALID_DATE_RANGE',
      message: 'startsAt должен быть раньше endsAt.',
    }
  }

  const promo = await prisma.promoCode
    .create({
      data: {
        code,
        discountType,
        discountValue: params.discountValue as number,
        maxUses,
        maxUsesPerNickname,
        startsAt,
        endsAt,
        isActive: params.isActive ?? true,
      },
    })
    .catch((error: unknown) => {
      if (isUniqueConstraintError(error)) {
        return undefined
      }

      throw error
    })

  if (!promo) {
    return {
      ok: false as const,
      status: 409,
      error: 'CODE_ALREADY_EXISTS',
      message: 'Промокод с таким code уже существует.',
    }
  }

  return {
    ok: true as const,
    promo: mapPromoCode(promo),
  }
}

export async function updatePromoCode(params: {
  id: string
  maxUses: number | undefined
  maxUsesPerNickname: number | undefined
  isActive: boolean | undefined
  startsAt: string | undefined
  endsAt: string | undefined
}) {
  const currentPromo = await prisma.promoCode.findUnique({
    where: {
      id: params.id,
    },
  })

  if (!currentPromo) {
    return {
      ok: false as const,
      status: 404,
      error: 'PROMO_NOT_FOUND',
      message: 'Промокод не найден.',
    }
  }

  const updates: Prisma.PromoCodeUpdateInput = {}
  let nextStartsAt = currentPromo.startsAt
  let nextEndsAt = currentPromo.endsAt

  if (params.maxUses !== undefined) {
    const maxUses = normalizeOptionalLimit(params.maxUses)
    if (maxUses === undefined) {
      return {
        ok: false as const,
        status: 400,
        error: 'INVALID_MAX_USES',
        message: 'maxUses должен быть целым числом больше 0.',
      }
    }
    updates.maxUses = maxUses
  }

  if (params.maxUsesPerNickname !== undefined) {
    const maxUsesPerNickname = normalizeOptionalLimit(params.maxUsesPerNickname)
    if (maxUsesPerNickname === undefined) {
      return {
        ok: false as const,
        status: 400,
        error: 'INVALID_MAX_USES_PER_NICKNAME',
        message: 'maxUsesPerNickname должен быть целым числом больше 0.',
      }
    }
    updates.maxUsesPerNickname = maxUsesPerNickname
  }

  if (params.isActive !== undefined) {
    updates.isActive = params.isActive
  }

  if (params.startsAt !== undefined) {
    const startsAt = parseDate(params.startsAt)
    if (startsAt === undefined) {
      return {
        ok: false as const,
        status: 400,
        error: 'INVALID_STARTS_AT',
        message: 'startsAt должен быть корректной датой.',
      }
    }
    updates.startsAt = startsAt
    nextStartsAt = startsAt
  }

  if (params.endsAt !== undefined) {
    const endsAt = parseDate(params.endsAt)
    if (endsAt === undefined) {
      return {
        ok: false as const,
        status: 400,
        error: 'INVALID_ENDS_AT',
        message: 'endsAt должен быть корректной датой.',
      }
    }
    updates.endsAt = endsAt
    nextEndsAt = endsAt
  }

  if (nextStartsAt && nextEndsAt && nextStartsAt >= nextEndsAt) {
    return {
      ok: false as const,
      status: 400,
      error: 'INVALID_DATE_RANGE',
      message: 'startsAt должен быть раньше endsAt.',
    }
  }

  const promo = await prisma.promoCode.update({
    where: {
      id: params.id,
    },
    data: updates,
  })

  return {
    ok: true as const,
    promo: mapPromoCode(promo),
  }
}

function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false
  }

  return (error as { code?: unknown }).code === 'P2002'
}
