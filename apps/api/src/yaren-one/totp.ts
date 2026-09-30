import { createHmac, randomBytes } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function createTotpSecret(): string {
  const bytes = randomBytes(10);
  let bits = [...bytes].map((value) => value.toString(2).padStart(8, "0")).join("");
  let secret = "";
  for (let index = 0; index + 5 <= bits.length; index += 5) secret += alphabet[Number.parseInt(bits.slice(index, index + 5), 2)];
  return secret;
}

export function currentTotp(secret: string, now = Date.now()): string {
  return hotp(secret, Math.floor(now / 30_000));
}

export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  const counter = Math.floor(now / 30_000);
  return [-1, 0, 1].some((offset) => hotp(secret, counter + offset) === code);
}

function hotp(secret: string, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0xf;
  const binary = ((digest[offset]! & 0x7f) << 24) | (digest[offset + 1]! << 16) | (digest[offset + 2]! << 8) | digest[offset + 3]!;
  return String(binary % 1_000_000).padStart(6, "0");
}

function decodeBase32(input: string): Buffer {
  const clean = input.replace(/=+$/g, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}
