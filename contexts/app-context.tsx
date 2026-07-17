"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type {
  Family,
  FamilyMember,
  FamilyWithMembership,
  Profile,
} from "@/types";

const ACTIVE_FAMILY_KEY = "casaflux:active-family-id";

type AppContextValue = {
  user: User | null;
  profile: Profile | null;
  families: FamilyWithMembership[];
  activeFamily: Family | null;
  activeMembership: FamilyMember | null;
  loading: boolean;
  setActiveFamilyId: (familyId: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  isFamilyAdmin: boolean;
  canInvite: boolean;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient()!, []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [families, setFamilies] = useState<FamilyWithMembership[]>([]);
  const [activeFamilyId, setActiveFamilyIdState] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  const loadContext = useCallback(async () => {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    setUser(currentUser);

    if (!currentUser) {
      setProfile(null);
      setFamilies([]);
      setActiveFamilyIdState(null);
      setLoading(false);
      return;
    }

    const [profileRes, membersRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(),
      supabase
        .from("family_members")
        .select("*, families (*)")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: true }),
    ]);

    if (profileRes.error) {
      console.error(profileRes.error);
    }

    setProfile((profileRes.data as Profile | null) ?? null);

    if (membersRes.error) {
      console.error(membersRes.error);
      setFamilies([]);
    } else {
      const mapped = (membersRes.data ?? [])
        .map((row) => {
          const membership = row as FamilyMember;
          const family = (row as { families?: Family | null }).families;

          if (!family) return null;

          return { family, membership };
        })
        .filter(Boolean) as FamilyWithMembership[];

      setFamilies(mapped);

      const storedFamilyId =
        typeof window !== "undefined"
          ? window.localStorage.getItem(ACTIVE_FAMILY_KEY)
          : null;

      const initialFamilyId =
        mapped.find((item) => item.family.id === storedFamilyId)?.family.id ??
        mapped[0]?.family.id ??
        null;

      setActiveFamilyIdState(initialFamilyId);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadContext();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadContext();
    });

    return () => subscription.unsubscribe();
  }, [loadContext, supabase]);

  const setActiveFamilyId = useCallback((familyId: string) => {
    setActiveFamilyIdState(familyId);
    window.localStorage.setItem(ACTIVE_FAMILY_KEY, familyId);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.localStorage.removeItem(ACTIVE_FAMILY_KEY);
    setUser(null);
    setProfile(null);
    setFamilies([]);
    setActiveFamilyIdState(null);
  }, [supabase]);

  const activeEntry = families.find(
    (item) => item.family.id === activeFamilyId,
  );

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      profile,
      families,
      activeFamily: activeEntry?.family ?? null,
      activeMembership: activeEntry?.membership ?? null,
      loading,
      setActiveFamilyId,
      refresh: loadContext,
      signOut,
      isFamilyAdmin: ["owner", "admin"].includes(
        activeEntry?.membership.role ?? "",
      ),
      canInvite:
        ["owner", "admin"].includes(activeEntry?.membership.role ?? "") ||
        Boolean(activeEntry?.membership.can_invite),
    }),
    [
      user,
      profile,
      families,
      activeEntry,
      loading,
      setActiveFamilyId,
      loadContext,
      signOut,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error("useAppContext must be used within AppProvider");
  }

  return context;
}
