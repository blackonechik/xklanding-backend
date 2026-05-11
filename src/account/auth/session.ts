import { createHmac, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { env } from "../../config/env.js";
import type { AccountSession } from "../account.types.js";

const SESSION_COOKIE = "xk_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

function getBackendBaseUrl() {
  return env.publicApiUrl ?? `http://localhost:${env.port}`;
}

function getSessionSecret() {
  return env.sessionSecret ?? env.adminToken ?? "xk-local-dev-session-secret";
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function signPayload(payload: string) {
  return createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function encodeSession(payload: AccountSession) {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${signPayload(body)}`;
}

function decodeSession(token: string | undefined): AccountSession | undefined {
  if (!token) {
    return undefined;
  }

  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return undefined;
  }

  const expected = signPayload(body);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return undefined;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as AccountSession;
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : undefined;
  } catch {
    return undefined;
  }
}

export function setSessionCookie(
  c: Context,
  payload: Omit<AccountSession, "exp">,
) {
  const session = encodeSession({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });

  setCookie(c, SESSION_COOKIE, session, {
    httpOnly: true,
    secure: getBackendBaseUrl().startsWith("https://"),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export function getSession(c: Context) {
  return decodeSession(getCookie(c, SESSION_COOKIE));
}
