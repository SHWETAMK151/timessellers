// ==============================================================================
// TIMESSELLERS — CHECKOUT & GATEWAY-FREE UPI + CRYPTO PAYMENT FLOW (/checkout)
// Integrates `Ujjawal99711/gateway-free-upi-checkout`:
// 1. Server allocates a unique decimal paisa amount per order for today
//    (always at or slightly below the base order total — customer never overpays).
// 2. Generates a dynamic UPI QR code (`qrcode`) encoded with that exact paisa amount
//    (`upi://pay?pa=...&am=XXX.XX&cu=INR&tn=Order...`).
// 3. Auto-polls every 12 seconds (`pollGatewayFreeUpiStatus` + Supabase order read)
//    so when the Gmail Bank Credit Watcher (`apps-script/Code.gs`) matches the exact
//    paise amount, the page automatically confirms the order without requiring
//    manual UTR entry.
// 4. Also retains an expandable "Manual UTR / Receipt Fallback" drawer in case the
//    buyer wants to submit their 12-digit UTR manually for admin verification.
// ==============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  QrCode,
  Coins,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  Upload,
  ExternalLink,
  Clock,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import {
  createOrderOnServer,
  getServerCheckoutQuote,
  submitUpiPaymentVerification,
  createCryptoPaymentInvoice,
  fetchCustomerOrderById,
  fetchGuestOrderDetails,
  registerGatewayFreeUpiBridge,
  pollGatewayFreeUpiStatus,
  type CryptoInvoiceResponse,
} from '@/services/orderService';
import { uploadFileToStorage } from '@/services/storageService';
import {
  buildGatewayFreeUpiIntentUrl,
  formatINR,
  INDIAN_STATES,
  isValidIndianPhone,
  isValidIndianPinCode,
  isValidUtrNumber,
  normalizeIndianPhone,
  cn,
} from '@/lib/utils';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  Select,
} from '@/components/ui/LuxuryPrimitives';
import type {
  Address,
  CheckoutQuote,
  DeliveryAddressSnapshot,
  Order,
  PaymentMethodType,
} from '@/types/database';

