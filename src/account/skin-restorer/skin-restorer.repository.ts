import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";

type SkinRestorerPlayerRow = {
  uuid: string;
  skin_identifier: string | null;
  skin_type: string | null;
  skin_variant: string | null;
};

type SkinPropertyRow = {
  value: string;
  signature: string;
};

type TexturePayload = {
  textures?: {
    SKIN?: {
      url?: string;
    };
  };
};

function normalizeUuid(identifier: string) {
  const compact = identifier.trim().replace(/-/g, "").toLowerCase();

  if (!/^[0-9a-f]{32}$/.test(compact)) {
    return null;
  }

  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function resolveTableName(name: string) {
  const prefix = /^[a-zA-Z0-9_]*$/.test(env.skinRestorerTablePrefix)
    ? env.skinRestorerTablePrefix
    : "sr_";

  return `${prefix}${name}`;
}

function decodeTexturePayload(value: string): TexturePayload {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as TexturePayload;
}

async function fetchTextureBytes(textureUrl: string) {
  const response = await fetch(textureUrl, {
    headers: {
      "User-Agent": "XK HARDCORE",
    },
  });

  if (!response.ok) {
    return null;
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "image/png",
  };
}

async function getPlayerRowByUuid(uuid: string) {
  const rows = await prisma.$queryRawUnsafe<SkinRestorerPlayerRow[]>(
    `SELECT uuid, skin_identifier, skin_type, skin_variant FROM ${resolveTableName(
      "players",
    )} WHERE lower(uuid) = lower($1) LIMIT 1`,
    uuid,
  );

  return rows[0];
}

async function getPlayerSkinProperty(uuid: string) {
  const rows = await prisma.$queryRawUnsafe<SkinPropertyRow[]>(
    `SELECT value, signature FROM ${resolveTableName(
      "player_skins",
    )} WHERE lower(uuid) = lower($1) LIMIT 1`,
    uuid,
  );

  return rows[0] ?? null;
}

async function getUrlSkinProperty(url: string, skinVariant: string | null) {
  const variantRows = skinVariant
    ? await prisma.$queryRawUnsafe<SkinPropertyRow[]>(
        `SELECT value, signature FROM ${resolveTableName(
          "url_skins",
        )} WHERE url = $1 AND skin_variant = $2 LIMIT 1`,
        url,
        skinVariant,
      )
    : [];

  if (variantRows[0]) {
    return variantRows[0];
  }

  const indexRows = await prisma.$queryRawUnsafe<Array<{ skin_variant: string | null }>>(
    `SELECT skin_variant FROM ${resolveTableName("url_index")} WHERE url = $1 LIMIT 1`,
    url,
  );

  const resolvedVariant = indexRows[0]?.skin_variant ?? null;
  if (!resolvedVariant) {
    return null;
  }

  const rows = await prisma.$queryRawUnsafe<SkinPropertyRow[]>(
    `SELECT value, signature FROM ${resolveTableName(
      "url_skins",
    )} WHERE url = $1 AND skin_variant = $2 LIMIT 1`,
    url,
    resolvedVariant,
  );

  return rows[0] ?? null;
}

async function getCustomSkinProperty(name: string) {
  const rows = await prisma.$queryRawUnsafe<SkinPropertyRow[]>(
    `SELECT value, signature FROM ${resolveTableName("custom_skins")} WHERE name = $1 LIMIT 1`,
    name,
  );

  return rows[0] ?? null;
}

export async function getSkinTextureByPlayerIdentifier(identifier: string) {
  const resolvedUuid = normalizeUuid(identifier) ?? identifier.trim();

  const playerRow = await getPlayerRowByUuid(resolvedUuid);

  if (!playerRow || !playerRow.skin_identifier || !playerRow.skin_type) {
    return null;
  }

  let property: SkinPropertyRow | null = null;

  switch (playerRow.skin_type) {
    case "PLAYER":
      property = await getPlayerSkinProperty(playerRow.skin_identifier);
      break;
    case "URL":
      property = await getUrlSkinProperty(
        playerRow.skin_identifier,
        playerRow.skin_variant,
      );
      break;
    case "CUSTOM":
      property = await getCustomSkinProperty(playerRow.skin_identifier);
      break;
    default:
      return null;
  }

  if (!property) {
    return null;
  }

  const payload = decodeTexturePayload(property.value);
  const textureUrl = payload.textures?.SKIN?.url;

  if (!textureUrl) {
    return null;
  }

  const skinBytes = await fetchTextureBytes(textureUrl);

  if (!skinBytes) {
    return null;
  }

  return skinBytes;
}