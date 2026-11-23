// ==============================================================================
// TIMESSELLERS — LUXURY DESIGN SYSTEM PRIMITIVES
// Palette: Obsidian Black (#070707), Charcoal (#111111, #181818),
// Subtle Border (#262626), Champagne Gold (#C5A059), Alabaster (#F5F5F0).
// ==============================================================================

import React from 'react';
import { Loader2, AlertCircle, PackageOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'gold' | 'outline' | 'charcoal' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'gold',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  ...props
}) => {
  const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
    gold: 'bg-[var(--ts-accent)] text-[var(--ts-on-accent)] hover:bg-[var(--ts-accent-hover)] font-medium border border-[var(--ts-accent)]',
    outline:
      'bg-transparent text-[var(--ts-text-primary)] border border-[var(--ts-border-strong)] hover:border-[var(--ts-accent)] hover:text-[var(--ts-accent)]',
    charcoal:
      'bg-[var(--ts-bg-elevated)] text-[var(--ts-text-primary)] border border-[var(--ts-border-strong)] hover:bg-[var(--ts-border-subtle)] hover:border-[var(--ts-border-strong)]',
    ghost: 'bg-transparent text-[var(--ts-text-secondary)] hover:text-[var(--ts-text-primary)] hover:bg-[var(--ts-bg-elevated)]',
    danger:
      'bg-red-500/15 text-red-700 border border-red-600/40 hover:bg-red-500/25',
  };

  const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
    sm: 'px-3.5 py-2 text-xs tracking-widest uppercase',
    md: 'px-6 py-3 text-xs tracking-[0.18em] uppercase',
    lg: 'px-8 py-4 text-xs tracking-[0.22em] uppercase',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2.5 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : leftIcon}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </button>
  );
};

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  className,
  id,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[11px] uppercase tracking-[0.18em] text-[var(--ts-text-secondary)]"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'w-full bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] px-4 py-3 text-sm text-[var(--ts-text-primary)] placeholder:text-[var(--ts-text-faint)] focus:outline-none focus:border-[var(--ts-accent)] transition-colors',
          error && 'border-red-500/70 focus:border-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && hint && <p className="text-[11px] text-[var(--ts-text-muted)]">{hint}</p>}
    </div>
  );
};

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  options,
  className,
  id,
  ...props
}) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-[11px] uppercase tracking-[0.18em] text-[var(--ts-text-secondary)]"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          'w-full bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] px-4 py-3 text-sm text-[var(--ts-text-primary)] focus:outline-none focus:border-[var(--ts-accent)] transition-colors',
          error && 'border-red-500/70',
          className
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[var(--ts-bg-card)] text-[var(--ts-text-primary)]">
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
};

export const Badge: React.FC<{
  children: React.ReactNode;
  tone?: 'gold' | 'success' | 'warning' | 'danger' | 'neutral';
  className?: string;
}> = ({ children, tone = 'neutral', className }) => {
  const tones = {
    gold: 'bg-[var(--ts-accent)]/15 text-[var(--ts-accent)] border-[var(--ts-accent)]/40 font-medium',
    success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-600/35 font-medium',
    warning: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-600/35 font-medium',
    danger: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-600/35 font-medium',
    neutral: 'bg-[var(--ts-bg-subtle)] text-[var(--ts-text-secondary)] border-[var(--ts-border-strong)]',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] border',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ title, description, icon, action }) => (
  <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-12 text-center flex flex-col items-center justify-center space-y-4">
    <div className="w-12 h-12 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] flex items-center justify-center text-[var(--ts-accent)]">
      {icon || <PackageOpen className="w-5 h-5" />}
    </div>
    <div className="space-y-1.5 max-w-md">
      <h3 className="font-serif-luxury text-xl text-[var(--ts-text-primary)] tracking-wide">{title}</h3>
      <p className="text-xs text-[var(--ts-text-muted)] leading-relaxed">{description}</p>
    </div>
    {action && <div className="pt-2">{action}</div>}
  </div>
);

export const ErrorBanner: React.FC<{ message: string; onRetry?: () => void }> = ({
  message,
  onRetry,
}) => (
  <div className="border border-red-600/40 bg-red-500/10 p-4 flex items-center justify-between gap-4 text-red-700 text-xs font-medium">
    <div className="flex items-center gap-3">
      <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
      <span>{message}</span>
    </div>
    {onRetry && (
      <button
        onClick={onRetry}
        className="underline uppercase tracking-widest text-[10px] text-red-700 hover:text-red-900 cursor-pointer"
      >
        Retry
      </button>
    )}
  </div>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse bg-[var(--ts-bg-subtle)]', className)} />
);
