import type { Context } from "hono";
import {
  getDiscordAuthorizeUrl,
  exchangeDiscordCode,
  fetchDiscordUser,
} from "./auth/discord.client.js";
import {
  consumeOAuthState,
  createOAuthState,
  setOAuthStateCookie,
} from "./auth/oauth-state.js";
import {
  clearSessionCookie,
  getSession,
  setSessionCookie,
} from "./auth/session.js";
import { findPlayerByDiscordId } from "./limboauth/limboauth.repository.js";

export function startDiscordLogin(c: Context) {
  const state = createOAuthState();
  const auth = getDiscordAuthorizeUrl(state);

  if (!auth.ok) {
    return auth;
  }

  setOAuthStateCookie(c, state);
  return auth;
}

export async function finishDiscordLogin(
  c: Context,
  code: string | undefined,
  state: string | undefined,
) {
  const expectedState = consumeOAuthState(c);

  if (!code || !state || !expectedState || state !== expectedState) {
    return { ok: false as const, error: "INVALID_OAUTH_STATE" };
  }

  const token = await exchangeDiscordCode(code);
  if (!token.ok) {
    return token;
  }

  const discord = await fetchDiscordUser(token.accessToken);
  if (!discord.ok) {
    return discord;
  }

  const player = await findPlayerByDiscordId(discord.user.id);
  if (!player) {
    return { ok: false as const, error: "DISCORD_NOT_LINKED" };
  }

  setSessionCookie(c, {
    discordId: discord.user.id,
    nickname: player.nickname,
    lowercaseNickname: player.lowercaseNickname,
  });

  return { ok: true as const };
}

export function clearSession(c: Context) {
  clearSessionCookie(c);
}

export async function getCurrentPlayer(c: Context) {
  const session = getSession(c);
  if (!session) {
    return undefined;
  }

  return findPlayerByDiscordId(session.discordId);
}
