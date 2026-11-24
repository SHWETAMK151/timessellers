// ==============================================================================
// TIMESSELLERS — ADMIN ORDER MANAGEMENT & PAYMENT VERIFICATION
// (/admin/orders & /admin/payments)
// Supports searching/filtering orders, updating the 9 delivery lifecycle stages,
// adding AWB tracking numbers, cancelling/refunding with automatic stock restoration,
// and verifying manual UPI QR payments (Approve / Reject with independent UTR review),
// plus viewing cryptocurrency transactions and raw webhook events.
// ==============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  Search,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Truck,
  Eye,
  X,
  RefreshCw,
} from 'lucide-react';
import {
  fetchAllAdminOrders,
  adminUpdateOrderStatus,
  fetchAdminPaymentVerifications,
  adminDecideUpiVerification,
  fetchAdminAllPayments,
  fetchAdminWebhookEvents,
} from '@/services/adminService';
import { formatDate, formatINR, sanitizeHttpUrl } from '@/lib/utils';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  Select,
} from '@/components/ui/LuxuryPrimitives';
import type {
  Order,
  OrderDeliveryStatus,
  Payment,
  PaymentVerification,
  PaymentWebhookEvent,
} from '@/types/database';

const DELIVERY_STATUS_OPTIONS: { value: OrderDeliveryStatus; label: string }[] = [
  { value: 'pending_payment', label: '1. Pending Payment' },
  { value: 'payment_verification', label: '2. Payment Verification' },
  { value: 'confirmed', label: '3. Confirmed' },
  { value: 'processing', label: '4. Processing' },
  { value: 'shipped', label: '5. Shipped' },
  { value: 'out_for_delivery', label: '6. Out for Delivery' },
  { value: 'delivered', label: '7. Delivered' },
  { value: 'cancelled', label: '8. Cancelled (Restores Stock)' },
  { value: 'refunded', label: '9. Refunded (Restores Stock)' },
];

