import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("postgres://yaren:yaren@127.0.0.1:5433/yaren"),
  JWT_SECRET: z.string().min(16).default("dev-only-change-this-secret"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  SEED_SUPER_ADMIN_EMAIL: z.string().email().default("super-admin@yaren.health"),
  SEED_SUPER_ADMIN_PASSWORD: z.string().min(8).default("ChangeMe!2026"),
  SEED_SUPER_ADMIN_NAME: z.string().min(1).default("Super Admin"),
  SEED_SUPER_ADMIN_PHONE: z.string().min(1).default("01000000000"),
});

export type Env = z.infer<typeof envSchema>;

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment: ${message}`);
  }
  return parsed.data;
}
