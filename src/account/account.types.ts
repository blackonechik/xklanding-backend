export type CabinetPlayer = {
  nickname: string;
  lowercaseNickname: string;
  uuid: string | null;
  premiumUuid: string | null;
  registeredAt: string | null;
  lastLoginAt: string | null;
  lives: number;
  appearance: PlayerProfileAppearance;
  social: {
    discordId: string;
    blocked: boolean;
    totpEnabled: boolean;
    notifyEnabled: boolean;
  };
};

export type PlayerProfileAppearance = {
  animation: "idle" | "inspect" | "wave";
  background: "default" | "emerald" | "violet" | "amber";
};

export type PublicPlayerProfile = {
  nickname: string;
  uuid: string | null;
  lives: number | null;
  lastLoginAt: string | null;
  playedHours: number;
  isOnline: boolean;
  stats: {
    totalHours: number;
    monthHours: number;
    weekHours: number;
    todayHours: number;
  };
  activity: PlayerDailyActivity[];
  appearance: PlayerProfileAppearance;
  rating: PlayerRatingSummary;
};

export type PlayerDailyActivity = {
  date: string;
  playedHours: number;
};

export type PlayerRatingSummary = {
  likes: number;
  dislikes: number;
  score: number;
  currentUserRating: -1 | 0 | 1;
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
