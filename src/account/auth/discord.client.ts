import { env } from "../../config/env.js";

type DiscordTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
};

export type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

function getBackendBaseUrl() {
  return env.publicApiUrl ?? `http://localhost:${env.port}`;
}

export function getDiscordRedirectUri() {
  return (
    env.discordRedirectUri ?? `${getBackendBaseUrl()}/api/auth/discord/callback`
  );
}

export function getDiscordAuthorizeUrl(state: string) {
  if (!env.discordClientId) {
    return { ok: false as const, error: "DISCORD_NOT_CONFIGURED" };
  }

  const params = new URLSearchParams({
    client_id: env.discordClientId,
    redirect_uri: getDiscordRedirectUri(),
    response_type: "code",
    scope: "identify",
    state,
    prompt: "none",
  });

  return {
    ok: true as const,
    url: `https://discord.com/oauth2/authorize?${params.toString()}`,
  };
}

export async function exchangeDiscordCode(code: string) {
  if (!env.discordClientId || !env.discordClientSecret) {
    return { ok: false as const, error: "DISCORD_NOT_CONFIGURED" };
  }

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: env.discordClientId,
      client_secret: env.discordClientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: getDiscordRedirectUri(),
    }),
  });

  const token = (await response
    .json()
    .catch(() => ({}))) as DiscordTokenResponse;
  if (!response.ok || !token.access_token) {
    return { ok: false as const, error: token.error ?? "DISCORD_TOKEN_FAILED" };
  }

  return { ok: true as const, accessToken: token.access_token };
}

export async function fetchDiscordUser(accessToken: string) {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const user = (await response.json().catch(() => ({}))) as DiscordUser;

  if (!response.ok || !user.id) {
    return { ok: false as const, error: "DISCORD_USER_FAILED" };
  }

  return { ok: true as const, user };
}
