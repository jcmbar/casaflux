export type FamilyRole = "owner" | "admin" | "member";

export type Family = {
  id: string;
  name: string;
  slug: string | null;
  created_by: string | null;
  created_at: string;
};

export type FamilyMember = {
  id: string;
  family_id: string;
  user_id: string;
  role: FamilyRole;
  can_invite: boolean;
  created_at: string;
  families?: Family | null;
};

export type FamilyWithMembership = {
  family: Family;
  membership: FamilyMember;
};

export type FamilyInvitation = {
  id: string;
  family_id: string;
  email: string;
  role: FamilyRole;
  token: string;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

export type FamilyInvitationPreview = {
  status: "valid" | "expired" | "accepted" | "invalid";
  familyName: string | null;
  role: FamilyRole;
  expiresAt: string | null;
  invitedEmail: string | null;
};

export type FamilyMemberWithProfile = FamilyMember & {
  profiles: {
    full_name: string | null;
    email: string | null;
  } | null;
};
