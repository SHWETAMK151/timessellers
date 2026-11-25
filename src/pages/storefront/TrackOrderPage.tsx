// ==============================================================================
// TIMESSELLERS — PUBLIC ORDER TRACKING PAGE (/track-order)
// Allows any customer to look up and track their order status, payment
// confirmation, and courier AWB details using Order Number + Phone Number
// without requiring a customer login.
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, Truck, CheckCircle2, Clock, Package, ExternalLink } from 'lucide-react';
import { fetchGuestOrderDetails } from '@/services/orderService';
import { formatDate, formatINR, cn, sanitizeHttpUrl } from '@/lib/utils';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
} from '@/components/ui/LuxuryPrimitives';
import type { Order, OrderDeliveryStatus } from '@/types/database';

const TRACKING_STAGES: {
  key: OrderDeliveryStatus;
  label: string;
}[] = [
  { key: 'pending_payment', label: 'Order Placed' },
  { key: 'confirmed', label: 'Payment Confirmed' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
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

export const TrackOrderPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(searchParams.get('order') || '');
  const [phone, setPhone] = useState(searchParams.get('phone') || '');
  const [order, setOrder] = useState<Order | null>(null);
  const [searched, setSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performLookup = useCallback(async (ordNum: string, ph: string) => {
    if (!ordNum.trim() || !ph.trim()) return;
    setError(null);
    setIsLoading(true);
    setSearched(true);
    try {
      const found = await fetchGuestOrderDetails({
        orderNumber: ordNum.trim(),
        phone: ph.trim(),
      });
      setOrder(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to look up order.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const qOrder = searchParams.get('order');
    const qPhone = searchParams.get('phone');
    if (qOrder && qPhone) {
      void performLookup(qOrder, qPhone);
    }
  }, [searchParams, performLookup]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void performLookup(orderNumber, phone);
  };

  const currentStageIdx = order ? (STAGE_ORDER_INDEX[order.delivery_status] ?? 0) : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14 space-y-10">
      <div className="border-b border-[var(--ts-border-subtle)] pb-6 space-y-2">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
          Concierge Dispatch Lookup
        </p>
        <h1 className="font-serif-luxury text-3xl sm:text-5xl text-[var(--ts-text-primary)]">
          Track Your Order
        </h1>
        <p className="text-xs text-[var(--ts-text-muted)]">
          Enter your Order Number and Mobile Phone Number to inspect payment confirmation and
          delivery milestones.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-12 gap-4 items-end"
      >
        <div className="sm:col-span-5">
          <Input
            label="Order Number *"
            required
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
            placeholder="TS-20261123-XXXXXX"
          />
        </div>
        <div className="sm:col-span-4">
          <Input
            label="Mobile Phone Number *"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9876543210"
          />
        </div>
        <div className="sm:col-span-3">
          <Button
            type="submit"
            variant="gold"
            size="md"
            className="w-full"
            isLoading={isLoading}
            leftIcon={<Search className="w-4 h-4" />}
          >
            Track Order
          </Button>
        </div>
      </form>

      {error && <ErrorBanner message={error} />}

      {order ? (
        <div className="space-y-6">
          <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-4">
              <div>
                <p className="font-mono text-sm text-[var(--ts-accent)] font-semibold">
                  {order.order_number}
                </p>
                <p className="text-xs text-[var(--ts-text-muted)]">
                  Placed on {formatDate(order.created_at, true)} • Total:{' '}
                  <strong className="text-[var(--ts-text-primary)]">
                    {formatINR(order.final_amount, true)}
                  </strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
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
                <Badge tone={order.delivery_status === 'delivered' ? 'success' : 'neutral'}>
                  Status: {order.delivery_status.replace(/_/g, ' ')}
                </Badge>
              </div>
            </div>

            {/* 6-Stage Progress */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {TRACKING_STAGES.map((stage, idx) => {
                const isCompleted =
                  idx < currentStageIdx ||
                  (idx === currentStageIdx && order.payment_status === 'confirmed') ||
                  idx === 0;
                return (
                  <div
                    key={stage.key}
                    className={cn(
                      'p-3.5 border space-y-1.5',
                      idx === currentStageIdx
                        ? 'border-[var(--ts-accent)] bg-[var(--ts-bg-accent-tint)]'
                        : isCompleted
                          ? 'border-emerald-700/40 bg-emerald-500/10'
                          : 'border-[var(--ts-border-subtle)] bg-[var(--ts-bg-elevated)] opacity-60'
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-[var(--ts-accent)]" />
                    ) : (
                      <Clock className="w-4 h-4 text-[var(--ts-text-faint)]" />
                    )}
                    <p className="text-xs font-medium text-[var(--ts-text-primary)]">
                      {stage.label}
                    </p>
                  </div>
                );
              })}
            </div>

            {order.tracking_number && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs p-3.5 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)]">
                <div className="flex items-center gap-3">
                  <Truck className="w-4 h-4 text-[var(--ts-accent)] shrink-0" />
                  <span>
                    {order.courier_partner ? `${order.courier_partner} • ` : ''}
                    AWB Tracking: <strong className="font-mono">{order.tracking_number}</strong>
                  </span>
                </div>
                {sanitizeHttpUrl(order.tracking_url) && (
                  <a
                    href={sanitizeHttpUrl(order.tracking_url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[var(--ts-accent)] hover:underline font-medium"
                  >
                    <span>Track Shipment</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}

            {/* Items */}
            <div className="space-y-2 pt-2">
              <p className="text-[10px] uppercase tracking-widest text-[var(--ts-text-muted)]">
                Ordered Items
              </p>
              {(order.order_items || []).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-elevated)] text-xs"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={item.product_image_snapshot}
                      alt={item.product_name_snapshot}
                      className="w-10 h-12 object-cover"
                    />
                    <div>
                      <p className="text-[var(--ts-text-primary)] font-medium">
                        {item.product_name_snapshot}
                      </p>
                      <p className="text-[var(--ts-text-muted)]">
                        Qty: {item.quantity} × {formatINR(item.unit_price_at_purchase)}
                      </p>
                    </div>
                  </div>
                  <span className="font-medium text-[var(--ts-text-primary)]">
                    {formatINR(item.total_price)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        searched &&
        !isLoading && (
          <EmptyState
            title="Order Not Found"
            description="No order matched that Order Number and Phone Number combination. Please verify both fields."
            icon={<Package className="w-5 h-5" />}
            action={
              <Link to="/shop">
                <Button variant="outline" size="sm">
                  Continue Shopping
                </Button>
              </Link>
            }
          />
        )
      )}
    </div>
  );
};
