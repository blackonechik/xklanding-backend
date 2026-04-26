# XK Site Backend

Hono API for XK SMP payments. PostgreSQL stores payment orders, and the YooMoney
integration is prepared as a stub provider until real credentials are connected.

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
```

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

- `GET /api/health` checks API, PostgreSQL, and provider mode.
- `GET /api/products` returns available products.
- `POST /api/payments` creates a pending payment.
- `GET /api/payments/:id` returns payment status.
- `GET /api/payments/:id/mock-confirm` marks a payment as paid and redirects back
  to the frontend.

## Payment Payload

```json
{
  "nickname": "Steve_2026",
  "productId": "smp-pass"
}
```

Available products:

- `smp-pass` — проходка на XK SMP, `200 ₽`.
- `life` — дополнительная RP-жизнь, `200 ₽`.
