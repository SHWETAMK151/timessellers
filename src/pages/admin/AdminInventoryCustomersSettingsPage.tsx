// ==============================================================================
// TIMESSELLERS — ADMIN INVENTORY, CUSTOMERS, ANALYTICS & STORE SETTINGS
// (/admin/inventory, /admin/customers, /admin/analytics, /admin/settings)
// ==============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Search,
  ShieldAlert,
  CheckCircle2,
  Upload,
  RefreshCw,
  History,
} from 'lucide-react';
import {
  fetchAdminInventoryList,
  fetchAdminInventoryTransactions,
  adminAdjustProductInventory,
  fetchAdminCustomers,
  adminSetCustomerRestriction,
  fetchAdminAnalytics,
  updateAdminStoreSettings,
  updateAdminShippingSettings,
  fetchAdminAuditLogs,
} from '@/services/adminService';
import { uploadFileToStorage } from '@/services/storageService';
import { useStoreSettings, LUXURY_THEMES } from '@/context/StoreSettingsContext';
import { useAuth } from '@/context/AuthContext';
import { formatDate, formatINR, cn, ADMIN_LOGIN_PATH } from '@/lib/utils';
import { SalesSeriesChart } from '@/pages/admin/AdminOverviewPage';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
} from '@/components/ui/LuxuryPrimitives';
import type {
  AdminAuditLog,
  AdminDashboardAnalytics,
  Inventory,
  InventoryTransaction,
  Order,
  Product,
  Profile,
  LuxuryThemeId,
} from '@/types/database';

