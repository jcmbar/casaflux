import { describe, expect, it } from "vitest";

import { canManageAdminTarget } from "./permissions";

describe("canManageAdminTarget", () => {
  it("blocks self management", () => {
    expect(
      canManageAdminTarget({
        actorRole: "master",
        actorUserId: "a",
        targetUserId: "a",
        targetRole: "user",
      }),
    ).toBe(false);
  });

  it("allows admin to manage regular users", () => {
    expect(
      canManageAdminTarget({
        actorRole: "admin",
        actorUserId: "a",
        targetUserId: "b",
        targetRole: "user",
      }),
    ).toBe(true);
  });

  it("blocks admin from managing another admin or master", () => {
    expect(
      canManageAdminTarget({
        actorRole: "admin",
        actorUserId: "a",
        targetUserId: "b",
        targetRole: "admin",
      }),
    ).toBe(false);
    expect(
      canManageAdminTarget({
        actorRole: "admin",
        actorUserId: "a",
        targetUserId: "b",
        targetRole: "master",
      }),
    ).toBe(false);
  });

  it("allows master to manage admin and users", () => {
    expect(
      canManageAdminTarget({
        actorRole: "master",
        actorUserId: "a",
        targetUserId: "b",
        targetRole: "admin",
      }),
    ).toBe(true);
  });
});
