// ==============================================================================
// TIMESSELLERS — PROTECTED CUSTOMER & ADMIN ROUTE GUARDS
// Enforces authentication, account restriction checks, and admin role guards.
// ==============================================================================

import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_LOGIN_PATH } from '@/lib/utils';
import { Button } from '@/components/ui/LuxuryPrimitives';

export const ProtectedCustomerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, isLoading, signOut } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--ts-accent)]" />
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
          Verifying Session...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (profile?.is_restricted) {
    return (
      <div className="max-w-lg mx-auto my-20 p-10 border border-red-900/50 bg-[var(--ts-bg-card)] text-center space-y-5">
        <ShieldAlert className="w-10 h-10 text-red-400 mx-auto" />
        <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">Account Access Restricted</h2>
        <p className="text-xs text-[var(--ts-text-secondary)] leading-relaxed">
          {profile.restriction_reason ||
            'Your account has been restricted by our security compliance desk. Please contact concierge@timessellers.com for assistance.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => void signOut()}>
          Sign Out
        </Button>
      </div>
    );
  }

  return <>{children}</>;
};

export const ProtectedAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--ts-bg-main)] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--ts-accent)]" />
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
          Verifying Administrative Clearance...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`${ADMIN_LOGIN_PATH}?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[var(--ts-bg-main)] flex items-center justify-center px-4">
        <div className="max-w-md w-full border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] p-10 text-center space-y-5">
          <ShieldAlert className="w-10 h-10 text-[var(--ts-accent)] mx-auto" />
          <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--ts-accent)]">
            Restricted Area
          </p>
          <h1 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
            Administrative Authorization Required
          </h1>
          <p className="text-xs text-[var(--ts-text-muted)] leading-relaxed">
            Your account does not hold administrative privileges. All access attempts are logged by
            Row Level Security.
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <Link to={ADMIN_LOGIN_PATH}>
              <Button variant="gold" size="sm">
                Sign In with Admin Username
              </Button>
            </Link>
            <Link to="/">
              <Button variant="outline" size="sm">
                Return to Storefront
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
