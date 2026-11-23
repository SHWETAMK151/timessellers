// ==============================================================================
// TIMESSELLERS — CUSTOMER PROFILE, SAVED ADDRESSES & WISHLIST PAGES
// (/account/profile, /account/addresses, /account/wishlist)
// ==============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Upload,
  CheckCircle2,
  MapPin,
  Plus,
  Trash2,
  Edit3,
  Heart,
  Star,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { uploadFileToStorage } from '@/services/storageService';
import {
  formatDate,
  INDIAN_STATES,
  isValidIndianPhone,
  isValidIndianPinCode,
  normalizeIndianPhone,
} from '@/lib/utils';
import { ProductCard } from '@/components/product/ProductCard';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  Select,
} from '@/components/ui/LuxuryPrimitives';
import type { Address } from '@/types/database';

// ==============================================================================
// 1. MY PROFILE PAGE (/account/profile)
// ==============================================================================
export const CustomerProfilePage: React.FC = () => {
  const { user, profile, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setEmail(profile.email || '');
      setAvatarUrl(profile.avatar_url || '');
    }
  }, [profile]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setError(null);
    setIsUploading(true);
    try {
      const uploaded = await uploadFileToStorage('avatars', file, user.id);
      setAvatarUrl(uploaded.url);
      await updateProfile({ avatar_url: uploaded.url });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload profile photo');
    } finally {
      setIsUploading(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({
        full_name: fullName.trim(),
        email: email.trim() || null,
        avatar_url: avatarUrl || null,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-[var(--ts-border-subtle)] pb-4">
        <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--ts-accent)]">
          Personal Identity
        </p>
        <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">My Profile</h1>
      </div>

      {error && <ErrorBanner message={error} />}
      {savedSuccess && (
        <div className="p-4 border border-emerald-800/60 bg-emerald-950/30 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>Your profile details have been updated.</span>
        </div>
      )}

      <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-8">
        {/* Avatar Upload */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-6 border-b border-[var(--ts-border-subtle)] pb-6">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName}
              className="w-20 h-20 object-cover border border-[var(--ts-accent)]"
            />
          ) : (
            <div className="w-20 h-20 bg-[var(--ts-bg-elevated)] border border-[var(--ts-border-strong)] flex items-center justify-center font-serif-luxury text-3xl text-[var(--ts-accent)]">
              {(fullName || 'C').charAt(0).toUpperCase()}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs text-[var(--ts-text-primary)] font-medium">Profile Portrait</p>
            <p className="text-[11px] text-[var(--ts-text-muted)]">
              Upload a JPEG, PNG, or WEBP portrait (Max 2MB). Stored securely in Supabase Storage.
            </p>
            <label className="inline-flex items-center gap-2 border border-[var(--ts-border-strong)] bg-[var(--ts-bg-elevated)] px-4 py-2 text-xs uppercase tracking-[0.16em] text-[var(--ts-accent)] hover:border-[var(--ts-accent)] cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>{isUploading ? 'Uploading...' : 'Change Portrait'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarUpload}
                disabled={isUploading}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Profile Form */}
        <form onSubmit={handleProfileSave} className="space-y-5 max-w-xl">
          <Input
            label="Full Name *"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
          />

          <Input
            label="Verified Phone Number (Primary Identity)"
            value={profile?.phone || user?.phone || ''}
            disabled
            hint="Authenticated via SMS OTP. Phone number is bound to your cryptographic session."
          />

          <Input
            label="Email Address (Optional)"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
          />

          <div className="text-[11px] text-[var(--ts-text-muted)]">
            Account Created: {formatDate(profile?.created_at, true)}
          </div>

          <Button type="submit" variant="gold" size="md" isLoading={isSaving}>
            Save Profile Changes
          </Button>
        </form>
      </div>
    </div>
  );
};

