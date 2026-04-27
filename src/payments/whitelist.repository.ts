import { prisma } from '../database/prisma.js'

export async function activateWhitelistEntry(params: {
  nickname: string
  source: string
}) {
  const normalizedNickname = params.nickname.trim().toLowerCase()

  await prisma.$executeRaw`
    insert into whitelist_entries (nickname, active, updated_at, source)
    values (${normalizedNickname}, true, now(), ${params.source})
    on conflict (nickname) do update
    set
      active = excluded.active,
      updated_at = now(),
      source = excluded.source
  `

  return {
    nickname: normalizedNickname,
  }
}
