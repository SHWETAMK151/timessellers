// ==============================================================================
// TIMESSELLERS — AUTHENTICATION & ROLE CONTEXT
// Handles Phone Number OTP Authentication, Profile management, and Role guards.
// ==============================================================================

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { normalizeIndianPhone } from '@/lib/utils';
import type { Profile, UserRoleType } from '@/types/database';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: UserRoleType[];
  isAdmin: boolean;
  isLoading: boolean;
  sendPhoneOtp: (phone: string, fullName?: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, token: string, fullName?: string) => Promise<void>;
  signInAdminWithPassword: (usernameOrEmail: string, password: string) => Promise<void>;
  updateAdminCredentials: (newUsername: string, newPassword?: string) => Promise<void>;
  updateProfile: (updates: Partial<Pick<Profile, 'full_name' | 'email' | 'avatar_url'>>) => Promise<Profile>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRoleType[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadProfileAndRoles = useCallback(async (authUser: User) => {
    if (!isSupabaseConfigured) return;

    const normalizedPhone = normalizeIndianPhone(authUser.phone || authUser.user_metadata?.phone || '');

    const [profileRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', authUser.id),
    ]);

    if (profileRes.data) {
      setProfile(profileRes.data as Profile);
    } else {
      // Ensure profile record exists if trigger didn't run
      const { data: createdProfile } = await supabase
        .from('profiles')
        .upsert({
          id: authUser.id,
          full_name: (authUser.user_metadata?.full_name as string) || 'Valued Client',
          phone: normalizedPhone || `user-${authUser.id.slice(0, 8)}`,
          email: authUser.email ?? null,
        })
        .select('*')
        .maybeSingle();

      if (createdProfile) {
        setProfile(createdProfile as Profile);
      }
    }

    if (rolesRes.data && rolesRes.data.length > 0) {
      setRoles(rolesRes.data.map((r) => r.role as UserRoleType));
    } else {
      setRoles(['customer']);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (!mounted) return;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user) {
        await loadProfileAndRoles(currentSession.user);
      }
      if (mounted) setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        await loadProfileAndRoles(newSession.user);
      } else {
        setProfile(null);
        setRoles([]);
      }
      if (mounted) setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfileAndRoles]);

  const sendPhoneOtp = async (phoneInput: string, fullName?: string) => {
    const formattedPhone = normalizeIndianPhone(phoneInput);
    const { error } = await supabase.auth.signInWithOtp({
      phone: formattedPhone,
      options: {
        data: fullName ? { full_name: fullName.trim(), phone: formattedPhone } : { phone: formattedPhone },
      },
    });
    if (error) throw new Error(error.message);
  };

  const verifyPhoneOtp = async (phoneInput: string, token: string, fullName?: string) => {
    const formattedPhone = normalizeIndianPhone(phoneInput);
    const { data, error } = await supabase.auth.verifyOtp({
      phone: formattedPhone,
      token: token.trim(),
      type: 'sms',
    });

    if (error) throw new Error(error.message);

    if (data.user) {
      if (fullName && fullName.trim().length > 0) {
        await supabase
          .from('profiles')
          .update({ full_name: fullName.trim() })
          .eq('id', data.user.id);
      }
      await loadProfileAndRoles(data.user);
    }
  };

  const signInAdminWithPassword = async (usernameOrEmail: string, password: string) => {
    const cleanInput = usernameOrEmail.trim();
    if (!cleanInput || !password) {
      throw new Error('Administrator username and password are required.');
    }

    // Resolve username to the admin account's email in Supabase via secure RPC
    const { data: resolvedEmail, error: resolveErr } = await supabase.rpc(
      'resolve_admin_login_email',
      { p_identifier: cleanInput }
    );

    if (resolveErr) {
      throw new Error(resolveErr.message);
    }

    const loginEmail =
      (resolvedEmail as string | null) ||
      (cleanInput.includes('@') ? cleanInput.toLowerCase() : `${cleanInput.toLowerCase()}@admin.timessellers.com`);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (error || !data.user) {
      await supabase.rpc('record_admin_login_failure', { p_identifier: cleanInput });
      throw new Error('Invalid administrator username or password.');
    }

    await loadProfileAndRoles(data.user);

    // Verify the authenticated account holds admin or super_admin clearance in Supabase
    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', data.user.id);

    const hasAdminRole = (roleRows ?? []).some(
      (r) => r.role === 'admin' || r.role === 'super_admin'
    );

    if (!hasAdminRole) {
      await supabase.auth.signOut();
      await supabase.rpc('record_admin_login_failure', { p_identifier: cleanInput });
      throw new Error('Unauthorized: This account does not have administrative clearance.');
    }

    await supabase.rpc('clear_admin_login_failures', { p_identifier: cleanInput });
  };

  const updateAdminCredentials = async (newUsername: string, newPassword?: string) => {
    const { error } = await supabase.rpc('admin_update_own_credentials', {
      p_new_username: newUsername.trim().toLowerCase(),
      p_new_password: newPassword && newPassword.length > 0 ? newPassword : null,
    });
    if (error) throw new Error(error.message);
    await refreshProfile();
  };

  const updateProfile = async (
    updates: Partial<Pick<Profile, 'full_name' | 'email' | 'avatar_url'>>
  ): Promise<Profile> => {
    if (!user) throw new Error('Not authenticated.');

    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    const updated = data as Profile;
    setProfile(updated);
    return updated;
  };

  const refreshProfile = async () => {
    if (user) {
      await loadProfileAndRoles(user);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
  };

  const isAdmin =
    !profile?.is_restricted &&
    (roles.includes('admin') || roles.includes('super_admin'));

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        isAdmin,
        isLoading,
        sendPhoneOtp,
        verifyPhoneOtp,
        signInAdminWithPassword,
        updateAdminCredentials,
        updateProfile,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