// ==============================================================================
// 1. ADMIN INVENTORY MANAGEMENT PAGE (/admin/inventory)
// ==============================================================================
export const AdminInventoryPage: React.FC = () => {
  const [inventoryList, setInventoryList] = useState<
    (Inventory & {
      products: Pick<Product, 'id' | 'name' | 'slug' | 'main_image_url' | 'selling_price' | 'status'>;
    })[]
  >([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'low_stock'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adjustingProductId, setAdjustingProductId] = useState<string | null>(null);
  const [newQtyInput, setNewQtyInput] = useState('');
  const [newThresholdInput, setNewThresholdInput] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  const loadInventoryData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [inv, txs] = await Promise.all([
        fetchAdminInventoryList(),
        fetchAdminInventoryTransactions(50),
      ]);
      setInventoryList(inv);
      setTransactions(txs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load inventory records');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInventoryData();
  }, [loadInventoryData]);

  const handleCommitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProductId) return;
    setError(null);
    setIsAdjusting(true);
    try {
      await adminAdjustProductInventory({
        productId: adjustingProductId,
        newQuantity: Number(newQtyInput),
        lowStockThreshold: newThresholdInput ? Number(newThresholdInput) : undefined,
        notes: adjustNotes.trim() || 'Manual inventory adjustment via Admin Vault',
      });
      setAdjustingProductId(null);
      await loadInventoryData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inventory adjustment failed');
    } finally {
      setIsAdjusting(false);
    }
  };

  const lowStockCount = inventoryList.filter(
    (i) => i.stock_status === 'low_stock' || i.stock_status === 'out_of_stock'
  ).length;

  const displayedInventory =
    filterMode === 'low_stock'
      ? inventoryList.filter(
          (i) => i.stock_status === 'low_stock' || i.stock_status === 'out_of_stock'
        )
      : inventoryList;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
            Atomic Stock &amp; Ledger Control
          </p>
          <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">
            Inventory Management
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setFilterMode(filterMode === 'all' ? 'low_stock' : 'all')}
            className={`px-4 py-2 text-xs uppercase tracking-widest border flex items-center gap-2 cursor-pointer ${
              filterMode === 'low_stock'
                ? 'border-amber-500 bg-amber-950/40 text-amber-300'
                : 'border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] text-[var(--ts-text-secondary)]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Low / Out of Stock ({lowStockCount})</span>
          </button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadInventoryData()}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Stock Adjustment Form */}
      {adjustingProductId && (
        <form
          onSubmit={handleCommitAdjustment}
          className="border border-[var(--ts-accent)]/60 bg-[var(--ts-bg-card)] p-6 space-y-4"
        >
          <h3 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
            Atomic Inventory Adjustment
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="New Available Quantity *"
              type="number"
              min="0"
              required
              value={newQtyInput}
              onChange={(e) => setNewQtyInput(e.target.value)}
            />
            <Input
              label="Low-Stock Threshold *"
              type="number"
              min="0"
              required
              value={newThresholdInput}
              onChange={(e) => setNewThresholdInput(e.target.value)}
            />
            <Input
              label="Audit Ledger Reason *"
              required
              value={adjustNotes}
              onChange={(e) => setAdjustNotes(e.target.value)}
              placeholder="e.g., New shipment arrival / Audit recount"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="gold" size="sm" isLoading={isAdjusting}>
              Commit Stock Update
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAdjustingProductId(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Inventory Stock Table */}
      {isLoading ? (
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-12 text-center text-xs text-[var(--ts-text-muted)]">
          Loading inventory levels...
        </div>
      ) : displayedInventory.length > 0 ? (
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--ts-border-subtle)] text-[10px] uppercase tracking-widest text-[var(--ts-text-muted)]">
                <th className="p-4">Product</th>
                <th className="p-4">SKU</th>
                <th className="p-4">Available Qty</th>
                <th className="p-4">Low-Stock Threshold</th>
                <th className="p-4">Stock Status</th>
                <th className="p-4 text-right">Adjust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ts-bg-subtle)]">
              {displayedInventory.map((inv) => (
                <tr key={inv.id} className="hover:bg-[var(--ts-bg-elevated)]">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {inv.products?.main_image_url && (
                        <img
                          src={inv.products.main_image_url}
                          alt=""
                          className="w-10 h-12 object-cover bg-[var(--ts-bg-subtle)]"
                        />
                      )}
                      <div>
                        <p className="text-[var(--ts-text-primary)] font-medium">
                          {inv.products?.name || 'Product'}
                        </p>
                        <p className="text-[11px] text-[var(--ts-text-muted)]">
                          {formatINR(inv.products?.selling_price ?? 0)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 font-mono text-[var(--ts-accent)]">{inv.sku}</td>
                  <td className="p-4 font-medium text-sm text-[var(--ts-text-primary)]">
                    {inv.available_quantity}
                  </td>
                  <td className="p-4 text-[var(--ts-text-muted)]">{inv.low_stock_threshold}</td>
                  <td className="p-4">
                    <Badge
                      tone={
                        inv.stock_status === 'out_of_stock'
                          ? 'danger'
                          : inv.stock_status === 'low_stock'
                            ? 'warning'
                            : 'success'
                      }
                    >
                      {inv.stock_status.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="p-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAdjustingProductId(inv.product_id);
                        setNewQtyInput(String(inv.available_quantity));
                        setNewThresholdInput(String(inv.low_stock_threshold));
                        setAdjustNotes('');
                      }}
                    >
                      Adjust Stock
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No Inventory Records Match"
          description="All products are adequately stocked or no products have been created yet."
        />
      )}

      {/* Inventory Transaction History Ledger */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-[var(--ts-accent)]" />
          <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
            Inventory Transaction Ledger ({transactions.length})
          </h2>
        </div>

        {transactions.length > 0 ? (
          <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--ts-border-subtle)] text-[10px] uppercase tracking-widest text-[var(--ts-text-muted)]">
                  <th className="p-3.5">Timestamp</th>
                  <th className="p-3.5">Product / SKU</th>
                  <th className="p-3.5">Event Type</th>
                  <th className="p-3.5">Delta</th>
                  <th className="p-3.5">Balance</th>
                  <th className="p-3.5">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ts-bg-subtle)]">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[var(--ts-bg-elevated)]">
                    <td className="p-3.5 text-[var(--ts-text-muted)]">{formatDate(tx.created_at, true)}</td>
                    <td className="p-3.5">
                      <span className="text-[var(--ts-text-primary)]">{tx.products?.name || 'Product'}</span>
                      <span className="block font-mono text-[10px] text-[var(--ts-accent)]">
                        {tx.products?.sku}
                      </span>
                    </td>
                    <td className="p-3.5 uppercase text-[10px] tracking-wider text-[var(--ts-text-secondary)]">
                      {tx.transaction_type.replace(/_/g, ' ')}
                    </td>
                    <td
                      className={`p-3.5 font-mono font-semibold ${
                        tx.quantity_change >= 0 ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {tx.quantity_change > 0 ? `+${tx.quantity_change}` : tx.quantity_change}
                    </td>
                    <td className="p-3.5 text-[var(--ts-text-primary)]">
                      {tx.previous_quantity} → <strong>{tx.new_quantity}</strong>
                    </td>
                    <td className="p-3.5 text-[var(--ts-text-muted)]">{tx.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-[var(--ts-text-muted)]">No inventory transactions logged yet.</p>
        )}
      </div>
    </div>
  );
};

