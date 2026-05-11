import { prisma } from "../../database/prisma.js";
import type { CabinetPlayer, TransferDiamondsInput } from "../account.types.js";
import {
  bankLimits,
  normalizeBankCardDesign,
  type CreateBankCardInput,
} from "./bank.model.js";

function generateCardNumber() {
  const parts = ["4408"];
  for (let i = 0; i < 3; i += 1) {
    parts.push(String(Math.floor(1000 + Math.random() * 9000)));
  }

  return parts.join(" ");
}

export async function getBankOverview(lowercaseNickname: string) {
  const cards = await prisma.bankCard.findMany({
    where: {
      ownerLowercase: lowercaseNickname,
      isActive: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const cardIds = cards.map((card) => card.id);
  const transfers = cardIds.length
    ? await prisma.bankTransfer.findMany({
        where: {
          OR: [{ fromCardId: { in: cardIds } }, { toCardId: { in: cardIds } }],
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 12,
      })
    : [];

  return {
    cards,
    transfers,
    limits: bankLimits,
  };
}

export async function createBankCard(
  player: CabinetPlayer,
  input: CreateBankCardInput,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      select pg_advisory_xact_lock(hashtext(${player.lowercaseNickname}))
    `;

    const activeCardsCount = await tx.bankCard.count({
      where: {
        ownerLowercase: player.lowercaseNickname,
        isActive: true,
      },
    });

    if (activeCardsCount >= bankLimits.maxCardsPerPlayer) {
      return { ok: false as const, error: "CARD_LIMIT_REACHED" };
    }

    const cardNumber = await generateUniqueCardNumber();
    const card = await tx.bankCard.create({
      data: {
        ownerNickname: player.nickname,
        ownerLowercase: player.lowercaseNickname,
        title: input.title?.trim().slice(0, 40) || "Алмазная карта",
        design: normalizeBankCardDesign(input.design),
        cardNumber,
        balanceDiamonds: 0,
      },
    });

    return { ok: true as const, card };
  });
}

export async function closeBankCard(player: CabinetPlayer, cardId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      select pg_advisory_xact_lock(hashtext(${cardId}))
    `;

    const card = await tx.bankCard.findFirst({
      where: {
        id: cardId,
        ownerLowercase: player.lowercaseNickname,
        isActive: true,
      },
    });

    if (!card) {
      return { ok: false as const, error: "CARD_NOT_FOUND" };
    }

    if (card.balanceDiamonds > 0) {
      return { ok: false as const, error: "CARD_HAS_BALANCE" };
    }

    await tx.bankCard.update({
      where: {
        id: card.id,
      },
      data: {
        isActive: false,
      },
    });

    return { ok: true as const };
  });
}

async function generateUniqueCardNumber() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const cardNumber = generateCardNumber();
    const existingCard = await prisma.bankCard.findUnique({
      where: {
        cardNumber,
      },
    });

    if (!existingCard) {
      return cardNumber;
    }
  }

  throw new Error("BANK_CARD_NUMBER_GENERATION_FAILED");
}

export async function transferDiamonds(
  player: CabinetPlayer,
  params: TransferDiamondsInput,
) {
  if (
    !Number.isInteger(params.amountDiamonds) ||
    params.amountDiamonds < bankLimits.minTransferDiamonds
  ) {
    return { ok: false as const, error: "INVALID_AMOUNT" };
  }

  if (params.amountDiamonds > bankLimits.maxTransferDiamonds) {
    return { ok: false as const, error: "TRANSFER_LIMIT_EXCEEDED" };
  }

  return prisma.$transaction(async (tx) => {
    const fromCard = await tx.bankCard.findFirst({
      where: {
        id: params.fromCardId,
        ownerLowercase: player.lowercaseNickname,
        isActive: true,
      },
    });
    const toCard = await tx.bankCard.findFirst({
      where: {
        cardNumber: params.toCardNumber.trim(),
        isActive: true,
      },
    });

    if (!fromCard || !toCard || fromCard.id === toCard.id) {
      return { ok: false as const, error: "CARD_NOT_FOUND" };
    }

    for (const cardId of [fromCard.id, toCard.id].sort()) {
      await tx.$queryRaw`
        select pg_advisory_xact_lock(hashtext(${cardId}))
      `;
    }

    const lockedFromCard = await tx.bankCard.findFirst({
      where: {
        id: fromCard.id,
        ownerLowercase: player.lowercaseNickname,
        isActive: true,
      },
    });
    const lockedToCard = await tx.bankCard.findFirst({
      where: {
        id: toCard.id,
        isActive: true,
      },
    });

    if (!lockedFromCard || !lockedToCard) {
      return { ok: false as const, error: "CARD_NOT_FOUND" };
    }

    if (lockedFromCard.balanceDiamonds < params.amountDiamonds) {
      return { ok: false as const, error: "INSUFFICIENT_FUNDS" };
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayOutgoingAggregate = await tx.bankTransfer.aggregate({
      _sum: {
        amountDiamonds: true,
      },
      where: {
        fromCardId: lockedFromCard.id,
        createdAt: {
          gte: startOfDay,
        },
      },
    });
    const todayOutgoingDiamonds =
      todayOutgoingAggregate._sum.amountDiamonds ?? 0;
    if (
      todayOutgoingDiamonds + params.amountDiamonds >
      bankLimits.dailyTransferDiamondsLimit
    ) {
      return { ok: false as const, error: "DAILY_LIMIT_EXCEEDED" };
    }

    await tx.bankCard.update({
      where: { id: lockedFromCard.id },
      data: { balanceDiamonds: { decrement: params.amountDiamonds } },
    });
    await tx.bankCard.update({
      where: { id: lockedToCard.id },
      data: { balanceDiamonds: { increment: params.amountDiamonds } },
    });

    const transfer = await tx.bankTransfer.create({
      data: {
        fromCardId: lockedFromCard.id,
        toCardId: lockedToCard.id,
        fromOwner: lockedFromCard.ownerNickname,
        toOwner: lockedToCard.ownerNickname,
        amountDiamonds: params.amountDiamonds,
        comment: params.comment?.trim().slice(0, 120) || null,
      },
    });

    return { ok: true as const, transfer };
  });
}
