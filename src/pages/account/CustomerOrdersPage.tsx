// ==============================================================================
// TIMESSELLERS — CUSTOMER ORDERS & ORDER TRACKING PAGES
// (/account/orders & /account/orders/:id)
// Displays complete order history, payment status, delivery status,
// 6-stage visual tracking timeline with timestamps, tracking numbers,
// and ability to submit UPI UTR proof if still pending_payment.
// ==============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Package,
  CheckCircle2,
  Clock,
  Truck,
  ShieldCheck,
  XCircle,
  ArrowLeft,
  ExternalLink,
  Upload,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import {
  fetchCustomerOrders,
  fetchCustomerOrderById,
  submitUpiPaymentVerification,
} from '@/services/orderService';
import { uploadFileToStorage } from '@/services/storageService';
import { formatDate, formatINR, isValidUtrNumber, cn, sanitizeHttpUrl } from '@/lib/utils';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
} from '@/components/ui/LuxuryPrimitives';
import type { Order, OrderDeliveryStatus } from '@/types/database';

export const CustomerOrdersPage: React.FC = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    fetchCustomerOrders(user.id)
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load orders'))
      .finally(() => setIsLoading(false));
  }, [user]);

  return (
    <div className="space-y-6">
      <div className="border-b border-[var(--ts-border-subtle)] pb-4">
        <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--ts-accent)]">
          Acquisition Archive
        </p>
        <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">My Orders</h1>
      </div>

      {error && <ErrorBanner message={error} />}

      {isLoading ? (
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-12 text-center text-xs text-[var(--ts-text-muted)]">
          Loading order history...
        </div>
      ) : orders.length > 0 ? (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-sm text-[var(--ts-accent)] font-semibold">
                      {order.order_number}
                    </span>
                    <Badge
                      tone={
                        order.payment_status === 'confirmed'
                          ? 'success'
                          : order.payment_status === 'payment_verification'
                            ? 'gold'
                            : order.payment_status === 'failed'
                              ? 'danger'
                              : 'warning'
                      }
                    >
                      Payment: {order.payment_status.replace(/_/g, ' ')}
                    </Badge>
                    <Badge
                      tone={
                        order.delivery_status === 'delivered'
                          ? 'success'
                          : order.delivery_status === 'cancelled' ||
                              order.delivery_status === 'refunded'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      Delivery: {order.delivery_status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[var(--ts-text-muted)]">
                    Placed on {formatDate(order.created_at, true)} • Method:{' '}
                    <span className="uppercase">{order.payment_method.replace('_', ' ')}</span>
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-widest text-[var(--ts-text-muted)]">Total</p>
                    <p className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
                      {formatINR(order.final_amount)}
                    </p>
                  </div>
                  <Link to={`/account/orders/${order.id}`}>
                    <Button variant="gold" size="sm">
                      View &amp; Track
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Order Items Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(order.order_items || []).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-2.5 bg-[var(--ts-bg-elevated)] border border-[var(--ts-border-subtle)]"
                  >
                    <img
                      src={item.product_image_snapshot}
                      alt={item.product_name_snapshot}
                      className="w-12 h-14 object-cover bg-[var(--ts-bg-subtle)]"
                    />
                    <div className="overflow-hidden text-xs">
                      <p className="text-[var(--ts-text-primary)] font-medium truncate">
                        {item.product_name_snapshot}
                      </p>
                      {item.variant_label_snapshot && (
                        <p className="text-[10px] text-[var(--ts-accent)] truncate">
                          {item.variant_label_snapshot}
                        </p>
                      )}
                      <p className="text-[11px] text-[var(--ts-text-muted)]">
                        Qty: {item.quantity} × {formatINR(item.unit_price_at_purchase)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No Orders Found"
          description="You have not placed any orders yet."
          icon={<Package className="w-5 h-5" />}
          action={
            <Link to="/shop">
              <Button variant="gold" size="sm">
                Start Shopping
              </Button>
            </Link>
          }
        />
      )}
    </div>
  );
};

// 6-Stage Order Tracking Milestones (Section 13 requirement)
const TRACKING_STAGES: {
  key: OrderDeliveryStatus;
  label: string;
  description: string;
}[] = [
  {
    key: 'pending_payment',
    label: 'Order Placed',
    description: 'Order logged in TIMESSELLERS vault',
  },
  {
    key: 'confirmed',
    label: 'Payment Confirmed',
    description: 'Treasury or webhook payment verified & stock allocated',
  },
  {
    key: 'processing',
    label: 'Processing',
    description: 'Quality inspection & bespoke packaging',
  },
  {
    key: 'shipped',
    label: 'Shipped',
    description: 'Handed over to insured courier partner',
  },
  {
    key: 'out_for_delivery',
    label: 'Out for Delivery',
    description: 'Courier in your destination city',
  },
  {
    key: 'delivered',
    label: 'Delivered',
    description: 'Handed over at your registered address',
  },
];

const STAGE_ORDER_INDEX: Record<string, number> = {
  pending_payment: 0,
  payment_verification: 0,
  confirmed: 1,
  processing: 2,
  shipped: 3,
  out_for_delivery: 4,
  delivered: 5,
};

export const OrderTrackingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { storeSettings } = useStoreSettings();

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Late UPI submission state if customer hasn't submitted UTR yet
  const [utrInput, setUtrInput] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submittingUtr, setSubmittingUtr] = useState(false);

  const loadOrder = useCallback(async () => {
    if (!id || !user) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchCustomerOrderById(id, user.id);
      setOrder(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load order details');
    } finally {
      setIsLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  const handleLateUtrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !user) return;
    setError(null);

    if (!isValidUtrNumber(utrInput)) {
      setError('Enter a valid 12-digit alphanumeric UTR reference number.');
      return;
    }

    setSubmittingUtr(true);
    try {
      let proofUrl: string | undefined;
      if (proofFile) {
        const up = await uploadFileToStorage('payment-proofs', proofFile, user.id);
        proofUrl = up.url;
      }
      await submitUpiPaymentVerification({
        orderId: order.id,
        utrNumber: utrInput.trim().toUpperCase(),
        proofImageUrl: proofUrl,
      });
      await loadOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'UTR submission failed');
    } finally {
      setSubmittingUtr(false);
    }
  };

  if (isLoading) {
    return (
      <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-12 text-center text-xs text-[var(--ts-text-muted)]">
        Loading order dossier...
      </div>
    );
  }

  if (!order) {
    return (
      <EmptyState
        title="Order Not Found"
        description="This order does not exist or belongs to another account."
        action={
          <Link to="/account/orders">
            <Button variant="outline" size="sm">
              Back to My Orders
            </Button>
          </Link>
        }
      />
    );
  }

  const currentStageIdx = STAGE_ORDER_INDEX[order.delivery_status] ?? 0;
  const isCancelledOrRefunded =
    order.delivery_status === 'cancelled' || order.delivery_status === 'refunded';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-4">
        <div className="space-y-1">
          <Link
            to="/account/orders"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--ts-text-muted)] hover:text-[var(--ts-accent)]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Orders</span>
          </Link>
          <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">
            Order {order.order_number}
          </h1>
          <p className="text-xs text-[var(--ts-text-muted)]">
            Placed on {formatDate(order.created_at, true)}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
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
          <Badge
            tone={
              order.delivery_status === 'delivered'
                ? 'success'
                : isCancelledOrRefunded
                  ? 'danger'
                  : 'gold'
            }
          >
            Status: {order.delivery_status.replace(/_/g, ' ')}
          </Badge>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* 6-Stage Visual Order Tracking Progress */}
      <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
            Live Delivery Milestone Tracking
          </h2>
          {order.tracking_number && (
            <div className="flex items-center gap-3 text-xs bg-[var(--ts-bg-elevated)] border border-[var(--ts-border-strong)] px-4 py-2">
              <Truck className="w-4 h-4 text-[var(--ts-accent)]" />
              <span>
                {order.courier_partner ? `${order.courier_partner} • ` : ''}
                AWB: <strong className="text-[var(--ts-accent)] font-mono">{order.tracking_number}</strong>
              </span>
              {sanitizeHttpUrl(order.tracking_url) && (
                <a
                  href={sanitizeHttpUrl(order.tracking_url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--ts-accent)] hover:underline inline-flex items-center gap-1"
                >
                  <span>Track</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
        </div>

        {isCancelledOrRefunded ? (
          <div className="p-5 border border-red-900/60 bg-red-950/20 flex items-start gap-3 text-red-200 text-xs">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium uppercase tracking-wider">
                Order {order.delivery_status.toUpperCase()}
              </p>
              <p className="text-red-300/80">
                {order.cancellation_reason ||
                  order.refund_reason ||
                  'This order was cancelled or refunded.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 pt-2">
            {TRACKING_STAGES.map((stage, idx) => {
              const isCompleted =
                idx < currentStageIdx ||
                (idx === currentStageIdx && order.payment_status === 'confirmed') ||
                (idx === 0 && true);
              const isCurrent = idx === currentStageIdx;

              return (
                <div
                  key={stage.key}
                  className={cn(
                    'p-4 border space-y-2 transition-all',
                    isCurrent
                      ? 'border-[var(--ts-accent)] bg-[var(--ts-bg-accent-tint)]'
                      : isCompleted
                        ? 'border-emerald-900/60 bg-emerald-950/15'
                        : 'border-[var(--ts-border-subtle)] bg-[var(--ts-bg-elevated)] opacity-50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-[var(--ts-text-muted)]">0{idx + 1}</span>
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-[var(--ts-accent)]" />
                    ) : (
                      <Clock className="w-4 h-4 text-[var(--ts-text-faint)]" />
                    )}
                  </div>
                  <p className="text-xs font-medium text-[var(--ts-text-primary)]">{stage.label}</p>
                  <p className="text-[11px] text-[var(--ts-text-muted)] leading-snug">{stage.description}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* If UPI Payment is still pending or rejected, allow submitting UTR right here */}
      {order.payment_method === 'upi_qr' &&
        (order.payment_status === 'pending_payment' || order.payment_status === 'failed') && (
          <form
            onSubmit={handleLateUtrSubmit}
            className="border border-[var(--ts-accent)]/50 bg-[var(--ts-bg-accent-tint)] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-serif-luxury text-xl text-[var(--ts-text-primary)]">
                Submit UPI UTR for Verification (Payable: {formatINR(order.final_amount)} to{' '}
                <span className="text-[var(--ts-accent)] font-mono">{storeSettings.upi_id}</span>)
              </h3>
              <Badge tone="warning">Action Required</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="12-Digit UTR / Reference Number *"
                required
                value={utrInput}
                onChange={(e) => setUtrInput(e.target.value)}
                placeholder="Enter 12-digit UTR"
              />
              <div className="space-y-1.5">
                <label className="block text-[11px] uppercase tracking-[0.18em] text-[var(--ts-text-secondary)]">
                  Payment Proof Image (Optional)
                </label>
                <label className="flex items-center gap-2 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] px-4 py-3 text-xs text-[var(--ts-text-secondary)] cursor-pointer">
                  <Upload className="w-4 h-4 text-[var(--ts-accent)]" />
                  <span className="truncate">
                    {proofFile ? proofFile.name : 'Attach Screenshot'}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
            <Button type="submit" variant="gold" size="sm" isLoading={submittingUtr}>
              Submit UTR for Treasury Verification
            </Button>
          </form>
        )}

      {/* Order Items & Financial Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 space-y-4">
          <h3 className="font-serif-luxury text-xl text-[var(--ts-text-primary)] border-b border-[var(--ts-border-subtle)] pb-3">
            Ordered Creations
          </h3>
          <div className="space-y-3">
            {(order.order_items || []).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 border-b border-[var(--ts-bg-subtle)] pb-3"
              >
                <div className="flex items-center gap-3.5">
                  <img
                    src={item.product_image_snapshot}
                    alt={item.product_name_snapshot}
                    className="w-14 h-16 object-cover bg-[var(--ts-bg-elevated)] border border-[var(--ts-border-subtle)]"
                  />
                  <div>
                    <p className="text-sm text-[var(--ts-text-primary)] font-medium">
                      {item.product_name_snapshot}
                    </p>
                    <p className="text-[11px] text-[var(--ts-text-muted)]">SKU: {item.sku_snapshot}</p>
                    {item.variant_label_snapshot && (
                      <p className="text-[11px] text-[var(--ts-accent)]">
                        Variant: {item.variant_label_snapshot}
                      </p>
                    )}
                    <p className="text-xs text-[var(--ts-text-secondary)]">
                      Qty: {item.quantity} × {formatINR(item.unit_price_at_purchase)}
                    </p>
                  </div>
                </div>
                <span className="font-serif-luxury text-lg text-[var(--ts-text-primary)]">
                  {formatINR(item.total_price)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          {/* Delivery Destination Snapshot */}
          <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 space-y-2 text-xs">
            <h3 className="font-serif-luxury text-xl text-[var(--ts-text-primary)] border-b border-[var(--ts-border-subtle)] pb-3 mb-3">
              Delivery Destination
            </h3>
            <p className="text-[var(--ts-text-primary)] font-medium">
              {order.delivery_address_snapshot.full_name}
            </p>
            <p className="text-[var(--ts-text-secondary)]">{order.delivery_address_snapshot.phone}</p>
            <p className="text-[var(--ts-text-secondary)]">
              {order.delivery_address_snapshot.house_building},{' '}
              {order.delivery_address_snapshot.street}
            </p>
            {order.delivery_address_snapshot.landmark && (
              <p className="text-[var(--ts-text-muted)]">
                Landmark: {order.delivery_address_snapshot.landmark}
              </p>
            )}
            <p className="text-[var(--ts-text-secondary)]">
              {order.delivery_address_snapshot.city}, {order.delivery_address_snapshot.state} -{' '}
              <strong className="text-[var(--ts-accent)]">{order.delivery_address_snapshot.pin_code}</strong>
            </p>
          </div>

          {/* Financial Summary */}
          <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 space-y-3 text-xs">
            <h3 className="font-serif-luxury text-xl text-[var(--ts-text-primary)] border-b border-[var(--ts-border-subtle)] pb-3">
              Payment Summary
            </h3>
            <div className="flex justify-between text-[var(--ts-text-secondary)]">
              <span>Subtotal</span>
              <span className="text-[var(--ts-text-primary)]">{formatINR(order.subtotal_amount)}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Discount</span>
                <span>-{formatINR(order.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-[var(--ts-text-secondary)]">
              <span>Shipping</span>
              <span className="text-[var(--ts-text-primary)]">
                {Number(order.shipping_amount) === 0
                  ? 'Complimentary'
                  : formatINR(order.shipping_amount)}
              </span>
            </div>
            <div className="border-t border-[var(--ts-border-subtle)] pt-3 flex justify-between items-baseline">
              <span className="uppercase tracking-widest text-[var(--ts-text-primary)]">Final Total</span>
              <span className="font-serif-luxury text-2xl text-[var(--ts-accent)]">
                {formatINR(order.final_amount)}
              </span>
            </div>
            {order.payment_reference && (
              <div className="pt-2 text-[11px] text-[var(--ts-text-muted)]">
                Reference / UTR: <code className="text-[var(--ts-accent)]">{order.payment_reference}</code>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audit Status History Timeline */}
      {order.order_status_history && order.order_status_history.length > 0 && (
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 space-y-4">
          <h3 className="font-serif-luxury text-xl text-[var(--ts-text-primary)] border-b border-[var(--ts-border-subtle)] pb-3">
            Chronological Status Ledger
          </h3>
          <div className="space-y-3">
            {order.order_status_history.map((hist) => (
              <div
                key={hist.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs border-b border-[var(--ts-bg-subtle)] pb-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[var(--ts-accent)] shrink-0" />
                  <div>
                    <span className="text-[var(--ts-text-primary)] font-medium uppercase tracking-wider">
                      {hist.new_delivery_status.replace(/_/g, ' ')}
                    </span>
                    {hist.note && <p className="text-[var(--ts-text-muted)]">{hist.note}</p>}
                  </div>
                </div>
                <span className="text-[11px] text-[var(--ts-text-muted)] shrink-0">
                  {formatDate(hist.created_at, true)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
