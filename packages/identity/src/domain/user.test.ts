import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DomainError } from "@yaren/shared-kernel";
import { User } from "./user.js";

describe("User", () => {
  it("registers staff with a normalized email", () => {
    const user = User.register({
      id: "user-1",
      email: "Layla@Yaren.Local",
      passwordHash: "hash",
      displayName: "Dr. Layla Hassan",
      role: "physician",
      centerId: "center-1",
      createdAt: new Date("2026-09-25T08:00:00.000Z"),
    });
    assert.equal(user.toSnapshot().email, "layla@yaren.local");
    assert.equal(user.isActivePractitioner(), true);
  });

  it("does not treat a receptionist as a practitioner", () => {
    const user = User.register({
      id: "user-2",
      email: "front@yaren.local",
      passwordHash: "hash",
      displayName: "Front Desk",
      role: "receptionist",
      centerId: null,
      createdAt: new Date("2026-09-25T08:00:00.000Z"),
    });
    assert.equal(user.isActivePractitioner(), false);
  });

  it("rejects an invalid email", () => {
    assert.throws(
      () =>
        User.register({
          id: "user-3",
          email: "not-an-email",
          passwordHash: "hash",
          displayName: "Front Desk",
          role: "receptionist",
          centerId: null,
          createdAt: new Date(),
        }),
      (error: unknown) => error instanceof DomainError && error.code === "email_invalid",
    );
  });
});
