import { useEffect } from "react";
import { supabase } from "../services/supabase";
import { useAuthStore } from "../store/authStore";

export function useAuth() {
  const setSession = useAuthStore((state) => state.setSession);
  const setUser = useAuthStore((state) => state.setUser);
  const setProfile = useAuthStore((state) => state.setProfile);
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    // Fetch current active session on mount
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn("Failed to retrieve Supabase session on mount:", err);
        setLoading(false);
      });

    // Subscribe to auth state changes (sign-in, token refresh, sign-out)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        if (
          event === "SIGNED_IN" ||
          event === "USER_UPDATED" ||
          event === "TOKEN_REFRESHED"
        ) {
          setLoading(true);
          await fetchProfile(session.user.id);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setSession, setUser, setProfile, setLoading]);

  // Retrieve user profiles details from the database profiles table
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        // Log error but do not throw, as new users may not have a profile row yet
        console.warn("Profile check completed: User profile row not found or uninitialized.");
        setProfile(null);
      } else {
        setProfile(data);
      }
    } catch (e) {
      console.error("Error fetching user profile:", e);
    } finally {
      setLoading(false);
    }
  };
}
