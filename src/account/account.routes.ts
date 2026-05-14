import type { Hono } from "hono";
import { env } from "../config/env.js";
import { readString } from "../shared/http.js";
import {
  clearSession,
  finishDiscordLogin,
  getCurrentPlayer,
  startDiscordLogin,
} from "./account.service.js";
import { resolveFrontendOrigin } from "./auth/oauth-state.js";
import {
  closeBankCard,
  createBankCard,
  getBankOverview,
  transferDiamonds,
} from "./bank/bank.repository.js";
import { findPlayerByNickname } from "./limboauth/limboauth.repository.js";
import {
  getPlayerAppearance,
  getPublicPlayerProfile,
  listPublicPlayers,
  setPlayerRating,
  updatePlayerAppearance,
} from "./profile.repository.js";
import { createFallbackSkinPng } from "./skin-restorer/fallback-skin.js";
import {
  getMojangSkinTextureByNickname,
  getSkinTextureByPlayerIdentifiers,
} from "./skin-restorer/skin-restorer.repository.js";

function normalizeUuid(identifier: string) {
  const compact = identifier.trim().replace(/-/g, "").toLowerCase();

  if (!/^[0-9a-f]{32}$/.test(compact)) {
    return null;
  }

  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function skinResponse(
  bytes: Uint8Array,
  contentType: string,
  cacheControl: string,
) {
  const responseBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(responseBuffer).set(bytes);

  return new Response(responseBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    },
  });
}

export function registerAccountRoutes(app: Hono) {
  app.get("/api/auth/discord", (c) => {
    const returnTo = c.req.query("returnTo");
    const auth = startDiscordLogin(c, returnTo);
    if (!auth.ok) {
      return c.redirect(`${auth.redirectBaseUrl}/login?error=${auth.error}`);
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
      return c.redirect(`${result.redirectBaseUrl}/login?error=${result.error}`);
    }

    return c.redirect(`${result.redirectBaseUrl}/cabinet`);
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

    player.appearance = await getPlayerAppearance(player.lowercaseNickname);
    const bank = await getBankOverview(player.lowercaseNickname);
    return c.json({ player, bank });
  });

  app.patch("/api/account/profile/appearance", async (c) => {
    const player = await getCurrentPlayer(c);
    if (!player) {
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }

    const body = await c.req.json().catch(() => undefined);
    const appearance = await updatePlayerAppearance(player.lowercaseNickname, {
      animation: readString(body, "animation") as never,
      background: readString(body, "background") as never,
    });

    return c.json({ appearance });
  });

  app.get("/api/players", async (c) => {
    const currentPlayer = await getCurrentPlayer(c);
    const rawLimit = Number(c.req.query("limit") ?? 60);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(100, Math.floor(rawLimit)))
      : 60;

    const players = await listPublicPlayers(limit, currentPlayer?.nickname);
    return c.json({ players });
  });

  app.get("/api/players/:nickname", async (c) => {
    const currentPlayer = await getCurrentPlayer(c);
    const player = await getPublicPlayerProfile(
      c.req.param("nickname"),
      currentPlayer?.nickname,
    );
    if (!player) {
      return c.json({ error: "PLAYER_NOT_FOUND" }, 404);
    }

    return c.json({ player });
  });

  app.post("/api/players/:nickname/rating", async (c) => {
    const currentPlayer = await getCurrentPlayer(c);
    if (!currentPlayer) {
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }

    const body = await c.req.json().catch(() => undefined);
    const rawValue = Number(readString(body, "value") ?? (body as { value?: unknown } | undefined)?.value);
    const value = rawValue === 1 || rawValue === -1 ? rawValue : 0;
    const result = await setPlayerRating(
      c.req.param("nickname"),
      currentPlayer.nickname,
      value,
    );

    if (!result.ok) {
      return c.json({ error: result.error }, result.error === "PLAYER_NOT_FOUND" ? 404 : 400);
    }

    return c.json({ player: result.player });
  });

  app.get("/api/account/skins/:identifier", async (c) => {
    const identifier = c.req.param("identifier").trim();

    const player = /^[0-9a-fA-F-]{32,36}$/.test(identifier)
      ? undefined
      : await findPlayerByNickname(identifier);

    const uuid = normalizeUuid(identifier);

    const result = await getSkinTextureByPlayerIdentifiers([
      identifier,
      uuid,
      player?.uuid,
      player?.premiumUuid,
      player?.nickname,
      player?.lowercaseNickname,
    ]);

    if (result) {
      return skinResponse(
        result.bytes,
        result.contentType,
        "public, max-age=86400, immutable",
      );
    }

    const mojangSkin = await getMojangSkinTextureByNickname(
      player?.nickname ?? identifier,
    );

    if (mojangSkin) {
      return skinResponse(
        mojangSkin.bytes,
        mojangSkin.contentType,
        "public, max-age=3600",
      );
    }

    return skinResponse(
      createFallbackSkinPng(player?.nickname ?? identifier),
      "image/png",
      "public, max-age=300",
    );
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
      toCardNumber: readString(body, "toCardNumber"),
      toOwnerNickname: readString(body, "toOwnerNickname"),
      amountDiamonds: Number(readString(body, "amountDiamonds") ?? 0),
      comment: readString(body, "comment"),
    });

    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ transfer: result.transfer }, 201);
  });
}
