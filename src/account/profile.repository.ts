import { prisma } from "../database/prisma.js";
import type {
  PlayerDailyActivity,
  PlayerProfileAppearance,
  PlayerRatingSummary,
  PublicPlayerProfile,
} from "./account.types.js";

const defaultAppearance: PlayerProfileAppearance = {
  animation: "inspect",
  background: "palette-slate",
};

const allowedAnimations = new Set([
  "idle",
  "inspect",
  "wave",
  "walk",
  "run",
  "fly",
  "crouch",
  "hit",
]);
const allowedBackgrounds = new Set([
  "palette-slate",
  "palette-emerald",
  "palette-amber",
  "palette-rose",
  "palette-violet",
  "palette-sky",
  "palette-zinc",
  "plains",
  "nether",
  "end",
]);

type PlayTimeRow = {
  uuid: string;
  nickname: string;
  playtime: bigint | number;
  artificial_playtime: bigint | number;
  afk_playtime: bigint | number;
  month_seconds?: bigint | number | null;
  week_seconds?: bigint | number | null;
  today_seconds?: bigint | number | null;
  last_seen: bigint | number | null;
  lives: number | null;
  animation: string | null;
  background: string | null;
  online: boolean | null;
  likes: bigint | number | null;
  dislikes: bigint | number | null;
  current_user_rating: number | null;
};

type ActivityRow = {
  activity_date: Date | string;
  played_seconds: bigint | number;
};

function toNumber(value: bigint | number | null | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  return typeof value === "number" ? value : 0;
}

function toIsoFromMillis(value: bigint | number | null | undefined) {
  const timestamp = toNumber(value);
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toISOString()
    : null;
}

function toHours(seconds: number) {
  return Math.round((seconds / 3600) * 10) / 10;
}

function normalizeDate(value: Date | string) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
}

function normalizeAppearance(
  animation: string | null | undefined,
  background: string | null | undefined,
): PlayerProfileAppearance {
  return {
    animation: allowedAnimations.has(animation ?? "")
      ? (animation as PlayerProfileAppearance["animation"])
      : defaultAppearance.animation,
    background: allowedBackgrounds.has(background ?? "")
      ? (background as PlayerProfileAppearance["background"])
      : defaultAppearance.background,
  };
}

function effectivePlayedSeconds(row: Pick<PlayTimeRow, "playtime" | "artificial_playtime">) {
  return Math.max(0, (toNumber(row.playtime) + toNumber(row.artificial_playtime)) / 20);
}

function mapRating(row: Pick<PlayTimeRow, "likes" | "dislikes" | "current_user_rating">): PlayerRatingSummary {
  const likes = toNumber(row.likes);
  const dislikes = toNumber(row.dislikes);
  const currentUserRating = row.current_user_rating === 1 || row.current_user_rating === -1
    ? row.current_user_rating
    : 0;

  return {
    likes,
    dislikes,
    score: likes - dislikes,
    currentUserRating,
  };
}

export async function getPlayerAppearance(
  lowercaseNickname: string,
): Promise<PlayerProfileAppearance> {
  const profile = await prisma.playerProfile.findUnique({
    where: {
      nickname: lowercaseNickname,
    },
  });

  return normalizeAppearance(profile?.animation, profile?.background);
}

export async function updatePlayerAppearance(
  lowercaseNickname: string,
  input: Partial<PlayerProfileAppearance>,
) {
  const appearance = normalizeAppearance(input.animation, input.background);

  const profile = await prisma.playerProfile.upsert({
    where: {
      nickname: lowercaseNickname,
    },
    create: {
      nickname: lowercaseNickname,
      ...appearance,
    },
    update: appearance,
  });

  return normalizeAppearance(profile.animation, profile.background);
}

export async function listPublicPlayers(
  limit = 60,
  viewerNickname?: string,
): Promise<PublicPlayerProfile[]> {
  const rows = await prisma.$queryRaw<PlayTimeRow[]>`
    select
      pt.uuid,
      pt.nickname,
      pt.playtime,
      pt.artificial_playtime,
      pt.afk_playtime,
      coalesce(activity.month_seconds, 0)::bigint as month_seconds,
      coalesce(activity.week_seconds, 0)::bigint as week_seconds,
      coalesce(activity.today_seconds, 0)::bigint as today_seconds,
      pt.last_seen,
      lives.lives::int as lives,
      pp.animation,
      pp.background,
      coalesce(pos.online, false) as online,
      coalesce(ratings.likes, 0)::bigint as likes,
      coalesce(ratings.dislikes, 0)::bigint as dislikes,
      viewer_rating.value::int as current_user_rating
    from play_time pt
    left join limited_lives_players lives on lower(lives.player_name) = lower(pt.nickname)
    left join player_profiles pp on pp.nickname = lower(pt.nickname)
    left join player_online_status pos on pos.user_uuid = pt.uuid
    left join lateral (
      select
        sum(pda.played_seconds) filter (where pda.activity_date >= current_date - interval '30 days') as month_seconds,
        sum(pda.played_seconds) filter (where pda.activity_date >= current_date - interval '7 days') as week_seconds,
        sum(pda.played_seconds) filter (where pda.activity_date = current_date) as today_seconds
      from player_daily_activity pda
      where pda.user_uuid = pt.uuid
    ) activity on true
    left join lateral (
      select
        count(*) filter (where value = 1) as likes,
        count(*) filter (where value = -1) as dislikes
      from player_ratings
      where target_nickname = lower(pt.nickname)
    ) ratings on true
    left join player_ratings viewer_rating
      on viewer_rating.target_nickname = lower(pt.nickname)
      and viewer_rating.voter_nickname = lower(${viewerNickname ?? ""})
    order by (pt.playtime + pt.artificial_playtime) desc
    limit ${limit}
  `;

  return rows.map((row) => {
    const totalHours = toHours(effectivePlayedSeconds(row));

    return {
      nickname: row.nickname,
      uuid: row.uuid,
      lives: row.lives,
      lastLoginAt: toIsoFromMillis(row.last_seen),
      playedHours: totalHours,
      isOnline: Boolean(row.online),
      stats: {
        totalHours,
        monthHours: toHours(toNumber(row.month_seconds)),
        weekHours: toHours(toNumber(row.week_seconds)),
        todayHours: toHours(toNumber(row.today_seconds)),
      },
      activity: [],
      appearance: normalizeAppearance(row.animation, row.background),
      rating: mapRating(row),
    };
  });
}

