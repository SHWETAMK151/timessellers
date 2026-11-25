// ==============================================================================
// TIMESSELLERS — LEGAL & TRUST PAGES
// About Us, Contact Us, Shipping Policy, Return & Refund Policy, Privacy Policy,
// Terms & Conditions. Clearly communicates authenticity, condition & warranties
// without unsupported third-party brand-affiliation claims.
// ==============================================================================

import React, { useState } from 'react';
import { ShieldCheck, Mail, Phone, MapPin, CheckCircle2, Instagram, MessageCircle } from 'lucide-react';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { formatINR } from '@/lib/utils';
import { Button, Input } from '@/components/ui/LuxuryPrimitives';

export const AboutPage: React.FC = () => {
  const { storeSettings } = useStoreSettings();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-12">
      <div className="space-y-3 border-b border-[var(--ts-border-subtle)] pb-8">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
          The Maison &amp; Philosophy
        </p>
        <h1 className="font-serif-luxury text-4xl sm:text-5xl text-[var(--ts-text-primary)]">
          About {storeSettings.store_name || 'TIMESSELLERS'}
        </h1>
      </div>

      <div className="space-y-6 text-sm text-[var(--ts-text-secondary)] leading-relaxed">
        {storeSettings.about_story ? (
          <p className="whitespace-pre-line">{storeSettings.about_story}</p>
        ) : (
          <>
            <p>
              Founded with an uncompromising commitment to design purity and material excellence,{' '}
              <strong className="text-[var(--ts-text-primary)]">TIMESSELLERS</strong> is an independent luxury
              e-commerce platform serving discerning collectors and patrons across India.
            </p>
            <p>
              Our catalogue spans ten specialized departments: Goggles &amp; Eyewear, Men’s Purses,
              Ladies’ Purses, Men’s Watches, Ladies’ Watches, Fine Perfumes, Artisan Shoes,
              Audiophile Headphones, Connected Smartwatches, and Executive Electronics.
            </p>
          </>
        )}

        <div className="border border-[var(--ts-border-strong)] bg-[var(--ts-bg-card)] p-8 space-y-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-[var(--ts-accent)]" />
            <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
              Product Provenance, Condition &amp; Warranty Disclosure
            </h2>
          </div>
          <p className="text-xs text-[var(--ts-text-secondary)] leading-relaxed">
            Every product offered on TIMESSELLERS is inspected in our quality assurance facility
            prior to listing and dispatch. All items are supplied in brand-new condition unless
            explicitly designated otherwise on the individual product dossier.
          </p>
          <p className="text-xs text-[var(--ts-text-secondary)] leading-relaxed">
            <strong>Independent Retail Disclosure:</strong> TIMESSELLERS operates as an independent
            luxury retailer. Unless explicitly stated on a specific product’s specification sheet,
            TIMESSELLERS does not claim corporate affiliation, endorsement, or authorized
            dealership status with third-party trademark owners. Any third-party brand names or
            trademarks referenced in product listings are used strictly for accurate product
            identification. All creations carry the applicable warranty specified on their
            individual product specification dossier.
          </p>
        </div>
      </div>
    </div>
  );
};

