CREATE TYPE "PromoCodeDiscountType" AS ENUM ('percent', 'fixed');

CREATE TABLE "promo_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "discount_type" "PromoCodeDiscountType" NOT NULL,
  "discount_value" INTEGER NOT NULL,
  "max_uses" INTEGER,
  "max_uses_per_nickname" INTEGER,
  "used_count" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "starts_at" TIMESTAMPTZ(6),
  "ends_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promo_codes_code_key" UNIQUE ("code")
);

ALTER TABLE "payments"
  ADD COLUMN "discount_rub" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "promo_code_id" UUID;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_promo_code_id_fkey"
  FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "payments_promo_code_id_idx" ON "payments"("promo_code_id");