// ==============================================================================
// 1. ADMIN ORDER MANAGEMENT PAGE (/admin/orders)
// ==============================================================================
export const AdminOrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState<OrderDeliveryStatus>('confirmed');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [courierPartner, setCourierPartner] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAllAdminOrders();
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load orders');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const openOrderModal = (order: Order) => {
    setSelectedOrder(order);
    setNewStatus(order.delivery_status);
    setTrackingNumber(order.tracking_number || '');
    setCourierPartner(order.courier_partner || '');
    setTrackingUrl(order.tracking_url || '');
    setStatusNote('');
  };

  const handleLifecycleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setError(null);
    setIsUpdating(true);
    try {
      await adminUpdateOrderStatus({
        orderId: selectedOrder.id,
        newDeliveryStatus: newStatus,
        trackingNumber: trackingNumber.trim() || undefined,
        courierPartner: courierPartner.trim() || undefined,
        trackingUrl: trackingUrl.trim() || undefined,
        note: statusNote.trim() || undefined,
      });
      setSelectedOrder(null);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order status update failed');
    } finally {
      setIsUpdating(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesStatus = statusFilter === 'all' || o.delivery_status === statusFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      o.order_number.toLowerCase().includes(q) ||
      (o.customer_snapshot?.full_name || '').toLowerCase().includes(q) ||
      (o.customer_snapshot?.phone || '').toLowerCase().includes(q) ||
      (o.payment_reference || '').toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
            Fulfillment &amp; Dispatch
          </p>
          <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">
            Order Management ({orders.length})
          </h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadOrders()}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Refresh Orders
        </Button>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Order Detail & Lifecycle Inspector Drawer */}
      {selectedOrder && (
        <div className="border border-[var(--ts-accent)]/60 bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-[var(--ts-border-subtle)] pb-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--ts-accent)]">
                Order Lifecycle Management
              </p>
              <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
                {selectedOrder.order_number} • {formatINR(selectedOrder.final_amount)}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="p-1.5 text-[var(--ts-text-muted)] hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Customer, Address & Items */}
            <div className="lg:col-span-6 space-y-4 text-xs">
              <div className="p-4 border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-elevated)] space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-[var(--ts-accent)]">
                  Client &amp; Delivery Snapshot
                </p>
                <p className="text-[var(--ts-text-primary)] font-medium">
                  {selectedOrder.delivery_address_snapshot.full_name} (
                  {selectedOrder.delivery_address_snapshot.phone})
                </p>
                <p className="text-[var(--ts-text-secondary)]">
                  {selectedOrder.delivery_address_snapshot.house_building},{' '}
                  {selectedOrder.delivery_address_snapshot.street}
                </p>
                <p className="text-[var(--ts-text-secondary)]">
                  {selectedOrder.delivery_address_snapshot.city},{' '}
                  {selectedOrder.delivery_address_snapshot.state} -{' '}
                  <strong className="text-[var(--ts-accent)]">
                    {selectedOrder.delivery_address_snapshot.pin_code}
                  </strong>
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-[var(--ts-text-muted)]">
                  Order Items ({selectedOrder.order_items?.length ?? 0})
                </p>
                {(selectedOrder.order_items || []).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-elevated)]"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={item.product_image_snapshot}
                        alt=""
                        className="w-10 h-12 object-cover"
                      />
                      <div>
                        <p className="text-[var(--ts-text-primary)] font-medium">{item.product_name_snapshot}</p>
                        <p className="text-[10px] text-[var(--ts-text-muted)]">
                          SKU: {item.sku_snapshot} • Qty: {item.quantity}
                        </p>
                      </div>
                    </div>
                    <span className="text-[var(--ts-accent)] font-medium">
                      {formatINR(item.total_price)}
                    </span>
                  </div>
                ))}
              </div>

              {(() => {
                const proofUrl = sanitizeHttpUrl(
                  selectedOrder.payment_verifications?.[0]?.proof_image_url ||
                    (selectedOrder.payments?.[0]?.raw_metadata?.proof_image_url as string | undefined)
                );
                if (!proofUrl) return null;
                return (
                  <div className="p-4 border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-elevated)] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-widest text-[var(--ts-accent)]">
                        Uploaded Payment Screenshot
                      </p>
                      <a
                        href={proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--ts-accent)] hover:underline"
                      >
                        <span>Open Full Image</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="block">
                      <img
                        src={proofUrl}
                        alt="Customer UPI payment screenshot"
                        className="max-h-64 w-full object-contain border border-[var(--ts-border-subtle)] bg-black/10"
                      />
                    </a>
                  </div>
                );
              })()}
            </div>

            {/* Right: Lifecycle Status, Tracking & Cancellation/Refund Form */}
            <form onSubmit={handleLifecycleUpdate} className="lg:col-span-6 space-y-4">
              <Select
                label="Delivery Lifecycle Status *"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as OrderDeliveryStatus)}
                options={DELIVERY_STATUS_OPTIONS}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Courier Partner"
                  value={courierPartner}
                  onChange={(e) => setCourierPartner(e.target.value)}
                  placeholder="BlueDart / Delhivery"
                />
                <Input
                  label="AWB Tracking Number"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="e.g., BD89234712IN"
                />
              </div>

              <Input
                label="External Tracking URL"
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="https://..."
              />

              <Input
                label="Status Note / Cancellation or Refund Reason"
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Recorded in customer order timeline & audit log"
              />

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" variant="gold" size="md" isLoading={isUpdating}>
                  Commit Order Update
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setSelectedOrder(null)}
                >
                  Close
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search & Lifecycle Status Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-[var(--ts-text-muted)] absolute left-3.5 top-3.5" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order #, customer name, phone, UTR..."
            className="w-full bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] pl-10 pr-4 py-2.5 text-xs text-[var(--ts-text-primary)] focus:outline-none focus:border-[var(--ts-accent)]"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] px-4 py-2.5 text-xs text-[var(--ts-text-primary)]"
        >
          <option value="all">All Delivery Statuses</option>
          {DELIVERY_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Orders Table */}
      {isLoading ? (
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-12 text-center text-xs text-[var(--ts-text-muted)]">
          Loading orders...
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--ts-border-subtle)] text-[10px] uppercase tracking-widest text-[var(--ts-text-muted)]">
                <th className="p-4">Order #</th>
                <th className="p-4">Client &amp; City</th>
                <th className="p-4">Total</th>
                <th className="p-4">Payment Status</th>
                <th className="p-4">Delivery Status</th>
                <th className="p-4">Tracking</th>
                <th className="p-4 text-right">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ts-bg-subtle)]">
              {filteredOrders.map((ord) => (
                <tr key={ord.id} className="hover:bg-[var(--ts-bg-elevated)]">
                  <td className="p-4">
                    <p className="font-mono text-[var(--ts-accent)] font-medium">{ord.order_number}</p>
                    <p className="text-[11px] text-[var(--ts-text-muted)]">{formatDate(ord.created_at, true)}</p>
                  </td>
                  <td className="p-4">
                    <p className="text-[var(--ts-text-primary)] font-medium">
                      {ord.delivery_address_snapshot?.full_name || ord.customer_snapshot?.full_name}
                    </p>
                    <p className="text-[11px] text-[var(--ts-text-muted)]">
                      {ord.delivery_address_snapshot?.city}, {ord.delivery_address_snapshot?.state}{' '}
                      ({ord.delivery_address_snapshot?.pin_code})
                    </p>
                  </td>
                  <td className="p-4">
                    <p className="text-[var(--ts-text-primary)] font-medium">{formatINR(ord.final_amount)}</p>
                    <p className="text-[10px] uppercase text-[var(--ts-text-muted)]">
                      {ord.payment_method.replace('_', ' ')}
                    </p>
                  </td>
                  <td className="p-4">
                    <Badge
                      tone={
                        ord.payment_status === 'confirmed'
                          ? 'success'
                          : ord.payment_status === 'payment_verification'
                            ? 'gold'
                            : ord.payment_status === 'failed'
                              ? 'danger'
                              : 'warning'
                      }
                    >
                      {ord.payment_status.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <Badge
                      tone={
                        ord.delivery_status === 'delivered'
                          ? 'success'
                          : ord.delivery_status === 'cancelled' ||
                              ord.delivery_status === 'refunded'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {ord.delivery_status.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="p-4">
                    {ord.tracking_number ? (
                      <span className="font-mono text-[11px] text-[var(--ts-accent)] flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5" />
                        {ord.tracking_number}
                      </span>
                    ) : (
                      <span className="text-[var(--ts-text-faint)]">—</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      {(() => {
                        const proofUrl = sanitizeHttpUrl(
                          ord.payment_verifications?.[0]?.proof_image_url ||
                            (ord.payments?.[0]?.raw_metadata?.proof_image_url as string | undefined)
                        );
                        if (!proofUrl) return null;
                        return (
                          <a
                            href={proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[var(--ts-accent)] border border-[var(--ts-accent)]/40 px-2.5 py-1.5 hover:bg-[var(--ts-accent)] hover:text-[var(--ts-on-accent)] transition-colors"
                          >
                            <span>Screenshot</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        );
                      })()}
                      {(ord.payment_status === 'pending_payment' ||
                        ord.payment_status === 'payment_verification') && (
                        <Button
                          variant="gold"
                          size="sm"
                          onClick={async () => {
                            setError(null);
                            try {
                              await adminUpdateOrderStatus({
                                orderId: ord.id,
                                newDeliveryStatus: 'confirmed',
                                note: 'Payment manually verified and order confirmed by administrator',
                              });
                              await loadOrders();
                            } catch (err) {
                              setError(
                                err instanceof Error ? err.message : 'Failed to confirm order'
                              );
                            }
                          }}
                          leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                        >
                          Confirm Order
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openOrderModal(ord)}
                        leftIcon={<Eye className="w-3.5 h-3.5" />}
                      >
                        Inspect
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No Matching Orders"
          description="No orders matched your current search or lifecycle status filter."
        />
      )}
    </div>
  );
};

// ==============================================================================
// 2. ADMIN PAYMENT VERIFICATION & WEBHOOK MONITOR (/admin/payments)
// ==============================================================================
export const AdminPaymentsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'upi_queue' | 'all_payments' | 'webhooks'>(
    'upi_queue'
  );
  const [verifications, setVerifications] = useState<PaymentVerification[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<PaymentWebhookEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadPaymentData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [verifs, pays, hooks] = await Promise.all([
        fetchAdminPaymentVerifications(),
        fetchAdminAllPayments(),
        fetchAdminWebhookEvents(),
      ]);
      setVerifications(verifs);
      setPayments(pays);
      setWebhookEvents(hooks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load payment records');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPaymentData();
  }, [loadPaymentData]);

  const handleUpiDecision = async (
    verificationId: string,
    decision: 'approved' | 'rejected'
  ) => {
    setError(null);
    setProcessingId(verificationId);
    try {
      await adminDecideUpiVerification(
        verificationId,
        decision,
        remarksMap[verificationId] || undefined
      );
      await loadPaymentData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification decision failed');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
            Treasury Verification &amp; Webhooks
          </p>
          <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">
            Payment Management
          </h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadPaymentData()}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Refresh Treasury Ledger
        </Button>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--ts-border-subtle)] pb-4">
        <button
          type="button"
          onClick={() => setActiveTab('upi_queue')}
          className={`px-5 py-2.5 text-xs uppercase tracking-widest border cursor-pointer ${
            activeTab === 'upi_queue'
              ? 'border-[var(--ts-accent)] bg-[var(--ts-accent)] text-[var(--ts-on-accent)] font-medium'
              : 'border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] text-[var(--ts-text-secondary)]'
          }`}
        >
          UPI Verification Queue ({verifications.filter((v) => v.verification_status === 'pending').length} Pending)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('all_payments')}
          className={`px-5 py-2.5 text-xs uppercase tracking-widest border cursor-pointer ${
            activeTab === 'all_payments'
              ? 'border-[var(--ts-accent)] bg-[var(--ts-accent)] text-[var(--ts-on-accent)] font-medium'
              : 'border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] text-[var(--ts-text-secondary)]'
          }`}
        >
          All Payments &amp; Crypto ({payments.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('webhooks')}
          className={`px-5 py-2.5 text-xs uppercase tracking-widest border cursor-pointer ${
            activeTab === 'webhooks'
              ? 'border-[var(--ts-accent)] bg-[var(--ts-accent)] text-[var(--ts-on-accent)] font-medium'
              : 'border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] text-[var(--ts-text-secondary)]'
          }`}
        >
          Provider Webhook Events ({webhookEvents.length})
        </button>
      </div>

      {isLoading ? (
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-12 text-center text-xs text-[var(--ts-text-muted)]">
          Loading treasury records...
        </div>
      ) : activeTab === 'upi_queue' ? (
        verifications.length > 0 ? (
          <div className="space-y-4">
            {verifications.map((verif) => (
              <div
                key={verif.id}
                className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-[var(--ts-accent)] font-semibold">
                        UTR: {verif.utr_number}
                      </span>
                      <Badge
                        tone={
                          verif.verification_status === 'approved'
                            ? 'success'
                            : verif.verification_status === 'rejected'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {verif.verification_status}
                      </Badge>
                    </div>
                    <p className="text-xs text-[var(--ts-text-secondary)]">
                      Order:{' '}
                      <strong className="text-[var(--ts-text-primary)]">
                        {verif.orders?.order_number || verif.order_id}
                      </strong>{' '}
                      • Amount:{' '}
                      <strong className="text-[var(--ts-accent)]">
                        {formatINR(verif.orders?.final_amount ?? verif.payments?.amount ?? 0)}
                      </strong>{' '}
                      • Submitted: {formatDate(verif.submitted_at, true)}
                    </p>
                  </div>

                  {sanitizeHttpUrl(verif.proof_image_url) && (
                    <a
                      href={sanitizeHttpUrl(verif.proof_image_url)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-[var(--ts-accent)] border border-[var(--ts-accent)]/40 px-3 py-1.5 hover:bg-[var(--ts-accent)] hover:text-[var(--ts-on-accent)]"
                    >
                      <span>Inspect Payment Proof</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center text-xs">
                  <div className="md:col-span-5 space-y-1 text-[var(--ts-text-muted)]">
                    <p>Payer UPI ID: {verif.payer_upi_id || 'Not specified'}</p>
                    <p>Customer Note: {verif.customer_note || '—'}</p>
                    {verif.admin_remarks && (
                      <p className="text-[var(--ts-accent)]">Admin Remarks: {verif.admin_remarks}</p>
                    )}
                  </div>

                  {verif.verification_status === 'pending' && (
                    <div className="md:col-span-7 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <input
                        type="text"
                        placeholder="Verification note / bank statement reference..."
                        value={remarksMap[verif.id] || ''}
                        onChange={(e) =>
                          setRemarksMap((prev) => ({ ...prev, [verif.id]: e.target.value }))
                        }
                        className="flex-1 bg-[var(--ts-bg-main)] border border-[var(--ts-border-strong)] px-3 py-2.5 text-xs text-[var(--ts-text-primary)]"
                      />
                      <Button
                        variant="gold"
                        size="sm"
                        isLoading={processingId === verif.id}
                        onClick={() => void handleUpiDecision(verif.id, 'approved')}
                        leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                      >
                        Approve &amp; Deduct Stock
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        isLoading={processingId === verif.id}
                        onClick={() => void handleUpiDecision(verif.id, 'rejected')}
                        leftIcon={<XCircle className="w-3.5 h-3.5" />}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No UPI Submissions in Queue"
            description="When customers submit UPI UTR numbers at checkout, they appear here for manual verification."
          />
        )
      ) : activeTab === 'all_payments' ? (
        payments.length > 0 ? (
          <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--ts-border-subtle)] text-[10px] uppercase tracking-widest text-[var(--ts-text-muted)]">
                  <th className="p-4">Order</th>
                  <th className="p-4">Method / Provider</th>
                  <th className="p-4">Amount (INR)</th>
                  <th className="p-4">UTR / Crypto Hash / Invoice</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ts-bg-subtle)]">
                {payments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-[var(--ts-bg-elevated)]">
                    <td className="p-4 font-mono text-[var(--ts-accent)]">
                      {pay.orders?.order_number || pay.order_id.slice(0, 8)}
                    </td>
                    <td className="p-4 uppercase">
                      {pay.payment_method} ({pay.provider})
                    </td>
                    <td className="p-4 font-medium text-[var(--ts-text-primary)]">
                      {formatINR(pay.amount)}
                      {pay.crypto_amount && (
                        <span className="block text-[10px] text-[var(--ts-accent)]">
                          {pay.crypto_amount} {pay.crypto_currency}
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-mono text-[11px] text-[var(--ts-text-secondary)]">
                      {pay.utr_reference || pay.transaction_hash || pay.provider_invoice_id || '—'}
                    </td>
                    <td className="p-4">
                      <Badge
                        tone={
                          pay.status === 'confirmed'
                            ? 'success'
                            : pay.status === 'submitted_for_verification'
                              ? 'gold'
                              : pay.status === 'rejected' || pay.status === 'failed'
                                ? 'danger'
                                : 'warning'
                        }
                      >
                        {pay.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="p-4 text-[var(--ts-text-muted)]">{formatDate(pay.created_at, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No Payment Transactions Yet"
            description="All UPI QR and Cryptocurrency payment records appear here."
          />
        )
      ) : webhookEvents.length > 0 ? (
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--ts-border-subtle)] text-[10px] uppercase tracking-widest text-[var(--ts-text-muted)]">
                <th className="p-4">Event ID</th>
                <th className="p-4">Provider</th>
                <th className="p-4">Event Type</th>
                <th className="p-4">HMAC Verified</th>
                <th className="p-4">Status</th>
                <th className="p-4">Received At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ts-bg-subtle)]">
              {webhookEvents.map((ev) => (
                <tr key={ev.id} className="hover:bg-[var(--ts-bg-elevated)]">
                  <td className="p-4 font-mono text-[11px] text-[var(--ts-accent)]">{ev.event_id}</td>
                  <td className="p-4 uppercase">{ev.provider}</td>
                  <td className="p-4 text-[var(--ts-text-primary)]">{ev.event_type}</td>
                  <td className="p-4">
                    <Badge tone={ev.signature_verified ? 'success' : 'danger'}>
                      {ev.signature_verified ? 'HMAC Valid' : 'Invalid'}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <Badge tone="gold">{ev.processing_status}</Badge>
                  </td>
                  <td className="p-4 text-[var(--ts-text-muted)]">{formatDate(ev.received_at, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No Cryptocurrency Webhook Events Logged Yet"
          description="Incoming HMAC-verified webhook events from NOWPayments or Coinbase Commerce are logged here idempotently."
        />
      )}
    </div>
  );
};
