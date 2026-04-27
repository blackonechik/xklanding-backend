export const env = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL,
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  publicApiUrl: process.env.PUBLIC_API_URL,
  corsOrigin: process.env.CORS_ORIGIN,
  yookassaApiUrl: process.env.YOOKASSA_API_URL ?? 'https://api.yookassa.ru/v3',
  yookassaShopId: process.env.YOOKASSA_SHOP_ID,
  yookassaSecretKey: process.env.YOOKASSA_SECRET_KEY,
  yookassaWebhookSecret: process.env.YOOKASSA_WEBHOOK_SECRET,
  adminToken: process.env.ADMIN_TOKEN,
  livesDefault: Number(process.env.LIVES_DEFAULT ?? 2),
  livesMax: Number(process.env.LIVES_MAX ?? 10),
}
