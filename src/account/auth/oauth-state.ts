import { randomBytes } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { env } from "../../config/env.js";

const OAUTH_STATE_COOKIE = "xk_discord_state";

function getBackendBaseUrl() {
  return env.publicApiUrl ?? `http://localhost:${env.port}`;
}

export function createOAuthState() {
  return randomBytes(24).toString("base64url");
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

export function consumeOAuthState(c: Context) {
  const state = getCookie(c, OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });
  return state;
}
