// ==============================================================================
// TIMESSELLERS — DEDICATED ADMIN USERNAME & PASSWORD LOGIN (/admin/login)
// Direct Username & Password authentication secured in Supabase Auth (Bcrypt)
// + Row Level Security (`public.user_roles`). Zero OTP required for administrators.
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ShieldCheck, Lock, User, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button, ErrorBanner, Input } from '@/components/ui/LuxuryPrimitives';

export const AdminLoginPage: React.FC = () => {
  const { user, isAdmin, signInAdminWithPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/admin';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && isAdmin) {
      navigate(redirectTo, { replace: true });
    }
  }, [user, isAdmin, navigate, redirectTo]);

  const handleAdminSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signInAdminWithPassword(username, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Invalid administrator username or password.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--ts-bg-main)] text-[var(--ts-text-primary)] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] p-8 sm:p-10 space-y-8 shadow-2xl">
        <div className="text-center space-y-2.5">
          <div className="w-12 h-12 mx-auto border border-[var(--ts-accent)]/40 bg-[var(--ts-bg-accent-tint)] flex items-center justify-center text-[var(--ts-accent)]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ts-accent)]">
            TIMESSELLERS • Executive Vault
          </p>
          <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">
            Administrator Sign In
          </h1>
          <p className="text-xs text-[var(--ts-text-muted)] leading-relaxed">
            Enter your Supabase-secured administrator username and password. No OTP required.
          </p>
        </div>

        {error && <ErrorBanner message={error} />}

        <form onSubmit={handleAdminSignIn} className="space-y-5">
          <div className="relative">
            <Input
              label="Admin Username"
              type="text"
              required
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g., shwetank"
            />
            <User className="w-4 h-4 text-[var(--ts-text-muted)] absolute right-3.5 top-9 pointer-events-none" />
          </div>

          <div className="relative">
            <Input
              label="Admin Password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
            />
            <Lock className="w-4 h-4 text-[var(--ts-text-muted)] absolute right-3.5 top-9 pointer-events-none" />
          </div>

          <Button
            type="submit"
            variant="gold"
            size="lg"
            className="w-full"
            isLoading={isSubmitting}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Unlock Executive Control Center
          </Button>
        </form>

        <div className="pt-6 border-t border-[var(--ts-border-subtle)] flex items-center justify-between text-[11px] text-[var(--ts-text-muted)]">
          <span>Secured by Supabase Auth &amp; RLS</span>
          <Link to="/" className="text-[var(--ts-accent)] hover:underline">
            ← Return to Storefront
          </Link>
        </div>
      </div>
    </div>
  );
};