// ==============================================================================
// 2. ADMIN CUSTOMER MANAGEMENT PAGE (/admin/customers)
// ==============================================================================
export const AdminCustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<(Profile & { orders?: Order[] })[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<
    (Profile & { orders?: Order[] }) | null
  >(null);

  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminCustomers();
      setCustomers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load customers');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const handleToggleRestriction = async (cust: Profile) => {
    setError(null);
    try {
      await adminSetCustomerRestriction(
        cust.id,
        !cust.is_restricted,
        !cust.is_restricted
          ? 'Restricted by administrator via Customer Compliance Desk'
          : undefined
      );
      await loadCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account restriction');
    }
  };

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    return (
      !q ||
      c.full_name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8">
      <div className="border-b border-[var(--ts-border-subtle)] pb-6">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
          Client Directory &amp; Compliance
        </p>
        <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">
          Customer Management ({customers.length})
        </h1>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-[var(--ts-text-muted)] absolute left-3.5 top-3.5" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search customer by name, phone, or email..."
          className="w-full bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] pl-10 pr-4 py-2.5 text-xs text-[var(--ts-text-primary)] focus:outline-none focus:border-[var(--ts-accent)]"
        />
      </div>

      {selectedCustomer && (
        <div className="border border-[var(--ts-accent)]/50 bg-[var(--ts-bg-card)] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--ts-border-subtle)] pb-3">
            <div>
              <h3 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
                {selectedCustomer.full_name} ({selectedCustomer.phone})
              </h3>
              <p className="text-xs text-[var(--ts-text-muted)]">
                Email: {selectedCustomer.email || 'Not provided'} • Joined:{' '}
                {formatDate(selectedCustomer.created_at)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedCustomer(null)}
            >
              Close Dossier
            </Button>
          </div>

          <h4 className="text-xs uppercase tracking-widest text-[var(--ts-accent)]">
            Order History ({selectedCustomer.orders?.length ?? 0})
          </h4>
          {selectedCustomer.orders && selectedCustomer.orders.length > 0 ? (
            <div className="space-y-2">
              {selectedCustomer.orders.map((o) => (
                <div
                  key={o.id}
                  className="p-3 border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-elevated)] flex items-center justify-between text-xs"
                >
                  <span className="font-mono text-[var(--ts-accent)]">{o.order_number}</span>
                  <span>{formatINR(o.final_amount)}</span>
                  <Badge tone="neutral">{o.delivery_status}</Badge>
                  <span className="text-[var(--ts-text-muted)]">{formatDate(o.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--ts-text-muted)]">No orders placed by this client yet.</p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-12 text-center text-xs text-[var(--ts-text-muted)]">
          Loading customer directory...
        </div>
      ) : filteredCustomers.length > 0 ? (
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--ts-border-subtle)] text-[10px] uppercase tracking-widest text-[var(--ts-text-muted)]">
                <th className="p-4">Client Name</th>
                <th className="p-4">Verified Phone</th>
                <th className="p-4">Email</th>
                <th className="p-4">Orders</th>
                <th className="p-4">Account Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ts-bg-subtle)]">
              {filteredCustomers.map((cust) => (
                <tr key={cust.id} className="hover:bg-[var(--ts-bg-elevated)]">
                  <td className="p-4 font-medium text-[var(--ts-text-primary)]">{cust.full_name}</td>
                  <td className="p-4 font-mono text-[var(--ts-accent)]">{cust.phone}</td>
                  <td className="p-4 text-[var(--ts-text-secondary)]">{cust.email || '—'}</td>
                  <td className="p-4 text-[var(--ts-text-primary)]">{cust.orders?.length ?? 0}</td>
                  <td className="p-4">
                    <Badge tone={cust.is_restricted ? 'danger' : 'success'}>
                      {cust.is_restricted ? 'Restricted' : 'Active'}
                    </Badge>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCustomer(cust)}
                    >
                      Order History
                    </Button>
                    <Button
                      variant={cust.is_restricted ? 'charcoal' : 'danger'}
                      size="sm"
                      onClick={() => void handleToggleRestriction(cust)}
                      leftIcon={<ShieldAlert className="w-3.5 h-3.5" />}
                    >
                      {cust.is_restricted ? 'Unrestrict' : 'Restrict'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No Customers Found"
          description="Registered customers will appear here once they authenticate via Phone OTP."
        />
      )}
    </div>
  );
};

// ==============================================================================
// 3. ADMIN SALES ANALYTICS & AUDIT LOGS PAGE (/admin/analytics)
// ==============================================================================
export const AdminAnalyticsPage: React.FC = () => {
  const [analytics, setAnalytics] = useState<AdminDashboardAnalytics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchAdminAnalytics(), fetchAdminAuditLogs(40)])
      .then(([stats, logs]) => {
        setAnalytics(stats);
        setAuditLogs(logs);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load analytics'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-10">
      <div className="border-b border-[var(--ts-border-subtle)] pb-6">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
          Intelligence &amp; Immutable Audit Trail
        </p>
        <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">
          Sales Analytics &amp; Security Audit
        </h1>
      </div>

      {error && <ErrorBanner message={error} />}

      {!isLoading && analytics && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SalesSeriesChart
              title="DAILY REVENUE (14 DAYS)"
              subtitle="Confirmed Sales in INR"
              series={analytics.daily_sales}
              metric="revenue"
            />
            <SalesSeriesChart
              title="WEEKLY REVENUE (8 WEEKS)"
              subtitle="Confirmed Weekly Revenue"
              series={analytics.weekly_sales}
              metric="revenue"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SalesSeriesChart
              title="MONTHLY REVENUE (6 MONTHS)"
              subtitle="Confirmed Monthly Revenue"
              series={analytics.monthly_sales}
              metric="revenue"
            />
            <SalesSeriesChart
              title="DAILY ORDER VOLUME (14 DAYS)"
              subtitle="Orders Placed per Day"
              series={analytics.daily_sales}
              metric="orders_count"
            />
          </div>
        </div>
      )}

      {/* Immutable Administrative Audit Logs */}
      <div className="space-y-4">
        <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
          Immutable Administrative Audit Log ({auditLogs.length})
        </h2>
        {auditLogs.length > 0 ? (
          <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--ts-border-subtle)] text-[10px] uppercase tracking-widest text-[var(--ts-text-muted)]">
                  <th className="p-3.5">Timestamp</th>
                  <th className="p-3.5">Admin</th>
                  <th className="p-3.5">Action</th>
                  <th className="p-3.5">Entity</th>
                  <th className="p-3.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ts-bg-subtle)]">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--ts-bg-elevated)]">
                    <td className="p-3.5 text-[var(--ts-text-muted)]">{formatDate(log.created_at, true)}</td>
                    <td className="p-3.5 text-[var(--ts-text-primary)]">
                      {log.profiles?.full_name || log.admin_user_id.slice(0, 8)}
                    </td>
                    <td className="p-3.5 font-mono text-[var(--ts-accent)] uppercase">{log.action}</td>
                    <td className="p-3.5 text-[var(--ts-text-secondary)]">
                      {log.entity_type} ({log.entity_id?.slice(0, 8)})
                    </td>
                    <td className="p-3.5 font-mono text-[11px] text-[var(--ts-text-muted)]">
                      {JSON.stringify(log.new_state)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-[var(--ts-text-muted)]">
            Privileged administrative actions (UPI verifications, order updates, inventory adjustments) are recorded here immutably.
          </p>
        )}
      </div>
    </div>
  );
};

