import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { env } from '../config/env.js'

const fallbackDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/xksite'
const adapter = new PrismaPg(env.databaseUrl ?? fallbackDatabaseUrl, {
  onPoolError(error) {
    console.error('Prisma PostgreSQL pool error:', error)
  },
})

export const prisma = new PrismaClient({
  adapter,
})

export function isDatabaseConfigured() {
  return Boolean(env.databaseUrl)
}

export async function checkDatabase() {
  if (!isDatabaseConfigured()) {
    return {
      connected: false,
      reason: 'DATABASE_URL is not set',
    }
  }

  try {
    await prisma.$queryRaw`select 1`
    return {
      connected: true,
    }
  } catch (error) {
    return {
      connected: false,
      reason: error instanceof Error ? error.message : 'Unknown Prisma/PostgreSQL error',
    }
  }
}