export const CheckoutPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { items, clearCart } = useCart();
  const { storeSettings, shippingSettings } = useStoreSettings();

  // Saved addresses
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('new');
  const [saveAddressToProfile, setSaveAddressToProfile] = useState(true);

  // Delivery Form Fields
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [houseBuilding, setHouseBuilding] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState<string>('Maharashtra');
  const [pinCode, setPinCode] = useState('');

  // Payment Method
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('upi_qr');
  const [selectedCrypto, setSelectedCrypto] = useState<string>(
    storeSettings.supported_crypto_currencies?.[0] || 'USDT (TRC20)'
  );

  // Server Quote
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // Active Placed Order for Step 2 (Payment Settlement)
  const [activeOrder, setActiveOrder] = useState<{
    order_id: string;
    order_number: string;
    guest_token?: string;
    base_amount?: number;
    final_amount: number;
    unique_payable_amount?: number;
    paisa_code_discount?: number;
    gateway_free_token?: string;
    expires_at?: string;
    payment_method: PaymentMethodType;
  } | null>(null);

  // Dynamic Gateway-Free UPI QR Data URL & Auto-Polling State
  const [dynamicQrDataUrl, setDynamicQrDataUrl] = useState<string>('');
  const [autoPollStatus, setAutoPollStatus] = useState<
    'waiting' | 'checking' | 'paid' | 'review' | 'expired'
  >('waiting');
  const [autoMatchedUtr, setAutoMatchedUtr] = useState<string | null>(null);
  const [showManualUtrFallback, setShowManualUtrFallback] = useState(false);

  // Manual UPI Verification Submission Fallback State
  const [utrNumber, setUtrNumber] = useState('');
  const [payerUpiId, setPayerUpiId] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isSubmittingUpi, setIsSubmittingUpi] = useState(false);
  const [upiSubmittedSuccess, setUpiSubmittedSuccess] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedExactAmt, setCopiedExactAmt] = useState(false);

  // Crypto Invoice State
  const [cryptoInvoice, setCryptoInvoice] = useState<CryptoInvoiceResponse['invoice'] | null>(null);
  const [isGeneratingCrypto, setIsGeneratingCrypto] = useState(false);
  const [liveOrderData, setLiveOrderData] = useState<Order | null>(null);
  const [copiedCryptoAddr, setCopiedCryptoAddr] = useState(false);

  // Load saved addresses
  useEffect(() => {
    if (!user) return;
    supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) {
          const list = data as Address[];
          setSavedAddresses(list);
          const def = list.find((a) => a.is_default) || list[0];
          setSelectedAddressId(def.id);
          populateFormFromAddress(def);
        }
      });
  }, [user]);

  const populateFormFromAddress = (addr: Address) => {
    setFullName(addr.full_name);
    setPhone(addr.phone);
    setHouseBuilding(addr.house_building);
    setStreet(addr.street);
    setLandmark(addr.landmark || '');
    setCity(addr.city);
    setStateName(addr.state);
    setPinCode(addr.pin_code);
  };

  // Load authoritative server quote
  useEffect(() => {
    if (items.length === 0 || activeOrder) return;
    let active = true;
    setQuoteLoading(true);
    getServerCheckoutQuote(
      items.map((i) => ({
        product_id: i.product_id,
        variant_id: i.variant_id,
        quantity: i.quantity,
      }))
    )
      .then((q) => {
        if (active) setQuote(q);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to calculate order total');
      })
      .finally(() => {
        if (active) setQuoteLoading(false);
      });

    return () => {
      active = false;
    };
  }, [items, activeOrder]);

  // Generate Dynamic UPI QR Code with the exact paisa amount when activeOrder is created
  useEffect(() => {
    if (!activeOrder || activeOrder.payment_method !== 'upi_qr') return;
    const exactAmount = Number(
      activeOrder.unique_payable_amount ?? activeOrder.final_amount
    );
    const upiIntentUrl = buildGatewayFreeUpiIntentUrl({
      upiId: storeSettings.upi_id,
      payeeName: storeSettings.upi_display_name,
      exactAmount,
      orderNumber: activeOrder.order_number,
    });

    QRCode.toDataURL(upiIntentUrl, {
      width: 260,
      margin: 2,
      color: {
        dark: '#070707',
        light: '#FFFFFF',
      },
    })
      .then(setDynamicQrDataUrl)
      .catch(() => {});
  }, [activeOrder, storeSettings.upi_id, storeSettings.upi_display_name]);

  // Gateway-Free UPI & Crypto Real-Time Status Polling (every 12 seconds, matching demo/index.html)
  const checkOrderPaymentStatus = useCallback(async () => {
    if (!activeOrder) return;
    setAutoPollStatus((prev) => (prev === 'paid' ? 'paid' : 'checking'));

    try {
      // 1. Check directly in Supabase database first (works for both guest & authenticated orders)
      const ord = user
        ? await fetchCustomerOrderById(activeOrder.order_id, user.id)
        : activeOrder.guest_token
          ? await fetchGuestOrderDetails({
              orderId: activeOrder.order_id,
              guestToken: activeOrder.guest_token,
            })
          : null;

      if (ord) {
        setLiveOrderData(ord);
        if (ord.payment_status === 'confirmed') {
          setAutoPollStatus('paid');
          setAutoMatchedUtr(ord.payment_reference || null);
          return;
        }
      }

      // 2. If UPI QR, also nudge the Gateway-Free UPI Edge Function / Apps Script bridge
      if (activeOrder.payment_method === 'upi_qr') {
        const res = await pollGatewayFreeUpiStatus(
          activeOrder.order_id,
          activeOrder.guest_token
        ).catch(() => null);
        if (res?.status === 'Paid' || res?.payment_status === 'confirmed') {
          setAutoPollStatus('paid');
          setAutoMatchedUtr(res.utr || null);
          return;
        } else if (res?.status === 'Expired') {
          setAutoPollStatus('expired');
          return;
        }
      }

      setAutoPollStatus((prev) => (prev === 'paid' ? 'paid' : 'waiting'));
    } catch {
      setAutoPollStatus((prev) => (prev === 'paid' ? 'paid' : 'waiting'));
    }
  }, [activeOrder, user]);

  useEffect(() => {
    if (!activeOrder || autoPollStatus === 'paid') return;
    const interval = setInterval(() => {
      void checkOrderPaymentStatus();
    }, 12000);
    return () => clearInterval(interval);
  }, [activeOrder, autoPollStatus, checkOrderPaymentStatus]);

  const handleAddressSelectChange = (addrId: string) => {
    setSelectedAddressId(addrId);
    if (addrId === 'new') {
      setFullName(profile?.full_name || '');
      setPhone(profile?.phone || '');
      setHouseBuilding('');
      setStreet('');
      setLandmark('');
      setCity('');
      setPinCode('');
    } else {
      const found = savedAddresses.find((a) => a.id === addrId);
      if (found) populateFormFromAddress(found);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('Recipient full name is required.');
      return;
    }
    if (!isValidIndianPhone(phone)) {
      setError('Please enter a valid 10-digit Indian phone number.');
      return;
    }
    if (!houseBuilding.trim() || !street.trim() || !city.trim() || !stateName.trim()) {
      setError('Please complete House/Building, Street, City, and State fields.');
      return;
    }
    if (!isValidIndianPinCode(pinCode)) {
      setError('Please enter a valid 6-digit Indian PIN code.');
      return;
    }

    const deliverySnapshot: DeliveryAddressSnapshot = {
      full_name: fullName.trim(),
      phone: normalizeIndianPhone(phone),
      email: email.trim() || null,
      house_building: houseBuilding.trim(),
      street: street.trim(),
      landmark: landmark.trim() || null,
      city: city.trim(),
      state: stateName.trim(),
      pin_code: pinCode.trim(),
      country: 'India',
    };

    setIsPlacingOrder(true);
    try {
      if (user && selectedAddressId === 'new' && saveAddressToProfile) {
        await supabase.from('addresses').insert({
          user_id: user.id,
          label: 'Delivery Address',
          full_name: deliverySnapshot.full_name,
          phone: deliverySnapshot.phone,
          house_building: deliverySnapshot.house_building,
          street: deliverySnapshot.street,
          landmark: deliverySnapshot.landmark,
          city: deliverySnapshot.city,
          state: deliverySnapshot.state,
          pin_code: deliverySnapshot.pin_code,
          country: 'India',
          is_default: savedAddresses.length === 0,
        });
      }

      const created = await createOrderOnServer(
        items.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id,
          quantity: i.quantity,
        })),
        deliverySnapshot,
        paymentMethod
      );

      setActiveOrder(created);
      await clearCart();

      if (paymentMethod === 'upi_qr') {
        // Non-blocking bridge registration to Google Sheet Apps Script if configured
        void registerGatewayFreeUpiBridge(created.order_id, created.guest_token).catch(() => {});
      } else if (paymentMethod === 'crypto') {
        setIsGeneratingCrypto(true);
        try {
          const invRes = await createCryptoPaymentInvoice(
            created.order_id,
            selectedCrypto,
            created.guest_token
          );
          setCryptoInvoice(invRes.invoice);
        } catch (cryptoErr) {
          setError(
            cryptoErr instanceof Error
              ? cryptoErr.message
              : 'Order created, but cryptocurrency invoice generation encountered an issue.'
          );
        } finally {
          setIsGeneratingCrypto(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order creation failed.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleUpiProofSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder) return;
    setError(null);

    if (!isValidUtrNumber(utrNumber)) {
      setError('Please enter a valid 12-digit UTR / UPI reference number (alphanumeric, 10-22 characters).');
      return;
    }

    setIsSubmittingUpi(true);
    try {
      let uploadedProofUrl: string | undefined;
      if (proofFile) {
        const up = await uploadFileToStorage(
          'payment-proofs',
          proofFile,
          user ? user.id : `guest/${activeOrder.order_id}`
        );
        uploadedProofUrl = up.url;
      }

      await submitUpiPaymentVerification({
        orderId: activeOrder.order_id,
        utrNumber: utrNumber.trim().toUpperCase(),
        payerUpiId: payerUpiId.trim() || undefined,
        proofImageUrl: uploadedProofUrl,
        customerNote: customerNote.trim() || undefined,
        guestToken: activeOrder.guest_token,
      });

      setUpiSubmittedSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit UPI UTR verification.');
    } finally {
      setIsSubmittingUpi(false);
    }
  };

  // ============================================================================
  // STEP 2 VIEW: ORDER CREATED -> GATEWAY-FREE UPI QR OR CRYPTO SETTLEMENT
  // ============================================================================
  if (activeOrder) {
    const exactPayableAmount = Number(
      activeOrder.unique_payable_amount ?? activeOrder.final_amount
    );
    const paisaDiscount = Number(activeOrder.paisa_code_discount ?? 0);
    const baseOrderAmount = Number(activeOrder.base_amount ?? exactPayableAmount + paisaDiscount);

    const upiDeepLink = buildGatewayFreeUpiIntentUrl({
      upiId: storeSettings.upi_id,
      payeeName: storeSettings.upi_display_name,
      exactAmount: exactPayableAmount,
      orderNumber: activeOrder.order_number,
    });

    const exactPaiseDigits = exactPayableAmount.toFixed(2).split('.')[1];

    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        <div className="border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] p-6 sm:p-10 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-6">
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
                Order Reference • {activeOrder.order_number}
              </p>
              <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">
                {activeOrder.payment_method === 'upi_qr'
                  ? 'Gateway-Free UPI Auto-Confirm Checkout'
                  : 'Cryptocurrency Invoice Settlement'}
              </h1>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
                Unique Order Amount
              </p>
              <p className="font-serif-luxury text-3xl sm:text-4xl text-[var(--ts-accent)]">
                {formatINR(exactPayableAmount, true)}
              </p>
              {paisaDiscount > 0 && (
                <p className="text-[11px] text-emerald-400">
                  Includes -{formatINR(paisaDiscount, true)} unique paisa code discount (from{' '}
                  {formatINR(baseOrderAmount)})
                </p>
              )}
            </div>
          </div>

          {error && <ErrorBanner message={error} />}

          {/* FLOW A: GATEWAY-FREE UPI QR PAYMENT (Unique Paisa Code + Auto-Confirm + Manual UTR Fallback) */}
          {activeOrder.payment_method === 'upi_qr' && (
            <>
              {autoPollStatus === 'paid' || liveOrderData?.payment_status === 'confirmed' ? (
                <div className="p-8 border border-emerald-800/60 bg-emerald-950/25 text-center space-y-5">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                  <div className="space-y-2">
                    <Badge tone="success">Payment Automatically Confirmed</Badge>
                    <h2 className="font-serif-luxury text-2xl sm:text-3xl text-[var(--ts-text-primary)]">
                      We Received Your Exact {formatINR(exactPayableAmount, true)} Transfer
                    </h2>
                    <p className="text-xs text-[var(--ts-text-secondary)] max-w-lg mx-auto leading-relaxed">
                      Your unique paisa-encoded payment for order{' '}
                      <strong className="text-[var(--ts-text-primary)]">{activeOrder.order_number}</strong> was
                      matched and verified automatically
                      {autoMatchedUtr ? ` (UPI Ref / UTR: ${autoMatchedUtr})` : ''}. Inventory has
                      been allocated to your order.
                    </p>
                  </div>
                  <div className="pt-3 flex flex-wrap justify-center gap-4">
                    <Link
                      to={`/track-order?order=${encodeURIComponent(activeOrder.order_number)}&phone=${encodeURIComponent(phone)}`}
                    >
                      <Button variant="gold" size="md">
                        Track Confirmed Order
                      </Button>
                    </Link>
                    <Link to="/shop">
                      <Button variant="outline" size="md">
                        Continue Shopping
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : upiSubmittedSuccess ? (
                <div className="p-8 border border-[var(--ts-accent)]/40 bg-[var(--ts-bg-accent-tint)] text-center space-y-5">
                  <CheckCircle2 className="w-12 h-12 text-[var(--ts-accent)] mx-auto" />
                  <div className="space-y-2">
                    <Badge tone="gold">UTR Queued for Verification</Badge>
                    <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
                      UTR Reference Recorded
                    </h2>
                    <p className="text-xs text-[var(--ts-text-secondary)] max-w-lg mx-auto leading-relaxed">
                      Your order <strong>{activeOrder.order_number}</strong> for{' '}
                      <strong>{formatINR(exactPayableAmount, true)}</strong> and UTR reference{' '}
                      <strong className="text-[var(--ts-accent)]">{utrNumber.toUpperCase()}</strong> are
                      logged. It will confirm automatically when the bank credit alert matches or
                      upon admin review.
                    </p>
                  </div>
                  <div className="pt-4 flex flex-wrap justify-center gap-4">
                    <Link
                      to={`/track-order?order=${encodeURIComponent(activeOrder.order_number)}&phone=${encodeURIComponent(phone)}`}
                    >
                      <Button variant="gold" size="md">
                        Track Order Status
                      </Button>
                    </Link>
                    <Link to="/shop">
                      <Button variant="outline" size="md">
                        Continue Exploring
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Core Gateway-Free UPI Card (Matches demo/index.html & Code.gs UX) */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                    {/* Left: Dynamic Amount-Encoded UPI QR Code */}
                    <div className="md:col-span-5 border border-[var(--ts-accent)]/50 bg-[var(--ts-bg-elevated)] p-6 text-center space-y-4">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--ts-accent)]/15 border border-[var(--ts-accent)]/40 text-[10px] uppercase tracking-[0.2em] text-[var(--ts-accent)]">
                        <Sparkles className="w-3 h-3" />
                        <span>Personal Paisa-Encoded QR</span>
                      </div>

                      <div className="w-56 h-56 mx-auto bg-white p-3 flex items-center justify-center border border-[var(--ts-accent)]">
                        {dynamicQrDataUrl ? (
                          <img
                            src={dynamicQrDataUrl}
                            alt={`UPI QR for ${formatINR(exactPayableAmount, true)}`}
                            className="w-full h-full object-contain"
                          />
                        ) : storeSettings.upi_qr_image_url ? (
                          <img
                            src={storeSettings.upi_qr_image_url}
                            alt="TIMESSELLERS Official UPI QR"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <QrCode className="w-28 h-28 text-[var(--ts-bg-main)]" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <p className="text-[11px] text-[var(--ts-text-muted)]">
                          To <strong className="text-[var(--ts-text-primary)]">{storeSettings.upi_display_name}</strong>
                        </p>
                        <div className="border border-[var(--ts-border-strong)] bg-[var(--ts-bg-main)] p-2 flex items-center justify-between gap-2">
                          <span className="text-xs text-[var(--ts-accent)] font-mono truncate">
                            {storeSettings.upi_id}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(storeSettings.upi_id);
                              setCopiedUpi(true);
                              setTimeout(() => setCopiedUpi(false), 2000);
                            }}
                            className="text-[10px] uppercase tracking-widest text-[var(--ts-text-secondary)] hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            {copiedUpi ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedUpi ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>

                      <a href={upiDeepLink} className="block pt-1">
                        <Button variant="gold" size="md" className="w-full">
                          Pay with UPI App
                        </Button>
                      </a>
                    </div>

                    {/* Right: Paisa Order Code Explanation & Live Auto-Reconciliation Status */}
                    <div className="md:col-span-7 space-y-6">
                      <div className="border border-[var(--ts-accent)]/40 bg-[var(--ts-bg-accent-tint)] p-5 space-y-3">
                        <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--ts-accent)]">
                          Important • Pay This Exact Decimal Amount
                        </p>
                        <div className="flex items-center justify-between gap-4">
                          <span className="font-serif-luxury text-4xl text-[var(--ts-text-primary)]">
                            ₹{exactPayableAmount.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(exactPayableAmount.toFixed(2));
                              setCopiedExactAmt(true);
                              setTimeout(() => setCopiedExactAmt(false), 2000);
                            }}
                            className="px-3 py-1.5 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] text-[10px] uppercase tracking-widest text-[var(--ts-accent)] hover:border-[var(--ts-accent)] flex items-center gap-1.5 cursor-pointer"
                          >
                            {copiedExactAmt ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedExactAmt ? 'Copied' : 'Copy Amount'}</span>
                          </button>
                        </div>
                        <p className="text-xs text-[var(--ts-text-secondary)] leading-relaxed">
                          The <strong className="text-[var(--ts-accent)]">.{exactPaiseDigits} paise</strong>{' '}
                          at the end is your personal order code for today — please{' '}
                          <strong>do not round it</strong>. Scanning the QR code above pre-fills{' '}
                          <strong>₹{exactPayableAmount.toFixed(2)}</strong> automatically in Google
                          Pay, PhonePe, Paytm, and BHIM.
                        </p>
                      </div>

                      {/* Live Auto-Verification Status Indicator */}
                      <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-elevated)] p-5 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <RefreshCw
                              className={cn(
                                'w-4 h-4 text-[var(--ts-accent)] shrink-0',
                                autoPollStatus === 'checking' ? 'animate-spin' : 'animate-pulse'
                              )}
                            />
                            <div>
                              <p className="text-xs font-medium text-[var(--ts-text-primary)]">
                                Waiting for your payment — Auto-detecting bank credit
                              </p>
                              <p className="text-[11px] text-[var(--ts-text-muted)]">
                                This page checks automatically every 12 seconds and confirms itself
                                within ~1 minute of payment.
                              </p>
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void checkOrderPaymentStatus()}
                          >
                            Check Now
                          </Button>
                        </div>
                      </div>

                      {/* Expandable Manual UTR / Screenshot Fallback */}
                      <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)]">
                        <button
                          type="button"
                          onClick={() => setShowManualUtrFallback((v) => !v)}
                          className="w-full px-5 py-3.5 flex items-center justify-between text-left text-xs text-[var(--ts-text-secondary)] hover:text-[var(--ts-text-primary)] cursor-pointer"
                        >
                          <span>
                            Already paid? Submit 12-digit UTR / Receipt manually (Optional Fallback)
                          </span>
                          {showManualUtrFallback ? (
                            <ChevronUp className="w-4 h-4 text-[var(--ts-accent)]" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-[var(--ts-accent)]" />
                          )}
                        </button>

                        {showManualUtrFallback && (
                          <form
                            onSubmit={handleUpiProofSubmit}
                            className="p-5 border-t border-[var(--ts-border-subtle)] space-y-4"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <Input
                                label="12-Digit UTR / UPI Reference Number *"
                                required
                                value={utrNumber}
                                onChange={(e) => setUtrNumber(e.target.value)}
                                placeholder="e.g., 432189765412"
                              />
                              <Input
                                label="Your Payer UPI ID (Optional)"
                                value={payerUpiId}
                                onChange={(e) => setPayerUpiId(e.target.value)}
                                placeholder="yourname@okhdfcbank"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="block text-[11px] uppercase tracking-[0.18em] text-[var(--ts-text-secondary)]">
                                Upload Payment Screenshot (Optional, Max 5MB)
                              </label>
                              <label className="flex items-center justify-center gap-2 border border-dashed border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] p-3 text-xs text-[var(--ts-text-secondary)] hover:border-[var(--ts-accent)] cursor-pointer">
                                <Upload className="w-4 h-4 text-[var(--ts-accent)]" />
                                <span>
                                  {proofFile
                                    ? proofFile.name
                                    : 'Select JPEG, PNG, WEBP, or PDF Receipt'}
                                </span>
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp,application/pdf"
                                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                                  className="hidden"
                                />
                              </label>
                            </div>

                            <Input
                              label="Note for Treasury Desk (Optional)"
                              value={customerNote}
                              onChange={(e) => setCustomerNote(e.target.value)}
                            />

                            <Button
                              type="submit"
                              variant="charcoal"
                              size="md"
                              className="w-full"
                              isLoading={isSubmittingUpi}
                            >
                              Submit UTR Reference
                            </Button>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* FLOW B: CRYPTOCURRENCY PAYMENT INVOICE & WEBHOOK RECONCILIATION */}
          {activeOrder.payment_method === 'crypto' && (
            <div className="space-y-6">
              {liveOrderData?.payment_status === 'confirmed' ? (
                <div className="p-8 border border-emerald-800/60 bg-emerald-950/30 text-center space-y-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                  <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
                    Cryptocurrency Payment Confirmed via Webhook
                  </h2>
                  <p className="text-xs text-[var(--ts-text-secondary)]">
                    Transaction verified on-chain. Your order{' '}
                    <strong>{activeOrder.order_number}</strong> is now confirmed and inventory has
                    been allocated.
                  </p>
                  <Link
                    to={`/track-order?order=${encodeURIComponent(activeOrder.order_number)}&phone=${encodeURIComponent(phone)}`}
                  >
                    <Button variant="gold" size="md">
                      View Confirmed Order
                    </Button>
                  </Link>
                </div>
              ) : isGeneratingCrypto ? (
                <div className="p-12 text-center space-y-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-[var(--ts-accent)] mx-auto" />
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--ts-text-secondary)]">
                    Generating Cryptographic Provider Invoice...
                  </p>
                </div>
              ) : cryptoInvoice ? (
                <div className="border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ts-border-subtle)] pb-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-accent)]">
                        Provider: {cryptoInvoice.provider} • Invoice #{cryptoInvoice.invoice_id}
                      </p>
                      <h3 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
                        Send {cryptoInvoice.pay_amount} {cryptoInvoice.pay_currency}
                      </h3>
                    </div>
                    <Badge tone="warning">
                      <Clock className="w-3 h-3 mr-1" /> Awaiting On-Chain Webhook
                    </Badge>
                  </div>

                  {cryptoInvoice.pay_address && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
                        Deposit Address ({cryptoInvoice.pay_currency})
                      </p>
                      <div className="p-3 bg-[var(--ts-bg-main)] border border-[var(--ts-border-strong)] flex items-center justify-between gap-3">
                        <code className="text-xs text-[var(--ts-accent)] break-all">
                          {cryptoInvoice.pay_address}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(cryptoInvoice.pay_address);
                            setCopiedCryptoAddr(true);
                            setTimeout(() => setCopiedCryptoAddr(false), 2000);
                          }}
                          className="text-xs text-[var(--ts-text-secondary)] hover:text-white shrink-0 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedCryptoAddr ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                          <span>{copiedCryptoAddr ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                    {cryptoInvoice.payment_url && (
                      <a
                        href={cryptoInvoice.payment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button
                          variant="gold"
                          size="md"
                          rightIcon={<ExternalLink className="w-4 h-4" />}
                        >
                          Open Provider Checkout Invoice
                        </Button>
                      </a>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void checkOrderPaymentStatus()}
                      leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                    >
                      Check Webhook Status
                    </Button>
                  </div>

                  <p className="text-[11px] text-[var(--ts-text-muted)] leading-relaxed">
                    Note: Order confirmation happens automatically on the server as soon as our
                    Supabase Edge Function receives and verifies the provider’s HMAC-signed
                    webhook. Expires at {new Date(cryptoInvoice.expires_at).toLocaleTimeString()}.
                  </p>
                </div>
              ) : (
                <div className="border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] p-6 space-y-4">
                  <p className="text-xs text-[var(--ts-text-secondary)]">
                    Your order <strong>{activeOrder.order_number}</strong> is recorded with status{' '}
                    <strong>Pending Payment</strong>. Click below to generate or retry your
                    cryptocurrency invoice once <code>CRYPTO_PROVIDER_API_KEY</code> is configured
                    in your Supabase Edge Function secrets.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="gold"
                      size="sm"
                      onClick={async () => {
                        setError(null);
                        setIsGeneratingCrypto(true);
                        try {
                          const invRes = await createCryptoPaymentInvoice(
                            activeOrder.order_id,
                            selectedCrypto,
                            activeOrder.guest_token
                          );
                          setCryptoInvoice(invRes.invoice);
                        } catch (err) {
                          setError(
                            err instanceof Error ? err.message : 'Could not create invoice'
                          );
                        } finally {
                          setIsGeneratingCrypto(false);
                        }
                      }}
                    >
                      Generate Crypto Invoice
                    </Button>
                    <Link
                      to={`/track-order?order=${encodeURIComponent(activeOrder.order_number)}&phone=${encodeURIComponent(phone)}`}
                    >
                      <Button variant="outline" size="sm">
                        View Order Details
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // STEP 1 VIEW: ADDRESS & PAYMENT SELECTION BEFORE ORDER CREATION
  // ============================================================================
  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20">
        <EmptyState
          title="No Items in Bag for Checkout"
          description="Add creations to your shopping bag before proceeding to checkout."
          action={
            <Link to="/shop">
              <Button variant="gold" size="md">
                Return to Shop
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const subtotal = quote?.subtotal_amount ?? 0;
  const shippingCharge = quote?.shipping_amount ?? 0;
  const discountAmount = quote?.discount_amount ?? 0;
  const finalAmount = quote?.final_amount ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div className="border-b border-[var(--ts-border-subtle)] pb-6">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
          Insured Pan-India Dispatch
        </p>
        <h1 className="font-serif-luxury text-3xl sm:text-5xl text-[var(--ts-text-primary)]">
          Private Checkout
        </h1>
      </div>

      {error && <ErrorBanner message={error} />}

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Column: Customer Info, Address & Payment Method */}
        <div className="lg:col-span-7 space-y-10">
          {/* 1. Saved Address Selector */}
          {savedAddresses.length > 0 && (
            <div className="space-y-4">
              <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
                1. Select Delivery Destination
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {savedAddresses.map((addr) => (
                  <button
                    key={addr.id}
                    type="button"
                    onClick={() => handleAddressSelectChange(addr.id)}
                    className={cn(
                      'p-4 border text-left space-y-1 transition-all cursor-pointer',
                      selectedAddressId === addr.id
                        ? 'border-[var(--ts-accent)] bg-[var(--ts-bg-accent-tint)]'
                        : 'border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] hover:border-[var(--ts-border-strong)]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-accent)]">
                        {addr.label}
                      </span>
                      {addr.is_default && <Badge tone="gold">Default</Badge>}
                    </div>
                    <p className="text-xs font-medium text-[var(--ts-text-primary)]">{addr.full_name}</p>
                    <p className="text-[11px] text-[var(--ts-text-muted)] line-clamp-2">
                      {addr.house_building}, {addr.street}, {addr.city}, {addr.state} -{' '}
                      {addr.pin_code}
                    </p>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleAddressSelectChange('new')}
                  className={cn(
                    'p-4 border text-left flex flex-col justify-center items-center gap-1 transition-all cursor-pointer',
                    selectedAddressId === 'new'
                      ? 'border-[var(--ts-accent)] bg-[var(--ts-bg-accent-tint)]'
                      : 'border-dashed border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] hover:border-[var(--ts-accent)]'
                  )}
                >
                  <span className="text-xs uppercase tracking-[0.18em] text-[var(--ts-accent)]">
                    + Enter New Address
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* 2. Delivery Address Form (Pan-India) */}
          <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-6">
            <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
              Delivery Information (India)
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <Input
                label="Recipient Full Name *"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name as on ID"
              />
              <Input
                label="Mobile Phone Number *"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
              <Input
                label="Email Address (Optional)"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Input
                label="House / Flat / Building *"
                required
                value={houseBuilding}
                onChange={(e) => setHouseBuilding(e.target.value)}
                placeholder="Suite / Apartment / Villa"
              />
              <Input
                label="Street / Locality / Sector *"
                required
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Road name or area"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <Input
                label="City / District *"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g., Mumbai"
              />
              <Select
                label="State / Union Territory *"
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
                options={INDIAN_STATES.map((st) => ({ value: st, label: st }))}
              />
              <Input
                label="6-Digit PIN Code *"
                required
                maxLength={6}
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                placeholder="400013"
              />
            </div>

            <Input
              label="Landmark (Optional)"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              placeholder="Nearby prominent building or street"
            />

            {user && selectedAddressId === 'new' && (
              <label className="flex items-center gap-2.5 text-xs text-[var(--ts-text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAddressToProfile}
                  onChange={(e) => setSaveAddressToProfile(e.target.checked)}
                  className="accent-[var(--ts-accent)]"
                />
                <span>Save this address to my profile for future acquisitions</span>
              </label>
            )}
          </div>

          {/* 3. Payment Method Selection */}
          <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-6">
            <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
              Select Settlement Method
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option A: Gateway-Free UPI QR */}
              <button
                type="button"
                onClick={() => setPaymentMethod('upi_qr')}
                className={cn(
                  'p-5 border text-left space-y-2 transition-all cursor-pointer',
                  paymentMethod === 'upi_qr'
                    ? 'border-[var(--ts-accent)] bg-[var(--ts-bg-accent-tint)]'
                    : 'border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] hover:border-[var(--ts-border-strong)]'
                )}
              >
                <div className="flex items-center justify-between">
                  <QrCode className="w-5 h-5 text-[var(--ts-accent)]" />
                  <Badge tone="gold">Auto-Confirm • Zero Fee</Badge>
                </div>
                <p className="font-serif-luxury text-xl text-[var(--ts-text-primary)]">
                  Gateway-Free UPI QR
                </p>
                <p className="text-[11px] text-[var(--ts-text-muted)] leading-relaxed">
                  Get a personal UPI QR encoded with a unique paisa-level amount (with an automatic
                  micro-discount). Confirms automatically when your payment arrives.
                </p>
              </button>

              {/* Option B: Cryptocurrency */}
              <button
                type="button"
                onClick={() => setPaymentMethod('crypto')}
                className={cn(
                  'p-5 border text-left space-y-2 transition-all cursor-pointer',
                  paymentMethod === 'crypto'
                    ? 'border-[var(--ts-accent)] bg-[var(--ts-bg-accent-tint)]'
                    : 'border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] hover:border-[var(--ts-border-strong)]'
                )}
              >
                <div className="flex items-center justify-between">
                  <Coins className="w-5 h-5 text-[var(--ts-accent)]" />
                  <Badge tone="neutral">Webhook Verified</Badge>
                </div>
                <p className="font-serif-luxury text-xl text-[var(--ts-text-primary)]">Cryptocurrency</p>
                <p className="text-[11px] text-[var(--ts-text-muted)] leading-relaxed">
                  Pay via provider-generated crypto invoice with automatic HMAC-signed webhook
                  confirmation.
                </p>
              </button>
            </div>

            {paymentMethod === 'crypto' && (
              <div className="pt-2">
                <Select
                  label="Preferred Digital Asset"
                  value={selectedCrypto}
                  onChange={(e) => setSelectedCrypto(e.target.value)}
                  options={(
                    storeSettings.supported_crypto_currencies || [
                      'USDT (TRC20)',
                      'USDT (ERC20)',
                      'BTC',
                      'ETH',
                      'SOL',
                    ]
                  ).map((c) => ({ value: c, label: c }))}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Complete Price Breakdown & Confirm Button */}
        <div className="lg:col-span-5">
          <div className="border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-6 sticky top-28">
            <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)] border-b border-[var(--ts-border-subtle)] pb-4">
              Authoritative Order Summary
            </h2>

            {/* Line Items Snapshot */}
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {(quote?.items || []).map((line) => (
                <div
                  key={`${line.product_id}:${line.variant_id ?? 'base'}`}
                  className="flex items-center justify-between gap-3 text-xs border-b border-[var(--ts-bg-subtle)] pb-3"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={line.image_url}
                      alt={line.name}
                      className="w-12 h-14 object-cover bg-[var(--ts-bg-elevated)] border border-[var(--ts-border-subtle)]"
                    />
                    <div>
                      <p className="text-[var(--ts-text-primary)] font-medium">{line.name}</p>
                      {line.variant_label && (
                        <p className="text-[11px] text-[var(--ts-accent)]">{line.variant_label}</p>
                      )}
                      <p className="text-[11px] text-[var(--ts-text-muted)]">
                        Qty: {line.quantity} × {formatINR(line.unit_price)}
                      </p>
                    </div>
                  </div>
                  <span className="text-[var(--ts-text-primary)] font-medium">
                    {formatINR(line.line_total)}
                  </span>
                </div>
              ))}
            </div>

            {/* Price Breakdown */}
            <div className="space-y-3 text-xs pt-2">
              <div className="flex justify-between text-[var(--ts-text-secondary)]">
                <span>Items Subtotal</span>
                <span className="text-[var(--ts-text-primary)]">{formatINR(subtotal)}</span>
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Product Discount Savings</span>
                  <span>-{formatINR(discountAmount)}</span>
                </div>
              )}

              <div className="flex justify-between text-[var(--ts-text-secondary)]">
                <span>
                  Pan-India Insured Shipping (Free above{' '}
                  {formatINR(shippingSettings.free_shipping_threshold)})
                </span>
                <span className="text-[var(--ts-text-primary)]">
                  {shippingCharge === 0 ? (
                    <span className="text-emerald-400 uppercase">FREE</span>
                  ) : (
                    formatINR(shippingCharge)
                  )}
                </span>
              </div>

              <div className="border-t border-[var(--ts-border-subtle)] pt-4 flex justify-between items-baseline">
                <span className="text-xs uppercase tracking-[0.2em] text-[var(--ts-text-primary)]">
                  Order Total
                </span>
                <span className="font-serif-luxury text-3xl text-[var(--ts-accent)]">
                  {formatINR(finalAmount)}
                </span>
              </div>

              {paymentMethod === 'upi_qr' && (
                <p className="text-[11px] text-[var(--ts-text-muted)] leading-relaxed">
                  On clicking below, your personal UPI QR will be generated with a unique paisa-level
                  amount at or slightly below {formatINR(finalAmount)} for instant gateway-free
                  reconciliation.
                </p>
              )}
            </div>

            <Button
              type="submit"
              variant="gold"
              size="lg"
              className="w-full"
              disabled={quoteLoading}
              isLoading={isPlacingOrder}
            >
              {paymentMethod === 'upi_qr'
                ? 'Get My Personal UPI Payment QR'
                : 'Place Order & Generate Crypto Invoice'}
            </Button>

            <div className="pt-4 border-t border-[var(--ts-border-subtle)] space-y-2 text-[11px] text-[var(--ts-text-muted)]">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-[var(--ts-accent)] shrink-0 mt-0.5" />
                <span>
                  All prices, unique paisa codes, and shipping charges are calculated and enforced
                  on the Supabase PostgreSQL server. Inventory is deducted only upon verified
                  payment confirmation.
                </span>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
