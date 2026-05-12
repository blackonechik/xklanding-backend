import { randomBytes } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { env } from "../../config/env.js";

const OAUTH_STATE_COOKIE = "xk_discord_state";
const OAUTH_RETURN_TO_COOKIE = "xk_discord_return_to";

function getBackendBaseUrl() {
  return env.publicApiUrl ?? `http://localhost:${env.port}`;
}

export function createOAuthState() {
  return randomBytes(24).toString("base64url");
}

export function resolveFrontendOrigin(value: string | undefined) {
  if (!value) {
    return env.frontendUrl;
  }

  try {
    const url = new URL(value);
    const allowedOrigins = new Set([env.frontendUrl, ...env.corsOrigins]);

    if (!allowedOrigins.has(url.origin)) {
      return env.frontendUrl;
    }

    return url.origin;
  } catch {
    return env.frontendUrl;
  }
}

export function setOAuthStateCookie(c: Context, state: string) {
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: getBackendBaseUrl().startsWith("https://"),
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 10,
  });
}

export function setOAuthReturnToCookie(c: Context, returnTo: string | undefined) {
  setCookie(c, OAUTH_RETURN_TO_COOKIE, resolveFrontendOrigin(returnTo), {
    httpOnly: true,
    secure: getBackendBaseUrl().startsWith("https://"),
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 10,
  });
}

export function consumeOAuthState(c: Context) {
  const state = getCookie(c, OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });
  return state;
}

export function consumeOAuthReturnTo(c: Context) {
  const returnTo = getCookie(c, OAUTH_RETURN_TO_COOKIE);
  deleteCookie(c, OAUTH_RETURN_TO_COOKIE, { path: "/" });
  return resolveFrontendOrigin(returnTo);
}
