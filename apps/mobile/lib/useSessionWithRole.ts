import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface SessionWithRole {
  session: Session | null;
  user: User | null;
  userRole: string | null;
  isAdmin: boolean;
  loading: boolean;
}

export function useSessionWithRole(): SessionWithRole {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchUserRole = async (userId: string) => {
      const { data, error } = await supabase
        .from('app_role_assignments')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (!isMounted) return;

      if (!error && data?.role) {
        setUserRole(data.role);
      } else {
        setUserRole(null);
      }
    };

    const syncSession = async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;

      const currentSession = data.session ?? null;
      setSession(currentSession);

      if (currentSession?.user) {
        await fetchUserRole(currentSession.user.id);
      } else {
        setUserRole(null);
      }

      if (isMounted) setLoading(false);
    };

    const { data: authSubscription } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession ?? null);

      if (nextSession?.user) {
        setLoading(true);
        await fetchUserRole(nextSession.user.id);
        if (isMounted) setLoading(false);
      } else {
        setUserRole(null);
        setLoading(false);
      }
    });

    syncSession();

    return () => {
      isMounted = false;
      authSubscription?.subscription?.unsubscribe();
    };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    userRole,
    isAdmin: userRole === 'admin',
    loading,
  };
}