export const ContactPage: React.FC = () => {
  const { storeSettings } = useStoreSettings();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [hpField, setHpField] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hpField.trim().length > 0) return;
    if (!name.trim() || !message.trim()) return;
    setSubmitted(true);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 space-y-12">
      <div className="space-y-3 border-b border-[var(--ts-border-subtle)] pb-8">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
          Client Relations
        </p>
        <h1 className="font-serif-luxury text-4xl sm:text-5xl text-[var(--ts-text-primary)]">
          Contact Our Concierge Desk
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5 space-y-6">
          <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Phone className="w-4 h-4 text-[var(--ts-accent)] shrink-0 mt-1" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
                  WhatsApp &amp; Telephone
                </p>
                <a
                  href={`https://wa.me/${(storeSettings.contact_phone || '').replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--ts-text-primary)] hover:text-[var(--ts-accent)] transition-colors"
                >
                  {storeSettings.contact_phone}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-[var(--ts-accent)] shrink-0 mt-1" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
                  Electronic Mail
                </p>
                <a
                  href={`mailto:${storeSettings.contact_email}`}
                  className="text-sm text-[var(--ts-text-primary)] hover:text-[var(--ts-accent)] transition-colors break-all"
                >
                  {storeSettings.contact_email}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Instagram className="w-4 h-4 text-[var(--ts-accent)] shrink-0 mt-1" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
                  Instagram
                </p>
                <a
                  href={`https://www.instagram.com/${(storeSettings.instagram_handle || 'timeseller.in').replace(/^@/, '')}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--ts-text-primary)] hover:text-[var(--ts-accent)] transition-colors"
                >
                  {storeSettings.instagram_handle || '@timeseller.in'}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-[var(--ts-accent)] shrink-0 mt-1" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ts-text-muted)]">
                  Corporate Office
                </p>
                <p className="text-xs text-[var(--ts-text-secondary)] leading-relaxed">
                  {storeSettings.contact_address}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--ts-border-subtle)] grid grid-cols-2 gap-2.5">
              <a
                href={`tel:${(storeSettings.contact_phone || '').replace(/[^\d+]/g, '')}`}
                className="flex items-center justify-center gap-2 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] px-3 py-2.5 text-[10px] uppercase tracking-[0.16em] text-[var(--ts-text-primary)] hover:border-[var(--ts-accent)] hover:text-[var(--ts-accent)] transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-[var(--ts-accent)]" />
                <span>Call Now</span>
              </a>
              <a
                href={`https://wa.me/${(storeSettings.contact_phone || '').replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] px-3 py-2.5 text-[10px] uppercase tracking-[0.16em] text-[var(--ts-text-primary)] hover:border-[var(--ts-accent)] hover:text-[var(--ts-accent)] transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5 text-[var(--ts-accent)]" />
                <span>WhatsApp</span>
              </a>
              <a
                href={`mailto:${storeSettings.contact_email}`}
                className="flex items-center justify-center gap-2 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] px-3 py-2.5 text-[10px] uppercase tracking-[0.16em] text-[var(--ts-text-primary)] hover:border-[var(--ts-accent)] hover:text-[var(--ts-accent)] transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-[var(--ts-accent)]" />
                <span>Email Us</span>
              </a>
              <a
                href={`https://www.instagram.com/${(storeSettings.instagram_handle || 'timeseller.in').replace(/^@/, '')}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] px-3 py-2.5 text-[10px] uppercase tracking-[0.16em] text-[var(--ts-text-primary)] hover:border-[var(--ts-accent)] hover:text-[var(--ts-accent)] transition-colors"
              >
                <Instagram className="w-3.5 h-3.5 text-[var(--ts-accent)]" />
                <span>Instagram</span>
              </a>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 sm:p-8">
          {submitted ? (
            <div className="py-12 text-center space-y-4">
              <CheckCircle2 className="w-10 h-10 text-[var(--ts-accent)] mx-auto" />
              <h3 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
                Inquiry Logged with Concierge
              </h3>
              <p className="text-xs text-[var(--ts-text-secondary)]">
                Thank you, {name}. Our client relations specialist will respond within 24 business
                hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <input
                type="text"
                name="company_website"
                value={hpField}
                onChange={(e) => setHpField(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="sr-only"
              />
              <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
                Dispatch a Private Inquiry
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Full Name *"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Input
                  label="Email Address *"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Input
                label="Order Reference / Subject *"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
              <div className="space-y-1.5">
                <label className="block text-[11px] uppercase tracking-[0.18em] text-[var(--ts-text-secondary)]">
                  Message *
                </label>
                <textarea
                  rows={4}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-[var(--ts-bg-card)] border border-[var(--ts-border-strong)] p-4 text-sm text-[var(--ts-text-primary)] focus:outline-none focus:border-[var(--ts-accent)]"
                />
              </div>
              <Button type="submit" variant="gold" size="md">
                Send Inquiry
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export const ShippingPolicyPage: React.FC = () => {
  const { storeSettings, shippingSettings } = useStoreSettings();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-8">
      <div className="space-y-2 border-b border-[var(--ts-border-subtle)] pb-6">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
          Logistics &amp; Transit
        </p>
        <h1 className="font-serif-luxury text-4xl text-[var(--ts-text-primary)]">
          Shipping &amp; Delivery Policy
        </h1>
      </div>

      <div className="space-y-6 text-xs sm:text-sm text-[var(--ts-text-secondary)] leading-relaxed">
        {storeSettings.shipping_policy_text ? (
          <p className="whitespace-pre-line">{storeSettings.shipping_policy_text}</p>
        ) : (
          <>
            <p>
              <strong>1. Pan-India Coverage:</strong> TIMESSELLERS delivers to all serviceable
              6-digit PIN codes across all Indian States and Union Territories via insured courier
              partners.
            </p>
            <p>
              <strong>2. Shipping Charges &amp; Complimentary Threshold:</strong> Orders with a
              product subtotal of{' '}
              <strong className="text-[var(--ts-accent)]">
                {formatINR(shippingSettings.free_shipping_threshold)} or above
              </strong>{' '}
              receive complimentary insured delivery. Orders below{' '}
              {formatINR(shippingSettings.free_shipping_threshold)} incur a standard flat shipping
              fee of {formatINR(shippingSettings.standard_shipping_charge)}.
            </p>
            <p>
              <strong>3. Dispatch &amp; Transit Timelines:</strong> Orders are processed and
              dispatched only after payment confirmation (either manual UPI UTR verification by our
              treasury desk or verified cryptocurrency webhook confirmation). Standard transit takes{' '}
              {shippingSettings.estimated_delivery_days_min} to{' '}
              {shippingSettings.estimated_delivery_days_max} business days depending on destination
              PIN code.
            </p>
            <p>
              <strong>4. Real-Time Tracking:</strong> Once dispatched, your AWB tracking number and
              courier partner details are published directly in your Client Account Order Tracking
              timeline.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export const ReturnPolicyPage: React.FC = () => {
  const { storeSettings } = useStoreSettings();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-8">
      <div className="space-y-2 border-b border-[var(--ts-border-subtle)] pb-6">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
          Client Assurance
        </p>
        <h1 className="font-serif-luxury text-4xl text-[var(--ts-text-primary)]">
          Return, Exchange &amp; Refund Policy
        </h1>
      </div>

      <div className="space-y-6 text-xs sm:text-sm text-[var(--ts-text-secondary)] leading-relaxed">
        {storeSettings.return_policy_text ? (
          <p className="whitespace-pre-line">{storeSettings.return_policy_text}</p>
        ) : (
          <>
            <p>
              <strong>1. 7-Day Inspection Window:</strong> Eligible creations may be requested for
              return or replacement within 7 calendar days of recorded delivery if the item arrives
              damaged, defective, or materially different from its technical specification dossier.
            </p>
            <p>
              <strong>2. Return Eligibility Conditions:</strong> Items must be unused, unworn, with
              all original protective seals, security tags, certificates, and luxury packaging
              intact. Opened perfumes and personalized items are non-returnable for hygiene and
              bespoke reasons unless damaged in transit.
            </p>
            <p>
              <strong>3. Refund Processing &amp; Inventory Restoration:</strong> Upon receipt and
              quality inspection of the returned piece, our administrative team processes the
              refund. Approved refunds are recorded in your Order History and returned via your
              original settlement channel within 5–7 business days.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export const PrivacyPolicyPage: React.FC = () => {
  const { storeSettings } = useStoreSettings();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-8">
      <div className="space-y-2 border-b border-[var(--ts-border-subtle)] pb-6">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
          Data Protection • Effective {new Date().getFullYear()}
        </p>
        <h1 className="font-serif-luxury text-4xl text-[var(--ts-text-primary)]">
          Privacy Policy
        </h1>
      </div>

      <div className="space-y-6 text-xs sm:text-sm text-[var(--ts-text-secondary)] leading-relaxed">
        {storeSettings.privacy_policy_text ? (
          <p className="whitespace-pre-line">{storeSettings.privacy_policy_text}</p>
        ) : (
          <>
            <p>
              <strong>1. Information We Collect:</strong> When you place an order on{' '}
              <strong>{storeSettings.store_name || 'TIMESSELLERS'}</strong>, we collect your full
              name, mobile phone number, optional email address, Indian delivery address (including
              PIN code), and payment confirmation details (such as your uploaded UPI payment
              screenshot or cryptocurrency transaction reference) strictly to process, verify, and
              deliver your order.
            </p>
            <p>
              <strong>2. How We Use Your Data:</strong> Your contact and address details are used
              solely for order verification, insured courier dispatch, order tracking lookups, and
              customer support via{' '}
              <a
                href={`mailto:${storeSettings.contact_email}`}
                className="text-[var(--ts-accent)] hover:underline"
              >
                {storeSettings.contact_email}
              </a>{' '}
              or{' '}
              <a
                href={`tel:${(storeSettings.contact_phone || '').replace(/[^\d+]/g, '')}`}
                className="text-[var(--ts-accent)] hover:underline"
              >
                {storeSettings.contact_phone}
              </a>
              . We never sell, rent, or trade your personal information to third-party marketers.
            </p>
            <p>
              <strong>3. Payment Proof &amp; Storage Security:</strong> Uploaded UPI payment
              screenshots are stored in a private, access-controlled Supabase Storage bucket
              accessible only to authorized store administrators for manual payment verification.
              All database records are protected by PostgreSQL Row Level Security (RLS).
            </p>
            <p>
              <strong>4. Zero Credential Exposure:</strong> We never collect or store your UPI PIN,
              bank passwords, card CVVs, or private cryptocurrency wallet seeds.
            </p>
            <p>
              <strong>5. Data Deletion &amp; Contact:</strong> To request correction or deletion of
              your order contact data, write to{' '}
              <a
                href={`mailto:${storeSettings.contact_email}`}
                className="text-[var(--ts-accent)] hover:underline"
              >
                {storeSettings.contact_email}
              </a>{' '}
              with your Order Number.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export const TermsPage: React.FC = () => {
  const { storeSettings } = useStoreSettings();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-8">
      <div className="space-y-2 border-b border-[var(--ts-border-subtle)] pb-6">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--ts-accent)]">
          Governing Conditions • Effective {new Date().getFullYear()}
        </p>
        <h1 className="font-serif-luxury text-4xl text-[var(--ts-text-primary)]">
          Terms of Service &amp; Conditions
        </h1>
      </div>

      <div className="space-y-6 text-xs sm:text-sm text-[var(--ts-text-secondary)] leading-relaxed">
        {storeSettings.terms_text ? (
          <p className="whitespace-pre-line">{storeSettings.terms_text}</p>
        ) : (
          <>
            <p>
              <strong>1. Acceptance of Terms:</strong> By accessing or placing an order on{' '}
              <strong>{storeSettings.store_name || 'TIMESSELLERS'}</strong>, you agree to be bound
              by these Terms of Service, our Shipping Policy, Return &amp; Refund Policy, and
              Privacy Policy.
            </p>
            <p>
              <strong>2. Server-Authoritative Pricing &amp; Availability:</strong> All product
              prices, discounts, and shipping charges are calculated server-side in Indian Rupees
              (INR). Any attempt to alter prices or quantities client-side is automatically rejected.
              Orders are subject to live stock availability.
            </p>
            <p>
              <strong>3. UPI Screenshot Verification &amp; Order Confirmation:</strong> When paying
              via UPI QR, uploading your payment screenshot places your order into{' '}
              <em>Payment Verification</em> status. An order is confirmed and scheduled for dispatch
              only after our team manually verifies receipt of funds (or after cryptographic webhook
              confirmation for cryptocurrency payments). Submitting falsified or duplicate payment
              proofs will result in immediate order cancellation.
            </p>
            <p>
              <strong>4. Shipping, Risk &amp; Returns:</strong> Insured delivery is dispatched across
              serviceable Indian PIN codes. Eligible returns must follow our 7-day inspection window
              and retain all original seals, tags, and packaging.
            </p>
            <p>
              <strong>5. Limitation of Liability &amp; Governing Law:</strong> These Terms are
              governed by the laws of India. For any dispute or support query, please reach out to{' '}
              <a
                href={`mailto:${storeSettings.contact_email}`}
                className="text-[var(--ts-accent)] hover:underline"
              >
                {storeSettings.contact_email}
              </a>{' '}
              or{' '}
              <a
                href={`tel:${(storeSettings.contact_phone || '').replace(/[^\d+]/g, '')}`}
                className="text-[var(--ts-accent)] hover:underline"
              >
                {storeSettings.contact_phone}
              </a>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
};
