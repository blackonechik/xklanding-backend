export type CabinetPlayer = {
  nickname: string;
  lowercaseNickname: string;
  uuid: string | null;
  premiumUuid: string | null;
  registeredAt: string | null;
  lastLoginAt: string | null;
  lives: number;
  social: {
    discordId: string;
    blocked: boolean;
    totpEnabled: boolean;
    notifyEnabled: boolean;
  };
};

export type AccountSession = {
  discordId: string;
  nickname: string;
  lowercaseNickname: string;
  exp: number;
};

export type TransferDiamondsInput = {
  fromCardId: string;
  toCardNumber?: string;
  toOwnerNickname?: string;
  amountDiamonds: number;
  comment?: string;
};
