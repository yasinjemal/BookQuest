export type SpaceType = "personal" | "private" | "unlisted" | "organization" | "public";
export type SpaceStatus = "active" | "suspended" | "archived" | "deletion_scheduled";
export type MembershipStatus = "invited" | "active" | "suspended" | "removed" | "expired";
export type SpaceRole = "owner" | "administrator" | "creator" | "reviewer" | "manager" | "learner" | "auditor";
export type SpaceCapability =
  | "space.read" | "space.update" | "space.manage_policy" | "space.manage_lifecycle"
  | "members.read" | "members.invite" | "members.manage"
  | "content.read" | "content.create" | "content.update" | "content.review" | "content.publish"
  | "assignments.manage" | "learning.participate" | "evidence.read_own"
  | "evidence.read_members" | "evidence.export" | "audit.read";

const READ_ONLY_CAPABILITIES = new Set<SpaceCapability>([
  "space.read", "members.read", "content.read", "evidence.read_own",
  "evidence.read_members", "audit.read",
]);

export const ROLE_CAPABILITIES: Readonly<Record<SpaceRole, ReadonlySet<SpaceCapability>>> = {
  owner: new Set([
    "space.read", "space.update", "space.manage_policy", "space.manage_lifecycle",
    "members.read", "members.invite", "members.manage", "content.read", "content.create",
    "content.update", "content.review", "content.publish", "assignments.manage",
    "learning.participate", "evidence.read_own", "evidence.read_members", "evidence.export", "audit.read",
  ]),
  administrator: new Set([
    "space.read", "space.update", "space.manage_policy", "members.read", "members.invite",
    "members.manage", "content.read", "content.create", "content.update", "content.review",
    "content.publish", "assignments.manage", "learning.participate", "evidence.read_own",
    "evidence.read_members", "evidence.export", "audit.read",
  ]),
  creator: new Set([
    "space.read", "members.read", "content.read", "content.create", "content.update",
    "content.review", "learning.participate", "evidence.read_own",
  ]),
  reviewer: new Set([
    "space.read", "members.read", "content.read", "content.review",
    "learning.participate", "evidence.read_own",
  ]),
  manager: new Set([
    "space.read", "members.read", "members.invite", "content.read", "assignments.manage",
    "learning.participate", "evidence.read_own", "evidence.read_members", "evidence.export",
  ]),
  learner: new Set(["space.read", "content.read", "learning.participate", "evidence.read_own"]),
  auditor: new Set(["space.read", "members.read", "content.read", "evidence.read_members", "evidence.export", "audit.read"]),
};

export interface AuthorizationSpace { id: string; type: SpaceType; status: SpaceStatus }
export interface AuthorizationMembership {
  spaceId: string; userId: number; status: MembershipStatus; role: SpaceRole; expiresAt?: string | null;
}
export interface AuthorizationResource {
  owningSpaceId: string; publication: "private" | "unlisted" | "public"; lifecycle: "draft" | "published" | "archived";
}
export type AuthorizationDenial =
  | "wrong_space" | "membership_required" | "membership_inactive" | "membership_expired"
  | "space_suspended" | "space_read_only" | "capability_missing";
export type AuthorizationDecision =
  | { allowed: true; basis: "membership" | "public_content" }
  | { allowed: false; reason: AuthorizationDenial };

/** Deny-by-default Space authorization. Platform `admin` is intentionally absent:
 * operating the service does not grant implicit access to tenant data. */
export function authorizeSpace(input: {
  now?: Date;
  userId: number | null;
  capability: SpaceCapability;
  space: AuthorizationSpace;
  membership?: AuthorizationMembership | null;
  resource?: AuthorizationResource | null;
}): AuthorizationDecision {
  const { capability, membership, resource, space, userId } = input;
  if (resource && resource.owningSpaceId !== space.id) return { allowed: false, reason: "wrong_space" };
  if (
    capability === "content.read" && space.type === "public" && space.status === "active" &&
    resource?.publication === "public" && resource.lifecycle === "published"
  ) return { allowed: true, basis: "public_content" };
  if (!membership || userId === null || membership.userId !== userId) {
    return { allowed: false, reason: "membership_required" };
  }
  if (membership.spaceId !== space.id) return { allowed: false, reason: "wrong_space" };
  if (membership.status !== "active") return { allowed: false, reason: "membership_inactive" };
  if (membership.expiresAt && new Date(membership.expiresAt).getTime() <= (input.now ?? new Date()).getTime()) {
    return { allowed: false, reason: "membership_expired" };
  }
  if (space.status === "suspended" && capability !== "space.manage_lifecycle") {
    return { allowed: false, reason: "space_suspended" };
  }
  if (
    (space.status === "archived" || space.status === "deletion_scheduled") &&
    !READ_ONLY_CAPABILITIES.has(capability) && capability !== "space.manage_lifecycle"
  ) return { allowed: false, reason: "space_read_only" };
  if (!ROLE_CAPABILITIES[membership.role].has(capability)) {
    return { allowed: false, reason: "capability_missing" };
  }
  return { allowed: true, basis: "membership" };
}
