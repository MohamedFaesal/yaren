import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DomainError } from "@yaren/shared-kernel";
import { MedicalCenter } from "./medical-center.js";

const openedAt = new Date("2026-09-25T08:00:00.000Z");

function openCenter() {
  return MedicalCenter.open({
    id: "center-1",
    name: "Yaren Nasr City",
    code: "nasr1",
    addressLine: "12 Abbas El Akkad",
    city: "Cairo",
    phone: "+20 100 000 0000",
    openedAt,
  });
}

describe("MedicalCenter", () => {
  it("opens a center with a normalized code", () => {
    const snapshot = openCenter().toSnapshot();
    assert.equal(snapshot.code, "NASR1");
    assert.equal(snapshot.status, "active");
    assert.equal(snapshot.phone, "+201000000000");
  });

  it("rejects an invalid center code", () => {
    assert.throws(
      () =>
        MedicalCenter.open({
          id: "center-1",
          name: "Yaren",
          code: "N",
          addressLine: "12 Abbas",
          city: "Cairo",
          phone: "01000000000",
          openedAt,
        }),
      (error: unknown) => error instanceof DomainError && error.code === "center_code_invalid",
    );
  });

  it("suspends and activates a center", () => {
    const center = openCenter();
    center.pullDomainEvents();
    center.suspend(new Date("2026-09-26T08:00:00.000Z"));
    assert.equal(center.toSnapshot().status, "suspended");
    assert.throws(
      () => center.suspend(openedAt),
      (error: unknown) => error instanceof DomainError && error.code === "center_already_suspended",
    );
    center.activate(new Date("2026-09-27T08:00:00.000Z"));
    assert.equal(center.toSnapshot().status, "active");
  });
});
