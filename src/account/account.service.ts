import type { Context } from "hono";
import {
  getDiscordAuthorizeUrl,
  exchangeDiscordCode,
  fetchDiscordUser,
} from "./auth/discord.client.js";
import {
  consumeOAuthState,
  consumeOAuthReturnTo,
  createOAuthState,
  resolveFrontendOrigin,
  setOAuthReturnToCookie,
  setOAuthStateCookie,
} from "./auth/oauth-state.js";
import {
  clearSessionCookie,
  getSession,
  setSessionCookie,
} from "./auth/session.js";
import { findPlayerByDiscordId } from "./limboauth/limboauth.repository.js";

export function startDiscordLogin(c: Context, returnTo: string | undefined) {
  const state = createOAuthState();
  const auth = getDiscordAuthorizeUrl(state);

  if (!auth.ok) {
    return { ...auth, redirectBaseUrl: resolveFrontendOrigin(returnTo) };
  }

  setOAuthStateCookie(c, state);
  setOAuthReturnToCookie(c, returnTo);
  return { ...auth, redirectBaseUrl: resolveFrontendOrigin(returnTo) };
}

export async function finishDiscordLogin(
  c: Context,
  code: string | undefined,
  state: string | undefined,
) {
  const expectedState = consumeOAuthState(c);
  const redirectBaseUrl = consumeOAuthReturnTo(c);

  if (!code || !state || !expectedState || state !== expectedState) {
    return {
      ok: false as const,
      error: "INVALID_OAUTH_STATE",
      redirectBaseUrl,
    };
  }

  const token = await exchangeDiscordCode(code);
  if (!token.ok) {
    return { ...token, redirectBaseUrl };
  }

  const discord = await fetchDiscordUser(token.accessToken);
  if (!discord.ok) {
    return { ...discord, redirectBaseUrl };
  }

  const player = await findPlayerByDiscordId(discord.user.id);
  if (!player) {
    return {
      ok: false as const,
      error: "DISCORD_NOT_LINKED",
      redirectBaseUrl,
    };
  }

  setSessionCookie(c, {
    discordId: discord.user.id,
    nickname: player.nickname,
    lowercaseNickname: player.lowercaseNickname,
  });

  return { ok: true as const, redirectBaseUrl };
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
