import { env } from "../../config/env.js";

export const BANK_CARD_DESIGNS = [
  "creeper",
  "panda",
  "warden",
  "enderman",
  "fox",
  "bee",
  "axolotl",
  "skeleton",
] as const;

export type BankCardDesign = (typeof BANK_CARD_DESIGNS)[number];

export type CreateBankCardInput = {
  title?: string;
  design?: string;
};

export const bankLimits = {
  maxCardsPerPlayer: env.bankMaxCardsPerPlayer,
  minTransferDiamonds: env.bankMinTransferDiamonds,
  maxTransferDiamonds: env.bankMaxTransferDiamonds,
  dailyTransferDiamondsLimit: env.bankDailyTransferDiamondsLimit,
};

export function normalizeBankCardDesign(value: string | undefined) {
  return BANK_CARD_DESIGNS.includes(value as BankCardDesign)
    ? (value as BankCardDesign)
    : "creeper";
}
