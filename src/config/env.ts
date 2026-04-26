export const env = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL,
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  publicApiUrl: process.env.PUBLIC_API_URL,
  corsOrigin: process.env.CORS_ORIGIN,
}
