import { buildServer } from "./server.js";

const { app, env } = await buildServer();
await app.listen({ port: env.PORT, host: env.HOST });
console.info(`Super admin ready: ${env.SEED_SUPER_ADMIN_EMAIL}`);