// ==============================================================================
// 4. ADMIN STORE & SHIPPING SETTINGS PAGE (/admin/settings)
// ==============================================================================
export const AdminSettingsPage: React.FC = () => {
  const {
    storeSettings,
    shippingSettings,
    activeTheme,
    setActiveThemePreview,
    refreshSettings,
  } = useStoreSettings();
  const { profile, updateAdminCredentials } = useAuth();

  const [selectedTheme, setSelectedTheme] = useState<LuxuryThemeId>(
    storeSettings.active_theme || activeTheme || 'light_luxury_editorial'
  );
  const [adminUsername, setAdminUsername] = useState(profile?.admin_username || 'shwetank');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  const [credentialsSavedSuccess, setCredentialsSavedSuccess] = useState(false);

  const [storeName, setStoreName] = useState(storeSettings.store_name);
  const [storeTagline, setStoreTagline] = useState(storeSettings.store_tagline);
  const [logoUrl, setLogoUrl] = useState(storeSettings.logo_url || '');
  const [upiId, setUpiId] = useState(storeSettings.upi_id);
  const [upiDisplayName, setUpiDisplayName] = useState(storeSettings.upi_display_name);
  const [upiQrImageUrl, setUpiQrImageUrl] = useState(storeSettings.upi_qr_image_url || '');
  const [upiInstructions, setUpiInstructions] = useState(
    storeSettings.upi_payment_instructions
  );
  const [gatewayFreeEnabled, setGatewayFreeEnabled] = useState(
    storeSettings.gateway_free_upi_enabled ?? true
  );
  const [gatewayFreeAppsScriptUrl, setGatewayFreeAppsScriptUrl] = useState(
    storeSettings.gateway_free_apps_script_url || ''
  );
  const [gatewayFreeMaxPaiseWindow, setGatewayFreeMaxPaiseWindow] = useState(
    String(storeSettings.gateway_free_max_paise_window ?? 899)
  );
  const [contactEmail, setContactEmail] = useState(storeSettings.contact_email);
  const [contactPhone, setContactPhone] = useState(storeSettings.contact_phone);
  const [contactAddress, setContactAddress] = useState(storeSettings.contact_address);

  const [freeShippingThreshold, setFreeShippingThreshold] = useState(
    String(shippingSettings.free_shipping_threshold)
  );
  const [standardShippingCharge, setStandardShippingCharge] = useState(
    String(shippingSettings.standard_shipping_charge)
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setStoreName(storeSettings.store_name);
    setStoreTagline(storeSettings.store_tagline);
    if (storeSettings.active_theme) {
      setSelectedTheme(storeSettings.active_theme);
    }
    setLogoUrl(storeSettings.logo_url || '');
    setUpiId(storeSettings.upi_id);
    setUpiDisplayName(storeSettings.upi_display_name);
    setUpiQrImageUrl(storeSettings.upi_qr_image_url || '');
    setUpiInstructions(storeSettings.upi_payment_instructions);
    setGatewayFreeEnabled(storeSettings.gateway_free_upi_enabled ?? true);
    setGatewayFreeAppsScriptUrl(storeSettings.gateway_free_apps_script_url || '');
    setGatewayFreeMaxPaiseWindow(String(storeSettings.gateway_free_max_paise_window ?? 899));
    setContactEmail(storeSettings.contact_email);
    setContactPhone(storeSettings.contact_phone);
    setContactAddress(storeSettings.contact_address);
  }, [storeSettings]);

  useEffect(() => {
    if (profile?.admin_username) {
      setAdminUsername(profile.admin_username);
    }
  }, [profile?.admin_username]);

  const handleSaveAdminCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSavingCredentials(true);
    try {
      await updateAdminCredentials(adminUsername, adminNewPassword || undefined);
      setAdminNewPassword('');
      setCredentialsSavedSuccess(true);
      setTimeout(() => setCredentialsSavedSuccess(false), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update admin credentials');
    } finally {
      setIsSavingCredentials(false);
    }
  };

  useEffect(() => {
    setFreeShippingThreshold(String(shippingSettings.free_shipping_threshold));
    setStandardShippingCharge(String(shippingSettings.standard_shipping_charge));
  }, [shippingSettings]);

  const handleUploadQrCode = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsUploadingQr(true);
    try {
      const up = await uploadFileToStorage('store-assets', file, 'upi-qr');
      setUpiQrImageUrl(up.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload QR image');
    } finally {
      setIsUploadingQr(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await Promise.all([
        updateAdminStoreSettings({
          store_name: storeName.trim(),
          store_tagline: storeTagline.trim(),
          active_theme: selectedTheme,
          logo_url: logoUrl.trim() || null,
          upi_id: upiId.trim(),
          upi_display_name: upiDisplayName.trim(),
          upi_qr_image_url: upiQrImageUrl.trim() || null,
          upi_payment_instructions: upiInstructions.trim(),
          gateway_free_upi_enabled: gatewayFreeEnabled,
          gateway_free_apps_script_url: gatewayFreeAppsScriptUrl.trim() || null,
          gateway_free_max_paise_window: Number(gatewayFreeMaxPaiseWindow || 899),
          contact_email: contactEmail.trim(),
          contact_phone: contactPhone.trim(),
          contact_address: contactAddress.trim(),
        }),
        updateAdminShippingSettings({
          free_shipping_threshold: Number(freeShippingThreshold || 499),
          standard_shipping_charge: Number(standardShippingCharge || 79),
        }),
      ]);
      await refreshSettings();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update store settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="border-b border-[var(--ts-border-subtle)] pb-6">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
          Global Configuration
        </p>
        <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">
          Store, UPI Treasury &amp; Shipping Settings
        </h1>
      </div>

      {error && <ErrorBanner message={error} />}
      {savedSuccess && (
        <div className="p-4 border border-emerald-800/60 bg-emerald-950/30 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>Store and shipping configuration updated across the platform.</span>
        </div>
      )}
      {credentialsSavedSuccess && (
        <div className="p-4 border border-emerald-800/60 bg-emerald-950/30 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>Admin Username &amp; Password updated and hashed in Supabase Auth.</span>
        </div>
      )}

      {/* 0. Admin Username & Password Security (Supabase Auth Bcrypt) */}
      <form
        onSubmit={handleSaveAdminCredentials}
        className="border border-[var(--ts-accent)]/40 bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-5"
      >
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--ts-accent)]">
            Supabase Auth • No OTP Required
          </p>
          <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
            Administrator Username &amp; Password
          </h2>
          <p className="text-xs text-[var(--ts-text-muted)]">
            Manage the username and bcrypt-hashed password used to sign in directly at{' '}
            <code>{ADMIN_LOGIN_PATH}</code>.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Admin Username *"
            required
            value={adminUsername}
            onChange={(e) => setAdminUsername(e.target.value)}
            placeholder="shwetank"
          />
          <Input
            label="New Admin Password (Min 8 Characters)"
            type="password"
            value={adminNewPassword}
            onChange={(e) => setAdminNewPassword(e.target.value)}
            placeholder="Leave blank to keep existing password"
          />
        </div>

        <Button type="submit" variant="gold" size="md" isLoading={isSavingCredentials}>
          Update Admin Username &amp; Password
        </Button>
      </form>

      <form onSubmit={handleSaveSettings} className="space-y-8">
        {/* 0.5 Visual Theme & Maison Palette Switcher */}
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--ts-accent)]">
              Live Maison Aesthetic
            </p>
            <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
              Storefront &amp; Dashboard Theme Switcher
            </h2>
            <p className="text-xs text-[var(--ts-text-muted)]">
              Click any curated luxury theme below to preview it live immediately. Click{' '}
              <strong>Save Store Configuration</strong> at the bottom to publish it for all visitors.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {LUXURY_THEMES.map((theme) => {
              const isSelected = selectedTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => {
                    setSelectedTheme(theme.id);
                    setActiveThemePreview(theme.id);
                  }}
                  className={cn(
                    'p-4 border text-left space-y-3 transition-all cursor-pointer',
                    isSelected
                      ? 'border-[var(--ts-accent)] bg-[var(--ts-bg-accent-tint)] ring-1 ring-[var(--ts-accent)]'
                      : 'border-[var(--ts-border-subtle)] bg-[var(--ts-bg-elevated)] hover:border-[var(--ts-border-strong)]'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-accent)]">
                        {theme.subtitle}
                      </p>
                      <h3 className="font-serif-luxury text-lg text-[var(--ts-text-primary)]">
                        {theme.name}
                      </h3>
                    </div>
                    <div className="flex items-center -space-x-1">
                      {theme.swatches.map((hex, i) => (
                        <span
                          key={i}
                          className="w-5 h-5 rounded-full border border-black/20 shadow-sm"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--ts-text-secondary)] leading-relaxed">
                    {theme.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 1. Brand & Contact Configuration */}
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-5">
          <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
            1. Brand Identity &amp; Concierge Contact
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Store Name *"
              required
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
            />
            <Input
              label="Store Tagline *"
              required
              value={storeTagline}
              onChange={(e) => setStoreTagline(e.target.value)}
            />
          </div>

          <Input
            label="Brand Logo Image URL (Optional)"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://..."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Concierge Email *"
              type="email"
              required
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
            <Input
              label="Concierge Telephone *"
              required
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>

          <Input
            label="Corporate Office Address *"
            required
            value={contactAddress}
            onChange={(e) => setContactAddress(e.target.value)}
          />
        </div>

        {/* 2. UPI QR Payment Settings */}
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-5">
          <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
            2. Manual UPI QR Treasury Configuration
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Official Corporate UPI ID *"
              required
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="timessellers@upi"
            />
            <Input
              label="UPI Payee Display Name *"
              required
              value={upiDisplayName}
              onChange={(e) => setUpiDisplayName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
            <div className="sm:col-span-8">
              <Input
                label="UPI QR Code Image URL"
                value={upiQrImageUrl}
                onChange={(e) => setUpiQrImageUrl(e.target.value)}
                placeholder="Upload or paste QR Code image URL"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="w-full flex items-center justify-center gap-2 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] px-4 py-3 text-xs uppercase tracking-widest text-[var(--ts-accent)] cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>{isUploadingQr ? 'Uploading...' : 'Upload QR Code'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  onChange={handleUploadQrCode}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] uppercase tracking-[0.18em] text-[var(--ts-text-secondary)]">
              Customer UPI Instructions *
            </label>
            <textarea
              rows={3}
              required
              value={upiInstructions}
              onChange={(e) => setUpiInstructions(e.target.value)}
              className="w-full bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] p-4 text-sm text-[var(--ts-text-primary)] focus:outline-none focus:border-[var(--ts-accent)]"
            />
          </div>

          <div className="border-t border-[var(--ts-border-subtle)] pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--ts-accent)]">
                  Gateway-Free UPI Auto-Confirmation (Paisa Order Code + Gmail Watcher)
                </p>
                <p className="text-[11px] text-[var(--ts-text-muted)]">
                  Assigns each buyer a unique decimal amount down to the paisa and matches your
                  bank&apos;s Gmail credit alerts automatically via <code>apps-script/Code.gs</code>.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-[var(--ts-text-primary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={gatewayFreeEnabled}
                  onChange={(e) => setGatewayFreeEnabled(e.target.checked)}
                  className="accent-[var(--ts-accent)]"
                />
                <span>Enabled</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <div className="sm:col-span-8">
                <Input
                  label="Google Apps Script Deployed Web App URL (/exec)"
                  value={gatewayFreeAppsScriptUrl}
                  onChange={(e) => setGatewayFreeAppsScriptUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/XXXXXXXX/exec"
                  hint="Deploy apps-script/Code.gs on your Google Sheet and paste the /exec URL here."
                />
              </div>
              <div className="sm:col-span-4">
                <Input
                  label="Max Paisa Discount Window (Paise)"
                  type="number"
                  min="99"
                  max="4999"
                  value={gatewayFreeMaxPaiseWindow}
                  onChange={(e) => setGatewayFreeMaxPaiseWindow(e.target.value)}
                  hint="899 = up to ₹8.99 micro-discount (890 unique daily slots)."
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Pan-India Shipping Charges & Threshold */}
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-5">
          <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
            3. Pan-India Shipping Rules (Server-Enforced)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Free Shipping Threshold (₹) *"
              type="number"
              min="0"
              step="0.01"
              required
              value={freeShippingThreshold}
              onChange={(e) => setFreeShippingThreshold(e.target.value)}
              hint="Default ₹499. Orders >= this amount receive free shipping."
            />
            <Input
              label="Standard Shipping Charge Below Threshold (₹) *"
              type="number"
              min="0"
              step="0.01"
              required
              value={standardShippingCharge}
              onChange={(e) => setStandardShippingCharge(e.target.value)}
              hint="Charged automatically on orders below the threshold."
            />
          </div>
        </div>

        <Button type="submit" variant="gold" size="lg" isLoading={isSaving}>
          Save Store Configuration
        </Button>
      </form>
    </div>
  );
};
