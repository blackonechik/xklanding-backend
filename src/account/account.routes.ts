import type { Hono } from "hono";
import { env } from "../config/env.js";
import { readString } from "../shared/http.js";
import {
  clearSession,
  finishDiscordLogin,
  getCurrentPlayer,
  startDiscordLogin,
} from "./account.service.js";
import {
  closeBankCard,
  createBankCard,
  getBankOverview,
  transferDiamonds,
} from "./bank/bank.repository.js";
import { findPlayerByNickname } from "./limboauth/limboauth.repository.js";
import { getSkinTextureByPlayerIdentifier } from "./skin-restorer/skin-restorer.repository.js";

function normalizeUuid(identifier: string) {
  const compact = identifier.trim().replace(/-/g, "").toLowerCase();

  if (!/^[0-9a-f]{32}$/.test(compact)) {
    return null;
  }

  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

export function registerAccountRoutes(app: Hono) {
  app.get("/api/auth/discord", (c) => {
    const auth = startDiscordLogin(c);
    if (!auth.ok) {
      return c.redirect(`${env.frontendUrl}/login?error=${auth.error}`);
    }

    return c.redirect(auth.url);
  });

  app.get("/api/auth/discord/callback", async (c) => {
    const result = await finishDiscordLogin(
      c,
      c.req.query("code"),
      c.req.query("state"),
    );
    if (!result.ok) {
      return c.redirect(`${env.frontendUrl}/login?error=${result.error}`);
    }

    return c.redirect(`${env.frontendUrl}/cabinet`);
  });

  app.post("/api/auth/logout", (c) => {
    clearSession(c);
    return c.json({ ok: true });
  });

  app.get("/api/account/me", async (c) => {
    const player = await getCurrentPlayer(c);
    if (!player) {
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }

    const bank = await getBankOverview(player.lowercaseNickname);
    return c.json({ player, bank });
  });

  app.get("/api/account/skins/:identifier", async (c) => {
    const identifier = c.req.param("identifier").trim();

    const player = /^[0-9a-fA-F-]{32,36}$/.test(identifier)
      ? undefined
      : await findPlayerByNickname(identifier);

    const uuid = normalizeUuid(identifier) ?? player?.uuid ?? player?.premiumUuid ?? null;

    if (!uuid) {
      return c.json({ error: "SKIN_NOT_FOUND" }, 404);
    }

    const result = await getSkinTextureByPlayerIdentifier(uuid);

    if (!result) {
      return c.json({ error: "SKIN_NOT_FOUND" }, 404);
    }

    const responseBuffer = new ArrayBuffer(result.bytes.byteLength);
    new Uint8Array(responseBuffer).set(result.bytes);

    return new Response(responseBuffer, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  });

  app.post("/api/account/bank/cards", async (c) => {
    const player = await getCurrentPlayer(c);
    if (!player) {
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }

    const body = await c.req.json().catch(() => undefined);
    const result = await createBankCard(player, {
      title: readString(body, "title"),
      design: readString(body, "design"),
    });

    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ card: result.card }, 201);
  });

  app.delete("/api/account/bank/cards/:id", async (c) => {
    const player = await getCurrentPlayer(c);
    if (!player) {
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }

    const result = await closeBankCard(player, c.req.param("id"));

    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ ok: true });
  });

  app.post("/api/account/bank/transfers", async (c) => {
    const player = await getCurrentPlayer(c);
    if (!player) {
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }

    const body = await c.req.json().catch(() => undefined);
    const result = await transferDiamonds(player, {
      fromCardId: readString(body, "fromCardId") ?? "",
      toCardNumber: readString(body, "toCardNumber") ?? "",
      amountDiamonds: Number(readString(body, "amountDiamonds") ?? 0),
      comment: readString(body, "comment"),
    });

    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ transfer: result.transfer }, 201);
  });
}