// ==============================================================================
// 2. MY ADDRESSES PAGE (/account/addresses)
// ==============================================================================
export const CustomerAddressesPage: React.FC = () => {
  const { user, profile } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [label, setLabel] = useState('Home');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [houseBuilding, setHouseBuilding] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState<string>('Maharashtra');
  const [pinCode, setPinCode] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadAddresses = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data, error: fetchErr } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      setAddresses((data ?? []) as Address[]);
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    void loadAddresses();
  }, [loadAddresses]);

  const openNewAddressForm = () => {
    setEditingId(null);
    setLabel('Residence');
    setFullName(profile?.full_name || '');
    setPhone(profile?.phone || '');
    setHouseBuilding('');
    setStreet('');
    setLandmark('');
    setCity('');
    setStateName('Maharashtra');
    setPinCode('');
    setIsDefault(addresses.length === 0);
    setShowForm(true);
  };

  const openEditAddressForm = (addr: Address) => {
    setEditingId(addr.id);
    setLabel(addr.label);
    setFullName(addr.full_name);
    setPhone(addr.phone);
    setHouseBuilding(addr.house_building);
    setStreet(addr.street);
    setLandmark(addr.landmark || '');
    setCity(addr.city);
    setStateName(addr.state);
    setPinCode(addr.pin_code);
    setIsDefault(addr.is_default);
    setShowForm(true);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);

    if (!isValidIndianPhone(phone)) {
      setError('Please enter a valid 10-digit Indian phone number.');
      return;
    }
    if (!isValidIndianPinCode(pinCode)) {
      setError('Please enter a valid 6-digit Indian PIN code.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        user_id: user.id,
        label: label.trim() || 'Home',
        full_name: fullName.trim(),
        phone: normalizeIndianPhone(phone),
        house_building: houseBuilding.trim(),
        street: street.trim(),
        landmark: landmark.trim() || null,
        city: city.trim(),
        state: stateName,
        pin_code: pinCode.trim(),
        country: 'India',
        is_default: isDefault,
      };

      if (editingId) {
        const { error: updErr } = await supabase
          .from('addresses')
          .update(payload)
          .eq('id', editingId)
          .eq('user_id', user.id);
        if (updErr) throw new Error(updErr.message);
      } else {
        const { error: insErr } = await supabase.from('addresses').insert(payload);
        if (insErr) throw new Error(insErr.message);
      }

      setShowForm(false);
      await loadAddresses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save address');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefault = async (addressId: string) => {
    if (!user) return;
    await supabase
      .from('addresses')
      .update({ is_default: true })
      .eq('id', addressId)
      .eq('user_id', user.id);
    await loadAddresses();
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!user) return;
    await supabase.from('addresses').delete().eq('id', addressId).eq('user_id', user.id);
    await loadAddresses();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ts-border-subtle)] pb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--ts-accent)]">
            Pan-India Delivery Destinations
          </p>
          <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">Saved Addresses</h1>
        </div>
        <Button
          variant="gold"
          size="sm"
          onClick={openNewAddressForm}
          leftIcon={<Plus className="w-3.5 h-3.5" />}
        >
          Add New Address
        </Button>
      </div>

      {error && <ErrorBanner message={error} />}

      {showForm && (
        <form
          onSubmit={handleSaveAddress}
          className="border border-[var(--ts-accent)]/40 bg-[var(--ts-bg-card)] p-6 sm:p-8 space-y-5"
        >
          <h2 className="font-serif-luxury text-2xl text-[var(--ts-text-primary)]">
            {editingId ? 'Edit Delivery Address' : 'Add New Delivery Address'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Address Label *"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Home / Office / Atelier"
            />
            <Input
              label="Recipient Full Name *"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <Input
              label="Phone Number *"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="House / Flat / Building *"
              required
              value={houseBuilding}
              onChange={(e) => setHouseBuilding(e.target.value)}
            />
            <Input
              label="Street / Area *"
              required
              value={street}
              onChange={(e) => setStreet(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="City *"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
            <Select
              label="State *"
              value={stateName}
              onChange={(e) => setStateName(e.target.value)}
              options={INDIAN_STATES.map((s) => ({ value: s, label: s }))}
            />
            <Input
              label="6-Digit PIN Code *"
              required
              maxLength={6}
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          <Input
            label="Landmark (Optional)"
            value={landmark}
            onChange={(e) => setLandmark(e.target.value)}
          />

          <label className="flex items-center gap-2.5 text-xs text-[var(--ts-text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="accent-[var(--ts-accent)]"
            />
            <span>Set as my default delivery address</span>
          </label>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" variant="gold" size="md" isLoading={isSaving}>
              Save Address
            </Button>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-12 text-center text-xs text-[var(--ts-text-muted)]">
          Loading saved addresses...
        </div>
      ) : addresses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className="border border-[var(--ts-border-subtle)] bg-[var(--ts-bg-card)] p-6 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--ts-accent)]">
                    {addr.label}
                  </span>
                  {addr.is_default && <Badge tone="gold">Default</Badge>}
                </div>
                <p className="text-sm font-medium text-[var(--ts-text-primary)]">{addr.full_name}</p>
                <p className="text-[var(--ts-text-secondary)]">{addr.phone}</p>
                <p className="text-[var(--ts-text-secondary)]">
                  {addr.house_building}, {addr.street}
                </p>
                {addr.landmark && <p className="text-[var(--ts-text-muted)]">Landmark: {addr.landmark}</p>}
                <p className="text-[var(--ts-text-secondary)]">
                  {addr.city}, {addr.state} -{' '}
                  <strong className="text-[var(--ts-text-primary)]">{addr.pin_code}</strong>
                </p>
              </div>

              <div className="pt-4 border-t border-[var(--ts-border-subtle)] flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openEditAddressForm(addr)}
                    className="inline-flex items-center gap-1 text-[var(--ts-text-secondary)] hover:text-[var(--ts-accent)] cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteAddress(addr.id)}
                    className="inline-flex items-center gap-1 text-[var(--ts-text-muted)] hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>

                {!addr.is_default && (
                  <button
                    type="button"
                    onClick={() => void handleSetDefault(addr.id)}
                    className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-[var(--ts-accent)] hover:underline cursor-pointer"
                  >
                    <Star className="w-3 h-3" />
                    <span>Set Default</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No Saved Addresses"
          description="Save your primary Indian residence or office address for faster checkout."
          icon={<MapPin className="w-5 h-5" />}
          action={
            <Button variant="gold" size="sm" onClick={openNewAddressForm}>
              Add First Address
            </Button>
          }
        />
      )}
    </div>
  );
};

// ==============================================================================
// 3. WISHLIST PAGE (/account/wishlist)
// ==============================================================================
export const CustomerWishlistPage: React.FC = () => {
  const { wishlistProducts } = useCart();

  return (
    <div className="space-y-8">
      <div className="border-b border-[var(--ts-border-subtle)] pb-4">
        <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--ts-accent)]">
          Curated Favorites
        </p>
        <h1 className="font-serif-luxury text-3xl text-[var(--ts-text-primary)]">
          My Wishlist ({wishlistProducts.length})
        </h1>
      </div>

      {wishlistProducts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {wishlistProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Your Wishlist is Empty"
          description="Tap the heart emblem on any timepiece, purse, fragrance, or object to bookmark it here."
          icon={<Heart className="w-5 h-5" />}
          action={
            <Link to="/shop">
              <Button variant="gold" size="sm">
                Explore Collections
              </Button>
            </Link>
          }
        />
      )}
    </div>
  );
};
