import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import type { CabinetPlayer } from "../account.types.js";

type LimboAuthPlayerRow = {
  nickname: string | null;
  lowercaseNickname: string;
  uuid: string | null;
  premiumUuid: string | null;
  regDate: bigint | number | null;
  loginDate: bigint | number | null;
  discordId: string;
  blocked: boolean | null;
  totpEnabled: boolean | null;
  notifyEnabled: boolean | null;
  lives: number | null;
};

function fromMillis(value: bigint | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toISOString()
    : null;
}

function mapPlayer(row: LimboAuthPlayerRow): CabinetPlayer {
  return {
    nickname: row.nickname ?? row.lowercaseNickname,
    lowercaseNickname: row.lowercaseNickname,
    uuid: row.uuid,
    premiumUuid: row.premiumUuid,
    registeredAt: fromMillis(row.regDate),
    lastLoginAt: fromMillis(row.loginDate),
    lives: row.lives ?? env.livesDefault,
    appearance: {
      animation: "inspect",
      background: "default",
    },
    social: {
      discordId: row.discordId,
      blocked: Boolean(row.blocked),
      totpEnabled: Boolean(row.totpEnabled),
      notifyEnabled: Boolean(row.notifyEnabled),
    },
  };
}

export async function findPlayerByDiscordId(
  discordId: string,
): Promise<CabinetPlayer | undefined> {
  const rows = await prisma.$queryRaw<LimboAuthPlayerRow[]>`
    select
      auth."NICKNAME" as "nickname",
      social."LOWERCASENICKNAME" as "lowercaseNickname",
      nullif(auth."UUID", '') as "uuid",
      nullif(auth."PREMIUMUUID", '') as "premiumUuid",
      auth."REGDATE" as "regDate",
      auth."LOGINDATE" as "loginDate",
      social."DISCORD_ID"::text as "discordId",
      coalesce(social."BLOCKED", false) as "blocked",
      coalesce(social."TOTP_ENABLED", false) as "totpEnabled",
      coalesce(social."NOTIFY_ENABLED", true) as "notifyEnabled",
      lives.lives::int as "lives"
    from "SOCIAL" social
    join "AUTH" auth on auth."LOWERCASENICKNAME" = social."LOWERCASENICKNAME"
    left join limited_lives_players lives on lower(lives.player_name) = social."LOWERCASENICKNAME"
    where social."DISCORD_ID"::text = ${discordId}
    limit 1
  `;

  return rows[0] ? mapPlayer(rows[0]) : undefined;
}

export async function findPlayerByNickname(
  nickname: string,
): Promise<CabinetPlayer | undefined> {
  const normalizedNickname = nickname.trim().toLowerCase();

  if (!normalizedNickname) {
    return undefined;
  }

  const rows = await prisma.$queryRaw<LimboAuthPlayerRow[]>`
    select
      auth."NICKNAME" as "nickname",
      social."LOWERCASENICKNAME" as "lowercaseNickname",
      nullif(auth."UUID", '') as "uuid",
      nullif(auth."PREMIUMUUID", '') as "premiumUuid",
      auth."REGDATE" as "regDate",
      auth."LOGINDATE" as "loginDate",
      social."DISCORD_ID"::text as "discordId",
      coalesce(social."BLOCKED", false) as "blocked",
      coalesce(social."TOTP_ENABLED", false) as "totpEnabled",
      coalesce(social."NOTIFY_ENABLED", true) as "notifyEnabled",
      lives.lives::int as "lives"
    from "SOCIAL" social
    join "AUTH" auth on auth."LOWERCASENICKNAME" = social."LOWERCASENICKNAME"
    left join limited_lives_players lives on lower(lives.player_name) = social."LOWERCASENICKNAME"
    where social."LOWERCASENICKNAME" = ${normalizedNickname}
    limit 1
  `;

  return rows[0] ? mapPlayer(rows[0]) : undefined;
}
