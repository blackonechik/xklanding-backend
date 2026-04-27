import { Prisma } from '@prisma/client'
import { prisma } from '../database/prisma.js'

type LimitedLivesPlayer = {
  playerUuid: string
  playerName: string
  lives: number
}

async function findLimitedLivesPlayerByUuid(
  tx: Prisma.TransactionClient,
  playerUuid: string,
): Promise<LimitedLivesPlayer | undefined> {
  const rows = await tx.$queryRaw<LimitedLivesPlayer[]>`
    select
      player_uuid::text as "playerUuid",
      player_name as "playerName",
      coalesce(lives, 2)::int as lives
    from limited_lives_players
    where player_uuid::text = ${playerUuid}
    limit 1
  `

  return rows[0]
}

export async function findLimitedLivesPlayerByName(playerName: string): Promise<LimitedLivesPlayer | undefined> {
  const rows = await prisma.$queryRaw<LimitedLivesPlayer[]>`
    select
      player_uuid::text as "playerUuid",
      player_name as "playerName",
      coalesce(lives, 2)::int as lives
    from limited_lives_players
    where lower(player_name) = lower(${playerName})
    order by player_name = ${playerName} desc
    limit 1
  `

  return rows[0]
}

export type ApplyLifePurchaseResult =
  | {
      ok: true
      alreadyApplied: boolean
      playerUuid: string
      playerName: string
      previousLives: number
      newLives: number
    }
  | {
      ok: false
      reason: 'PLAYER_NOT_FOUND'
    }

export async function applyLifePurchase(params: {
  paymentId: string
  providerPaymentId: string
  playerUuid: string
  playerName: string
  productId: string
  livesDelta: number
  defaultLives: number
  maxLives: number
}): Promise<ApplyLifePurchaseResult> {
  return prisma.$transaction(async (tx) => {
    const existingLog = await tx.lifePurchaseLog.findUnique({
      where: {
        orderId: params.paymentId,
      },
    })

    if (existingLog) {
      return {
        ok: true,
        alreadyApplied: true,
        playerUuid: existingLog.playerUuid,
        playerName: existingLog.playerName,
        previousLives: existingLog.previousLives,
        newLives: existingLog.newLives,
      }
    }

    const player = await findLimitedLivesPlayerByUuid(tx, params.playerUuid)
    const previousLives = player?.lives ?? params.defaultLives
    const nextLives = Math.min(params.maxLives, previousLives + params.livesDelta)

    if (player) {
      await tx.$executeRaw`
        update limited_lives_players
        set
          player_name = ${params.playerName},
          lives = ${nextLives}
        where player_uuid::text = ${params.playerUuid}
      `
    } else {
      await tx.$executeRaw`
        insert into limited_lives_players (player_uuid, player_name, lives)
        values (${params.playerUuid}, ${params.playerName}, ${nextLives})
      `
    }

    await tx.lifePurchaseLog.create({
      data: {
        orderId: params.paymentId,
        paymentId: params.paymentId,
        providerPaymentId: params.providerPaymentId,
        playerUuid: params.playerUuid,
        playerName: params.playerName,
        productId: params.productId,
        livesDelta: params.livesDelta,
        previousLives,
        newLives: nextLives,
      },
    })

    return {
      ok: true,
      alreadyApplied: false,
      playerUuid: params.playerUuid,
      playerName: params.playerName,
      previousLives,
      newLives: nextLives,
    }
  })
}
