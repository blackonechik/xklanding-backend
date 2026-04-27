ALTER TABLE "payments"
  ALTER COLUMN "provider" SET DEFAULT 'yookassa';

CREATE TABLE "life_purchase_log" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "provider_payment_id" TEXT NOT NULL,
  "player_uuid" TEXT NOT NULL,
  "player_name" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "lives_delta" INTEGER NOT NULL,
  "previous_lives" INTEGER NOT NULL,
  "new_lives" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "life_purchase_log_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "life_purchase_log_order_id_key" UNIQUE ("order_id"),
  CONSTRAINT "life_purchase_log_payment_id_key" UNIQUE ("payment_id"),
  CONSTRAINT "life_purchase_log_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
