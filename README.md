# XK Site Backend

Hono API for XK HARDCORE payments. PostgreSQL stores payment orders, real Yookassa
payments, and life purchase audit logs.

## Setup

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:deploy
npm run dev
```

The API runs on `http://localhost:3001` by default.

## Environment

`DATABASE_URL` is required for Prisma and for creating payments.

```bash
PORT=3001
DATABASE_URL=postgres://postgres:postgres@localhost:5432/xksite
FRONTEND_URL=http://localhost:3000
PUBLIC_API_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:3000
ADMIN_TOKEN=change_me
YOOKASSA_API_URL=https://api.yookassa.ru/v3
YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
YOOKASSA_WEBHOOK_SECRET=
LIVES_DEFAULT=2
LIVES_MAX=10
```

`YOOKASSA_WEBHOOK_SECRET` is optional. In current backend implementation it checks
`Authorization: Bearer <token>` on webhook endpoint only when this variable is set.
For direct Yookassa webhooks, keep it empty unless you deliver webhooks through your
own proxy that can add this header.

## Docker

Build the backend image:

```bash
docker build -t xksite-backend .
```

Run the API:

```bash
docker run --env-file .env -p 3001:3001 xksite-backend
```

The API image runs `prisma migrate deploy` before `node dist/index.js`, so the
`payments` table is created automatically on container start.

Run Prisma migrations from the same Dockerfile:

```bash
docker build --target migrate -t xksite-backend-migrate .
docker run --env-file .env xksite-backend-migrate
```

## Endpoints

- `GET /api/health` checks API, PostgreSQL, and Yookassa mode.
- `GET /api/products` returns available products.
- `POST /api/payments` creates a pending payment.
- `GET /api/payments/:id` returns payment status.
- `POST /api/payments/yookassa/webhook` processes webhook events (`payment.succeeded`).
- `GET /api/payments/:id/mock-confirm` is available only when Yookassa is not configured.
- `GET /api/admin/dashboard` returns admin data (requires `x-admin-token`).
- `GET /api/admin/promocodes` returns promo codes list (requires `x-admin-token`).
- `POST /api/admin/promocodes` creates a promo code (requires `x-admin-token`).
- `PATCH /api/admin/promocodes/:id` updates limits/active state (requires `x-admin-token`).

## Payment Payload

```json
{
  "nickname": "Steve_2026",
  "productId": "smp-pass",
  "promoCode": "WELCOME10"
}
```

Available products:

- `smp-pass` — проходка на XK HARDCORE, `200 ₽`.
- `life` — дополнительная RP-жизнь, `200 ₽`.

## Promo codes

Promo codes support:

- `discountType`: `percent` or `fixed`;
- `discountValue`: integer (`1..99` for `percent`);
- optional global limit `maxUses`;
- optional per nickname limit `maxUsesPerNickname`;
- optional active window `startsAt` / `endsAt`;
- activation state `isActive`.

## Auto-whitelist pass

For product `smp-pass`, backend:

- creates Yookassa payment;
- waits for `payment.succeeded` webhook or syncs status from Yookassa when the
  frontend checks `/api/payments/:id`;
- lowercases the purchased nickname;
- inserts or reactivates it in `whitelist_entries`;
- sets `source` to `xksite`.

## Auto-donate lives

For product `life`, backend:

- finds player in `limited_lives_players` by `player_name`;
- creates Yookassa payment;
- waits for `payment.succeeded` webhook;
- applies `+1` life by `player_uuid` in one DB transaction;
- writes an audit record into `life_purchase_log`.

Backend updates only these plugin columns:

- `player_uuid`
- `player_name`
- `lives`

Service columns `dead`, `killer_uuid`, `grace_start` are never changed by backend.
