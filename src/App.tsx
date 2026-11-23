// ==============================================================================
// TIMESSELLERS — APPLICATION ROUTER & ROOT COMPONENT
// Connects all three experiences:
// A. Public Customer Storefront (/, /shop, /shop/:category, /product/:slug, /cart, /login, Legal)
// B. Authenticated Customer Dashboard (/checkout, /account, /account/orders, /account/orders/:id, /account/profile, /account/addresses, /account/wishlist)
// C. Restricted Administrative Dashboard (/admin, /admin/products, /admin/categories, /admin/orders, /admin/payments, /admin/inventory, /admin/customers, /admin/analytics, /admin/settings)
// ==============================================================================

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { StoreSettingsProvider } from '@/context/StoreSettingsContext';
import {
  ProtectedCustomerRoute,
  ProtectedAdminRoute,
} from '@/components/auth/RouteGuards';
import { StorefrontLayout } from '@/components/layout/StorefrontLayout';
import { Button } from '@/components/ui/LuxuryPrimitives';

// Lazy-loaded route modules for performance & optimal bundle splitting
const LandingPage = lazy(() =>
  import('@/pages/storefront/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const ShopPage = lazy(() =>
  import('@/pages/storefront/ShopPage').then((m) => ({ default: m.ShopPage }))
);
const ProductDetailPage = lazy(() =>
  import('@/pages/storefront/ProductDetailPage').then((m) => ({
    default: m.ProductDetailPage,
  }))
);
const CartPage = lazy(() =>
  import('@/pages/storefront/CartPage').then((m) => ({ default: m.CartPage }))
);
const CheckoutPage = lazy(() =>
  import('@/pages/storefront/CheckoutPage').then((m) => ({ default: m.CheckoutPage }))
);
const TrackOrderPage = lazy(() =>
  import('@/pages/storefront/TrackOrderPage').then((m) => ({ default: m.TrackOrderPage }))
);
const LoginPage = lazy(() =>
  import('@/pages/storefront/LoginPage').then((m) => ({ default: m.LoginPage }))
);
const AboutPage = lazy(() =>
  import('@/pages/storefront/LegalPages').then((m) => ({ default: m.AboutPage }))
);
const ContactPage = lazy(() =>
  import('@/pages/storefront/LegalPages').then((m) => ({ default: m.ContactPage }))
);
const ShippingPolicyPage = lazy(() =>
  import('@/pages/storefront/LegalPages').then((m) => ({ default: m.ShippingPolicyPage }))
);
const ReturnPolicyPage = lazy(() =>
  import('@/pages/storefront/LegalPages').then((m) => ({ default: m.ReturnPolicyPage }))
);
const PrivacyPolicyPage = lazy(() =>
  import('@/pages/storefront/LegalPages').then((m) => ({ default: m.PrivacyPolicyPage }))
);
const TermsPage = lazy(() =>
  import('@/pages/storefront/LegalPages').then((m) => ({ default: m.TermsPage }))
);

// Customer Account Routes
const AccountLayout = lazy(() =>
  import('@/pages/account/AccountOverviewPage').then((m) => ({ default: m.AccountLayout }))
);
const AccountOverviewPage = lazy(() =>
  import('@/pages/account/AccountOverviewPage').then((m) => ({
    default: m.AccountOverviewPage,
  }))
);
const CustomerOrdersPage = lazy(() =>
  import('@/pages/account/CustomerOrdersPage').then((m) => ({
    default: m.CustomerOrdersPage,
  }))
);
const OrderTrackingPage = lazy(() =>
  import('@/pages/account/CustomerOrdersPage').then((m) => ({
    default: m.OrderTrackingPage,
  }))
);
const CustomerProfilePage = lazy(() =>
  import('@/pages/account/CustomerProfileAndAddressesPage').then((m) => ({
    default: m.CustomerProfilePage,
  }))
);
const CustomerAddressesPage = lazy(() =>
  import('@/pages/account/CustomerProfileAndAddressesPage').then((m) => ({
    default: m.CustomerAddressesPage,
  }))
);
const CustomerWishlistPage = lazy(() =>
  import('@/pages/account/CustomerProfileAndAddressesPage').then((m) => ({
    default: m.CustomerWishlistPage,
  }))
);

// Administrative Routes
const AdminLoginPage = lazy(() =>
  import('@/pages/admin/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage }))
);
const AdminLayout = lazy(() =>
  import('@/pages/admin/AdminOverviewPage').then((m) => ({ default: m.AdminLayout }))
);
const AdminOverviewPage = lazy(() =>
  import('@/pages/admin/AdminOverviewPage').then((m) => ({ default: m.AdminOverviewPage }))
);
const AdminProductsPage = lazy(() =>
  import('@/pages/admin/AdminProductsAndCategoriesPage').then((m) => ({
    default: m.AdminProductsPage,
  }))
);
const AdminCategoriesPage = lazy(() =>
  import('@/pages/admin/AdminProductsAndCategoriesPage').then((m) => ({
    default: m.AdminCategoriesPage,
  }))
);
const AdminOrdersPage = lazy(() =>
  import('@/pages/admin/AdminOrdersAndPaymentsPage').then((m) => ({
    default: m.AdminOrdersPage,
  }))
);
const AdminPaymentsPage = lazy(() =>
  import('@/pages/admin/AdminOrdersAndPaymentsPage').then((m) => ({
    default: m.AdminPaymentsPage,
  }))
);
const AdminInventoryPage = lazy(() =>
  import('@/pages/admin/AdminInventoryCustomersSettingsPage').then((m) => ({
    default: m.AdminInventoryPage,
  }))
);
const AdminCustomersPage = lazy(() =>
  import('@/pages/admin/AdminInventoryCustomersSettingsPage').then((m) => ({
    default: m.AdminCustomersPage,
  }))
);
const AdminAnalyticsPage = lazy(() =>
  import('@/pages/admin/AdminInventoryCustomersSettingsPage').then((m) => ({
    default: m.AdminAnalyticsPage,
  }))
);
const AdminSettingsPage = lazy(() =>
  import('@/pages/admin/AdminInventoryCustomersSettingsPage').then((m) => ({
    default: m.AdminSettingsPage,
  }))
);

const PageLoader: React.FC = () => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
    <Loader2 className="w-6 h-6 animate-spin text-[var(--ts-accent)]" />
    <span className="text-[10px] uppercase tracking-[0.26em] text-[var(--ts-text-muted)]">
      TIMESSELLERS
    </span>
  </div>
);

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <StoreSettingsProvider>
        <AuthProvider>
          <CartProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* EXPERIENCE A & B: PUBLIC STOREFRONT & PROTECTED CUSTOMER DASHBOARD */}
                <Route element={<StorefrontLayout />}>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/shop" element={<ShopPage />} />
                  <Route path="/shop/:category" element={<ShopPage />} />
                  <Route path="/product/:slug" element={<ProductDetailPage />} />
                  <Route path="/cart" element={<CartPage />} />
                  <Route path="/checkout" element={<CheckoutPage />} />
                  <Route path="/track-order" element={<TrackOrderPage />} />
                  <Route path="/login" element={<LoginPage />} />

                  {/* Legal & Trust Pages */}
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/contact" element={<ContactPage />} />
                  <Route path="/shipping-policy" element={<ShippingPolicyPage />} />
                  <Route path="/return-policy" element={<ReturnPolicyPage />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                  <Route path="/terms" element={<TermsPage />} />

                  {/* Protected Customer Dashboard */}
                  <Route
                    path="/account"
                    element={
                      <ProtectedCustomerRoute>
                        <AccountLayout />
                      </ProtectedCustomerRoute>
                    }
                  >
                    <Route index element={<AccountOverviewPage />} />
                    <Route path="orders" element={<CustomerOrdersPage />} />
                    <Route path="orders/:id" element={<OrderTrackingPage />} />
                    <Route path="profile" element={<CustomerProfilePage />} />
                    <Route path="addresses" element={<CustomerAddressesPage />} />
                    <Route path="wishlist" element={<CustomerWishlistPage />} />
                  </Route>

                  {/* 404 Fallback */}
                  <Route
                    path="*"
                    element={
                      <div className="max-w-xl mx-auto px-4 py-24 text-center space-y-5">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ts-accent)]">
                          404 • Page Not Found
                        </p>
                        <h1 className="font-serif-luxury text-4xl text-[var(--ts-text-primary)]">
                          The Requested Destination Does Not Exist
                        </h1>
                        <p className="text-xs text-[var(--ts-text-muted)]">
                          Return to the TIMESSELLERS storefront to explore our active collections.
                        </p>
                        <Link to="/">
                          <Button variant="gold" size="md">
                            Return Home
                          </Button>
                        </Link>
                      </div>
                    }
                  />
                </Route>

                {/* EXPERIENCE C: RESTRICTED ADMINISTRATIVE DASHBOARD */}
                <Route path="/admin/login" element={<AdminLoginPage />} />
                <Route
                  path="/admin"
                  element={
                    <ProtectedAdminRoute>
                      <AdminLayout />
                    </ProtectedAdminRoute>
                  }
                >
                  <Route index element={<AdminOverviewPage />} />
                  <Route path="products" element={<AdminProductsPage />} />
                  <Route path="categories" element={<AdminCategoriesPage />} />
                  <Route path="orders" element={<AdminOrdersPage />} />
                  <Route path="payments" element={<AdminPaymentsPage />} />
                  <Route path="inventory" element={<AdminInventoryPage />} />
                  <Route path="customers" element={<AdminCustomersPage />} />
                  <Route path="analytics" element={<AdminAnalyticsPage />} />
                  <Route path="settings" element={<AdminSettingsPage />} />
                </Route>
              </Routes>
            </Suspense>
          </CartProvider>
        </AuthProvider>
      </StoreSettingsProvider>
    </BrowserRouter>
  );
};

export default App;
