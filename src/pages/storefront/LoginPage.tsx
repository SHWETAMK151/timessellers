// ==============================================================================
// TIMESSELLERS — PHONE NUMBER OTP AUTHENTICATION PAGE (/login)
// Supports Phone Number login, OTP verification, new account creation with full name,
// session persistence, and redirect handling.
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Phone, ShieldCheck, ArrowRight, RotateCcw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { isValidIndianPhone, normalizeIndianPhone, sanitizeRedirectPath } from '@/lib/utils';
import { Button, ErrorBanner, Input } from '@/components/ui/LuxuryPrimitives';

export const LoginPage: React.FC = () => {
  const { user, sendPhoneOtp, verifyPhoneOtp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = sanitizeRedirectPath(searchParams.get('redirect'), '/account');

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [fullName, setFullName] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (user) {
      navigate(redirectTo, { replace: true });
    }
  }, [user, navigate, redirectTo]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isValidIndianPhone(phoneInput)) {
      setError('Please enter a valid 10-digit Indian mobile number (e.g., 9876543210 or +919876543210).');
      return;
    }

    setIsSubmitting(true);
    try {
      await sendPhoneOtp(phoneInput, fullName.trim() || undefined);
      setStep('otp');
      setResendCooldown(30);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to dispatch SMS OTP. Verify Supabase Phone Auth configuration.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(otpToken.trim())) {
      setError('Please enter the 6-digit numeric OTP sent to your mobile phone.');
      return;
    }

    setIsSubmitting(true);
    try {
      await verifyPhoneOtp(phoneInput, otpToken.trim(), fullName.trim() || undefined);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired OTP code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-8 sm:p-10 space-y-8">
        <div className="text-center space-y-2">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ts-accent)]">
            Private Client Portal
          </p>
          <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">
            {step === 'phone' ? 'Sign In or Inscribe' : 'Verify Security Code'}
          </h1>
          <p className="text-xs text-[var(--ts-text-muted)] leading-relaxed">
            {step === 'phone'
              ? 'Authenticate securely using your mobile phone number and a one-time cryptographic SMS passcode.'
              : `Enter the 6-digit verification code dispatched to ${normalizeIndianPhone(phoneInput)}.`}
          </p>
        </div>

        {error && <ErrorBanner message={error} />}

        {step === 'phone' ? (
          <form onSubmit={handleRequestOtp} className="space-y-5">
            <Input
              label="Mobile Phone Number (India +91)"
              type="tel"
              required
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="+91 98765 43210"
              hint="Enter your 10-digit mobile number; +91 will be applied automatically."
            />

            <Input
              label="Full Name (For New Client Accounts)"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g., Aarav Singhania"
              hint="Optional for existing clients."
            />

            <Button
              type="submit"
              variant="gold"
              size="lg"
              className="w-full"
              isLoading={isSubmitting}
              leftIcon={<Phone className="w-4 h-4" />}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Request One-Time Passcode
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <Input
              label="6-Digit OTP Verification Code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              autoFocus
              value={otpToken}
              onChange={(e) => setOtpToken(e.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
              className="tracking-[0.5em] text-center text-lg font-medium"
            />

            <Button
              type="submit"
              variant="gold"
              size="lg"
              className="w-full"
              isLoading={isSubmitting}
              leftIcon={<ShieldCheck className="w-4 h-4" />}
            >
              Verify &amp; Enter Maison
            </Button>

            <div className="flex items-center justify-between pt-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setOtpToken('');
                  setError(null);
                }}
                className="text-[var(--ts-text-muted)] hover:text-[var(--ts-text-primary)] cursor-pointer"
              >
                ← Change Phone Number
              </button>

              <button
                type="button"
                disabled={resendCooldown > 0 || isSubmitting}
                onClick={(e) => void handleRequestOtp(e)}
                className="inline-flex items-center gap-1.5 text-[var(--ts-accent)] disabled:text-[var(--ts-text-faint)] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                </span>
              </button>
            </div>
          </form>
        )}

        <div className="pt-6 border-t border-[var(--ts-border-subtle)] text-center">
          <p className="text-[11px] text-[var(--ts-text-muted)] leading-relaxed">
            By authenticating, you agree to the TIMESSELLERS{' '}
            <Link to="/terms" className="text-[var(--ts-text-secondary)] underline hover:text-[var(--ts-accent)]">
              Terms &amp; Conditions
            </Link>{' '}
            and{' '}
            <Link to="/privacy-policy" className="text-[var(--ts-text-secondary)] underline hover:text-[var(--ts-accent)]">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
};