export async function getPublicPlayerProfile(
  nickname: string,
  viewerNickname?: string,
): Promise<PublicPlayerProfile | undefined> {
  const rows = await prisma.$queryRaw<PlayTimeRow[]>`
    select
      pt.uuid,
      pt.nickname,
      pt.playtime,
      pt.artificial_playtime,
      pt.afk_playtime,
      pt.last_seen,
      lives.lives::int as lives,
      pp.animation,
      pp.background,
      coalesce(pos.online, false) as online,
      coalesce(ratings.likes, 0)::bigint as likes,
      coalesce(ratings.dislikes, 0)::bigint as dislikes,
      viewer_rating.value::int as current_user_rating
    from play_time pt
    left join limited_lives_players lives on lower(lives.player_name) = lower(pt.nickname)
    left join player_profiles pp on pp.nickname = lower(pt.nickname)
    left join player_online_status pos on pos.user_uuid = pt.uuid
    left join lateral (
      select
        count(*) filter (where value = 1) as likes,
        count(*) filter (where value = -1) as dislikes
      from player_ratings
      where target_nickname = lower(pt.nickname)
    ) ratings on true
    left join player_ratings viewer_rating
      on viewer_rating.target_nickname = lower(pt.nickname)
      and viewer_rating.voter_nickname = lower(${viewerNickname ?? ""})
    where lower(pt.nickname) = lower(${nickname})
    limit 1
  `;

  const row = rows[0];
  if (!row) {
    return undefined;
  }

  const today = new Date();
  const heatmapStart = new Date(today);
  heatmapStart.setDate(today.getDate() - 365);

  const activityRows = await prisma.$queryRaw<ActivityRow[]>`
    select activity_date, played_seconds
    from player_daily_activity
    where user_uuid = ${row.uuid}
      and activity_date >= ${heatmapStart}
    order by activity_date asc
  `;

  const monthStart = new Date(today);
  monthStart.setDate(today.getDate() - 30);

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 7);

  const todayKey = today.toISOString().slice(0, 10);
  const activity: PlayerDailyActivity[] = activityRows.map((item) => ({
    date: normalizeDate(item.activity_date),
    playedHours: toHours(toNumber(item.played_seconds)),
  }));

  const sumFrom = (from: Date) => {
    const fromKey = from.toISOString().slice(0, 10);
    return toHours(
      activityRows
        .filter((item) => normalizeDate(item.activity_date) >= fromKey)
        .reduce((sum, item) => sum + toNumber(item.played_seconds), 0),
    );
  };

  const totalHours = toHours(effectivePlayedSeconds(row));

  return {
    nickname: row.nickname,
    uuid: row.uuid,
    lives: row.lives,
    lastLoginAt: toIsoFromMillis(row.last_seen),
    playedHours: totalHours,
    isOnline: Boolean(row.online),
    stats: {
      totalHours,
      monthHours: sumFrom(monthStart),
      weekHours: sumFrom(weekStart),
      todayHours: toHours(
        activityRows
          .filter((item) => normalizeDate(item.activity_date) === todayKey)
          .reduce((sum, item) => sum + toNumber(item.played_seconds), 0),
      ),
    },
    activity,
    appearance: normalizeAppearance(row.animation, row.background),
    rating: mapRating(row),
  };
}

export async function setPlayerRating(
  targetNickname: string,
  voterNickname: string,
  value: -1 | 0 | 1,
) {
  const target = await prisma.playTimePlayer.findFirst({
    where: {
      nickname: {
        equals: targetNickname,
        mode: "insensitive",
      },
    },
    select: {
      nickname: true,
    },
  });

  if (!target) {
    return { ok: false as const, error: "PLAYER_NOT_FOUND" };
  }

  const normalizedTarget = target.nickname.toLowerCase();
  const normalizedVoter = voterNickname.toLowerCase();

  if (normalizedTarget === normalizedVoter) {
    return { ok: false as const, error: "SELF_RATING_NOT_ALLOWED" };
  }

  if (value === 0) {
    await prisma.playerRating.deleteMany({
      where: {
        targetNickname: normalizedTarget,
        voterNickname: normalizedVoter,
      },
    });
  } else {
    await prisma.playerRating.upsert({
      where: {
        targetNickname_voterNickname: {
          targetNickname: normalizedTarget,
          voterNickname: normalizedVoter,
        },
      },
      create: {
        targetNickname: normalizedTarget,
        voterNickname: normalizedVoter,
        value,
      },
      update: {
        value,
      },
    });
  }

  const player = await getPublicPlayerProfile(target.nickname, voterNickname);

  return { ok: true as const, player: player! };
}
