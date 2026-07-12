import { describe, expect, it } from "vitest";
import { authorizeSpace, type AuthorizationMembership, type AuthorizationSpace } from "../lib/space-authorization";

const space: AuthorizationSpace = { id: "space-a", type: "private", status: "active" };
const learner: AuthorizationMembership = { spaceId: space.id, userId: 10, status: "active", role: "learner" };

describe("central Space authorization contract", () => {
  it("rejects missing and wrong-Space memberships", () => {
    expect(authorizeSpace({ userId: 10, capability: "content.read", space, membership: null }))
      .toEqual({ allowed: false, reason: "membership_required" });
    expect(authorizeSpace({ userId: 10, capability: "content.read", space, membership: { ...learner, spaceId: "space-b" } }))
      .toEqual({ allowed: false, reason: "wrong_space" });
  });

  it("rejects inactive and expired memberships", () => {
    for (const status of ["invited", "suspended", "removed", "expired"] as const) {
      expect(authorizeSpace({ userId: 10, capability: "content.read", space, membership: { ...learner, status } }))
        .toEqual({ allowed: false, reason: "membership_inactive" });
    }
    expect(authorizeSpace({
      now: new Date("2026-07-12T00:00:00Z"), userId: 10, capability: "content.read", space,
      membership: { ...learner, expiresAt: "2026-07-11T23:59:59Z" },
    })).toEqual({ allowed: false, reason: "membership_expired" });
  });

  it("keeps member evidence from learners and creators", () => {
    for (const role of ["learner", "creator"] as const) {
      expect(authorizeSpace({ userId: 10, capability: "evidence.read_members", space, membership: { ...learner, role } }))
        .toEqual({ allowed: false, reason: "capability_missing" });
    }
  });

  it("lets managers report but not publish", () => {
    const manager = { ...learner, role: "manager" as const };
    expect(authorizeSpace({ userId: 10, capability: "evidence.read_members", space, membership: manager }).allowed).toBe(true);
    expect(authorizeSpace({ userId: 10, capability: "content.publish", space, membership: manager }))
      .toEqual({ allowed: false, reason: "capability_missing" });
  });

  it("makes archived Spaces read-only and suspended Spaces inaccessible", () => {
    const owner = { ...learner, role: "owner" as const };
    expect(authorizeSpace({ userId: 10, capability: "content.update", space: { ...space, status: "archived" }, membership: owner }))
      .toEqual({ allowed: false, reason: "space_read_only" });
    expect(authorizeSpace({ userId: 10, capability: "content.read", space: { ...space, status: "suspended" }, membership: owner }))
      .toEqual({ allowed: false, reason: "space_suspended" });
  });

  it("allows only public published content without membership", () => {
    const publicSpace = { ...space, type: "public" as const };
    expect(authorizeSpace({
      userId: null, capability: "content.read", space: publicSpace,
      resource: { owningSpaceId: space.id, publication: "public", lifecycle: "published" },
    })).toEqual({ allowed: true, basis: "public_content" });
    expect(authorizeSpace({
      userId: null, capability: "content.read", space: { ...publicSpace, type: "unlisted" },
      resource: { owningSpaceId: space.id, publication: "unlisted", lifecycle: "published" },
    })).toEqual({ allowed: false, reason: "membership_required" });
  });

  it("rejects resources owned by another Space", () => {
    expect(authorizeSpace({
      userId: 10, capability: "content.read", space, membership: learner,
      resource: { owningSpaceId: "space-b", publication: "private", lifecycle: "published" },
    })).toEqual({ allowed: false, reason: "wrong_space" });
  });
});
