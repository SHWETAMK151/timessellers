// ==============================================================================
// TIMESSELLERS — CUSTOMER ACCOUNT LAYOUT & OVERVIEW (/account)
// Navigation sidebar for Overview, My Orders, My Profile, My Addresses,
// Wishlist, and Shopping Bag.
// ==============================================================================

import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  User as UserIcon,
  MapPin,
  Heart,
  ShoppingBag,
  LogOut,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { fetchCustomerOrders } from '@/services/orderService';
import { formatDate, formatINR, cn } from '@/lib/utils';
import { Badge, Button, EmptyState } from '@/components/ui/LuxuryPrimitives';
import type { Order } from '@/types/database';

export const AccountLayout: React.FC = () => {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { to: '/account', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/account/orders', label: 'My Orders', icon: Package, end: false },
    { to: '/account/profile', label: 'My Profile', icon: UserIcon, end: false },
    { to: '/account/addresses', label: 'My Addresses', icon: MapPin, end: false },
    { to: '/account/wishlist', label: 'Wishlist', icon: Heart, end: false },
    { to: '/cart', label: 'Shopping Bag', icon: ShoppingBag, end: false },
  ];

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Account Navigation Sidebar */}
        <aside className="lg:col-span-3 space-y-6">
          <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 space-y-4">
            <div className="flex items-center gap-3.5">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="w-12 h-12 object-cover border border-[var(--ts-accent)]"
                />
              ) : (
                <div className="w-12 h-12 bg-[var(--ts-bg-elevated)] border border-[var(--ts-border-strong)] flex items-center justify-center font-serif-luxury text-xl text-[var(--ts-accent)]">
                  {(profile?.full_name || 'C').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="overflow-hidden">
                <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--ts-accent)]">
                  Private Client
                </p>
                <p className="font-serif-luxury text-lg text-[var(--ts-text-primary)] truncate">
                  {profile?.full_name || 'Valued Client'}
                </p>
                <p className="text-[11px] text-[var(--ts-text-muted)] truncate">
                  {profile?.phone || user?.phone}
                </p>
              </div>
            </div>

            <nav className="pt-4 border-t border-[var(--ts-border-subtle)] flex flex-col space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3.5 py-2.5 text-xs uppercase tracking-[0.16em] transition-colors',
                        isActive
                          ? 'bg-[var(--ts-accent)]/15 text-[var(--ts-accent)] border-l-2 border-[var(--ts-accent)]'
                          : 'text-[var(--ts-text-secondary)] hover:text-[var(--ts-text-primary)] hover:bg-[var(--ts-bg-elevated)]'
                      )
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}

              <button
                type="button"
                onClick={() => void handleLogout()}
                className="flex items-center gap-3 px-3.5 py-2.5 text-xs uppercase tracking-[0.16em] text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer text-left mt-2"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Secure Sign Out</span>
              </button>
            </nav>
          </div>
        </aside>

        {/* Main Account View */}
        <div className="lg:col-span-9">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export const AccountOverviewPage: React.FC = () => {
  const { user, profile } = useAuth();
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchCustomerOrders(user.id)
      .then((orders) => setRecentOrders(orders.slice(0, 5)))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [user]);

  return (
    <div className="space-y-8">
      <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--ts-accent)]">
            Client Dossier
          </p>
          <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">
            Welcome, {profile?.full_name || 'Valued Client'}
          </h1>
          <p className="text-xs text-[var(--ts-text-muted)]">
            Member since {formatDate(profile?.created_at)} • Registered Mobile: {profile?.phone}
          </p>
        </div>
        <Link to="/shop">
          <Button variant="gold" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
            Explore Vault
          </Button>
        </Link>
      </div>

      {/* Account Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-5 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
            Phone Identity
          </p>
          <p className="text-base font-medium text-[var(--ts-text-primary)]">{profile?.phone || '—'}</p>
          <Badge tone="success">OTP Verified</Badge>
        </div>

        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-5 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
            Electronic Mail
          </p>
          <p className="text-base font-medium text-[var(--ts-text-primary)] truncate">
            {profile?.email || 'Not configured'}
          </p>
          <Link to="/account/profile" className="text-[11px] text-[var(--ts-accent)] hover:underline block">
            Update Profile →
          </Link>
        </div>

        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-5 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
            Recent Acquisitions
          </p>
          <p className="font-serif-luxury text-2xl text-[var(--ts-accent)]">{recentOrders.length}</p>
          <Link to="/account/orders" className="text-[11px] text-[var(--ts-accent)] hover:underline block">
            View Full Order History →
          </Link>
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">Recent Orders</h2>
          <Link
            to="/account/orders"
            className="text-xs uppercase tracking-[0.18em] text-[var(--ts-accent)] hover:underline"
          >
            View All →
          </Link>
        </div>

        {isLoading ? (
          <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-8 text-center text-xs text-[var(--ts-text-muted)]">
            Loading recent acquisitions...
          </div>
        ) : recentOrders.length > 0 ? (
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <div
                key={order.id}
                className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-[var(--ts-accent)] font-medium">
                      {order.order_number}
                    </span>
                    <Badge
                      tone={
                        order.payment_status === 'confirmed'
                          ? 'success'
                          : order.payment_status === 'payment_verification'
                            ? 'gold'
                            : 'warning'
                      }
                    >
                      Payment: {order.payment_status.replace(/_/g, ' ')}
                    </Badge>
                    <Badge tone="neutral">
                      Delivery: {order.delivery_status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--ts-text-muted)] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Placed on {formatDate(order.created_at, true)}</span>
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <span className="font-serif-luxury text-xl text-[var(--ts-text-primary)]">
                    {formatINR(order.final_amount)}
                  </span>
                  <Link to={`/account/orders/${order.id}`}>
                    <Button variant="outline" size="sm">
                      Track Order
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No Orders Placed Yet"
            description="Your confirmed and pending acquisitions will appear here with real-time delivery tracking."
            action={
              <Link to="/shop">
                <Button variant="gold" size="sm">
                  Browse Collections
                </Button>
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
};
