// ==============================================================================
// TIMESSELLERS — ADMINISTRATIVE DASHBOARD LAYOUT & OVERVIEW (/admin)
// Protected by ProtectedAdminRoute + Supabase RLS `is_admin()`.
// Displays real database metrics, daily/weekly/monthly sales graphs,
// revenue & order trends, best-selling products, and recent transactions.
// ==============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  FolderTree,
  ShoppingCart,
  Users,
  CreditCard,
  Boxes,
  BarChart3,
  Settings,
  LogOut,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { fetchAdminAnalytics, fetchAdminRecentOrders } from '@/services/adminService';
import { formatDate, formatINR, cn, ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from '@/lib/utils';
import { Badge, Button, EmptyState, ErrorBanner } from '@/components/ui/LuxuryPrimitives';
import type { AdminDashboardAnalytics, Order, SalesSeriesPoint } from '@/types/database';

export const AdminLayout: React.FC = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navLinks = [
    { to: ADMIN_BASE_PATH, label: 'Overview', icon: LayoutDashboard, end: true },
    { to: `${ADMIN_BASE_PATH}/products`, label: 'Products', icon: Package, end: false },
    { to: `${ADMIN_BASE_PATH}/categories`, label: 'Categories', icon: FolderTree, end: false },
    { to: `${ADMIN_BASE_PATH}/orders`, label: 'Orders', icon: ShoppingCart, end: false },
    { to: `${ADMIN_BASE_PATH}/payments`, label: 'Payments & UPI', icon: CreditCard, end: false },
    { to: `${ADMIN_BASE_PATH}/inventory`, label: 'Inventory', icon: Boxes, end: false },
    { to: `${ADMIN_BASE_PATH}/customers`, label: 'Customers', icon: Users, end: false },
    { to: `${ADMIN_BASE_PATH}/analytics`, label: 'Sales Analytics', icon: BarChart3, end: false },
    { to: `${ADMIN_BASE_PATH}/settings`, label: 'Store Settings', icon: Settings, end: false },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate(ADMIN_LOGIN_PATH);
  };

  return (
    <div className="min-h-screen bg-[var(--ts-bg-main)] text-[var(--ts-text-primary)] flex flex-col lg:flex-row overflow-x-clip">
      {/* Mobile Admin Topbar */}
      <div className="lg:hidden bg-[var(--ts-bg-card)] border-b border-[var(--ts-border-subtle)] px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 text-[var(--ts-text-primary)] hover:text-[var(--ts-accent)] cursor-pointer"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="font-serif-luxury text-xl tracking-[0.22em] text-[var(--ts-accent)]">
            TIMESSELLERS ADMIN
          </span>
        </div>
        <Link to="/" className="text-[11px] uppercase tracking-widest text-[var(--ts-text-secondary)]">
          Storefront →
        </Link>
      </div>

      {/* Left Sidebar */}
      <aside
        className={cn(
          'w-full lg:w-68 bg-[var(--ts-bg-card)] border-r border-[var(--ts-border-subtle)] flex-col justify-between shrink-0',
          sidebarOpen ? 'flex' : 'hidden lg:flex'
        )}
      >
        <div className="p-6 space-y-6">
          <div className="border-b border-[var(--ts-border-subtle)] pb-5">
            <Link
              to={ADMIN_BASE_PATH}
              className="font-serif-luxury text-2xl tracking-[0.24em] text-[var(--ts-text-primary)] block"
            >
              TIMESSELLERS
            </Link>
            <span className="text-[9px] uppercase tracking-[0.3em] text-[var(--ts-accent)]">
              Executive Control Center
            </span>
          </div>

          <nav className="space-y-1">
            {navLinks.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-[0.16em] transition-colors',
                      isActive
                        ? 'bg-[var(--ts-accent)]/15 text-[var(--ts-accent)] border-l-2 border-[var(--ts-accent)] font-medium'
                        : 'text-[var(--ts-text-secondary)] hover:text-[var(--ts-text-primary)] hover:bg-[var(--ts-bg-elevated)]'
                    )
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="p-6 border-t border-[var(--ts-border-subtle)] space-y-3">
          <div className="text-xs">
            <p className="text-[var(--ts-text-primary)] font-medium truncate">
              {profile?.full_name || 'Administrator'}
            </p>
            <p className="text-[11px] text-[var(--ts-text-muted)] truncate">{profile?.phone}</p>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <Link
              to="/"
              className="flex items-center justify-between px-3 py-2 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] text-[11px] uppercase tracking-widest text-[var(--ts-text-secondary)] hover:border-[var(--ts-accent)]"
            >
              <span>View Live Storefront</span>
              <ExternalLink className="w-3.5 h-3.5 text-[var(--ts-accent)]" />
            </Link>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-widest text-red-400 hover:bg-red-950/30 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 p-4 sm:p-8 lg:p-10 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
};

// Reusable SVG Sales & Orders Trend Chart Component (100% live DB series data)
export const SalesSeriesChart: React.FC<{
  title: string;
  subtitle: string;
  series: SalesSeriesPoint[];
  metric: 'revenue' | 'orders_count';
}> = ({ title, subtitle, series, metric }) => {
  const values = series.map((s) => Number(s[metric] || 0));
  const maxVal = Math.max(...values, 1);

  return (
    <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--ts-accent)]">{subtitle}</p>
          <h3 className="font-serif-luxury text-xl text-[var(--ts-text-primary)]">{title}</h3>
        </div>
        <Badge tone="gold">Live PostgreSQL Data</Badge>
      </div>

      {series.length === 0 ? (
        <p className="text-xs text-[var(--ts-text-muted)] py-8 text-center">No series records in range.</p>
      ) : (
        <div className="space-y-3">
          <div className="h-44 flex items-end gap-2 pt-6 border-b border-[var(--ts-border-subtle)]">
            {series.map((pt) => {
              const val = Number(pt[metric] || 0);
              const heightPct = Math.max(4, Math.round((val / maxVal) * 100));
              return (
                <div
                  key={pt.period_key}
                  className="flex-1 flex flex-col items-center justify-end h-full group relative"
                >
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-6 bg-[var(--ts-border-subtle)] border border-[var(--ts-accent)] px-2 py-0.5 text-[10px] text-[var(--ts-text-primary)] whitespace-nowrap z-10 pointer-events-none">
                    {metric === 'revenue' ? formatINR(val) : `${val} orders`}
                  </div>
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={cn(
                      'w-full max-w-[34px] transition-all',
                      val > 0
                        ? 'bg-gradient-to-t from-[var(--ts-accent)] to-[var(--ts-accent)]'
                        : 'bg-[var(--ts-border-subtle)]'
                    )}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-1 text-[9px] text-[var(--ts-text-muted)] uppercase tracking-wider">
            {series.map((pt) => (
              <span key={pt.period_key} className="flex-1 text-center truncate">
                {pt.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const AdminOverviewPage: React.FC = () => {
  const [analytics, setAnalytics] = useState<AdminDashboardAnalytics | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [chartHorizon, setChartHorizon] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [stats, orders] = await Promise.all([
        fetchAdminAnalytics(),
        fetchAdminRecentOrders(8),
      ]);
      setAnalytics(stats);
      setRecentOrders(orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard analytics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const activeSeries =
    chartHorizon === 'daily'
      ? analytics?.daily_sales || []
      : chartHorizon === 'weekly'
        ? analytics?.weekly_sales || []
        : analytics?.monthly_sales || [];

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
            Real-Time Treasury &amp; Operations
          </p>
          <h1 className="font-serif-luxury text-3xl sm:text-4xl text-[var(--ts-text-primary)]">
            Administrative Overview
          </h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadDashboard()}
          isLoading={isLoading}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Refresh Live Metrics
        </Button>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void loadDashboard()} />}

      {/* 9 Required KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-5 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
            Total Confirmed Revenue
          </p>
          <p className="font-serif-luxury text-2xl text-[var(--ts-accent)]">
            {formatINR(analytics?.total_revenue ?? 0)}
          </p>
        </div>

        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-5 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
            Today&apos;s Revenue
          </p>
          <p className="font-serif-luxury text-2xl text-emerald-400">
            {formatINR(analytics?.today_revenue ?? 0)}
          </p>
        </div>

        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-5 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
            Total Orders
          </p>
          <p className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
            {analytics?.total_orders ?? 0}
          </p>
          <p className="text-[11px] text-[var(--ts-text-muted)]">
            Pending: {analytics?.pending_orders ?? 0} • Confirmed: {analytics?.confirmed_orders ?? 0}
          </p>
        </div>

        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-5 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
            Delivered &amp; Clients
          </p>
          <p className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
            {analytics?.delivered_orders ?? 0} Delivered
          </p>
          <p className="text-[11px] text-[var(--ts-text-muted)]">
            Registered Clients: {analytics?.total_customers ?? 0}
          </p>
        </div>

        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-5 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
            Catalog &amp; Low-Stock Alerts
          </p>
          <p className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
            {analytics?.total_products ?? 0} Products
          </p>
          <Link
            to={`${ADMIN_BASE_PATH}/inventory`}
            className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
          >
            <AlertTriangle className="w-3 h-3" />
            <span>{analytics?.low_stock_count ?? 0} Low/Out of Stock</span>
          </Link>
        </div>
      </div>

      {/* Sales & Order Trend Graphs with Daily / Weekly / Monthly Selector */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
            Revenue &amp; Order Trajectory
          </h2>
          <div className="inline-flex border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)]">
            {(['daily', 'weekly', 'monthly'] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setChartHorizon(h)}
                className={cn(
                  'px-4 py-2 text-[11px] uppercase tracking-widest cursor-pointer transition-colors',
                  chartHorizon === h
                    ? 'bg-[var(--ts-accent)] text-[var(--ts-on-accent)] font-medium'
                    : 'text-[var(--ts-text-secondary)] hover:text-[var(--ts-text-primary)]'
                )}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SalesSeriesChart
            title={`${chartHorizon.toUpperCase()} REVENUE TREND`}
            subtitle="Confirmed Orders Revenue (INR)"
            series={activeSeries}
            metric="revenue"
          />
          <SalesSeriesChart
            title={`${chartHorizon.toUpperCase()} ORDER VOLUME`}
            subtitle="Order Count per Period"
            series={activeSeries}
            metric="orders_count"
          />
        </div>
      </div>

      {/* Best-Selling Products & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Best Sellers */}
        <div className="lg:col-span-5 border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--ts-border-subtle)] pb-3">
            <h3 className="font-serif-luxury text-xl text-[var(--ts-text-primary)]">Best-Selling Creations</h3>
            <Link to={`${ADMIN_BASE_PATH}/products`} className="text-xs text-[var(--ts-accent)] hover:underline">
              Manage →
            </Link>
          </div>

          {analytics?.best_sellers && analytics.best_sellers.length > 0 ? (
            <div className="space-y-3">
              {analytics.best_sellers.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 border-b border-[var(--ts-bg-subtle)] pb-3"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <img
                      src={item.main_image_url}
                      alt={item.name}
                      className="w-11 h-12 object-cover bg-[var(--ts-bg-elevated)] border border-[var(--ts-border-subtle)]"
                    />
                    <div className="overflow-hidden">
                      <p className="text-xs text-[var(--ts-text-primary)] font-medium truncate">{item.name}</p>
                      <p className="text-[10px] text-[var(--ts-text-muted)]">
                        SKU: {item.sku} • Sold: {item.total_sold}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-[var(--ts-accent)] font-medium">
                      {formatINR(item.total_revenue)}
                    </p>
                    <p className="text-[10px] text-[var(--ts-text-muted)]">{formatINR(item.selling_price)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--ts-text-muted)] py-8 text-center">
              No product sales recorded yet.
            </p>
          )}
        </div>

        {/* Recent Orders / Transactions */}
        <div className="lg:col-span-7 border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--ts-border-subtle)] pb-3">
            <h3 className="font-serif-luxury text-xl text-[var(--ts-text-primary)]">Recent Transactions</h3>
            <Link to={`${ADMIN_BASE_PATH}/orders`} className="text-xs text-[var(--ts-accent)] hover:underline">
              All Orders →
            </Link>
          </div>

          {recentOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--ts-border-subtle)] text-[10px] uppercase tracking-widest text-[var(--ts-text-muted)]">
                    <th className="py-2.5 pr-3">Order #</th>
                    <th className="py-2.5 px-3">Client</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Payment</th>
                    <th className="py-2.5 pl-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ts-bg-subtle)]">
                  {recentOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-[var(--ts-bg-elevated)]">
                      <td className="py-3 pr-3 font-mono text-[var(--ts-accent)]">{ord.order_number}</td>
                      <td className="py-3 px-3 text-[var(--ts-text-primary)]">
                        {ord.customer_snapshot?.full_name || 'Client'}
                      </td>
                      <td className="py-3 px-3 font-medium text-[var(--ts-text-primary)]">
                        {formatINR(ord.final_amount)}
                      </td>
                      <td className="py-3 px-3">
                        <Badge
                          tone={
                            ord.payment_status === 'confirmed'
                              ? 'success'
                              : ord.payment_status === 'payment_verification'
                                ? 'gold'
                                : 'warning'
                          }
                        >
                          {ord.payment_status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="py-3 pl-3 text-[var(--ts-text-muted)]">{formatDate(ord.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No Orders Recorded Yet"
              description="Live customer orders will appear here in real time."
            />
          )}
        </div>
      </div>
    </div>
  );
};
