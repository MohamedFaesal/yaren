import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(plain, salt, 32)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, encoded: string): Promise<boolean> {
  const [scheme, salt, key] = encoded.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const derived = (await scryptAsync(plain, salt, 32)) as Buffer;
  const expected = Buffer.from(key, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
