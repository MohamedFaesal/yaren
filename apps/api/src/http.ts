import type { FastifyReply, FastifyRequest } from "fastify";
import type { ZodType } from "zod";
import { ApplicationError } from "@yaren/shared-kernel";

export const userTypes = ["super-admin", "admin", "staff"] as const;
export const manageableTypes = ["admin", "staff"] as const;
export const roles = ["Doctor", "Nurse", "Receptionist", "Accountant", "CEO", "CTO"] as const;

export type Actor = { sub: string; type: (typeof userTypes)[number]; role: (typeof roles)[number] };

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: Actor;
    user: Actor;
  }
}

export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ");
    throw new ApplicationError(422, "invalid_body", message);
  }
  return parsed.data;
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: "unauthorized", message: "Sign in is required" });
  }
}

export async function requireManager(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.type !== "super-admin" && request.user.type !== "admin") {
    return reply.status(403).send({ error: "forbidden", message: "Only an admin can change records" });
  }
}
