// ==============================================================================
// TIMESSELLERS — APPLICATION ROUTER & ROOT COMPONENT
// Connects all three experiences:
// A. Public Customer Storefront (/, /shop, /shop/:category, /product/:slug, /cart, /login, Legal)
// B. Authenticated Customer Dashboard (/checkout, /account, /account/orders, /account/orders/:id, /account/profile, /account/addresses, /account/wishlist)
// C. Restricted Administrative Dashboard (/admin, /admin/products, /admin/categories, /admin/orders, /admin/payments, /admin/inventory, /admin/customers, /admin/analytics, /admin/settings)
// ==============================================================================

import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { StoreSettingsProvider } from '@/context/StoreSettingsContext';
import {
  ProtectedCustomerRoute,
  ProtectedAdminRoute,
} from '@/components/auth/RouteGuards';
import { StorefrontLayout } from '@/components/layout/StorefrontLayout';
import { NotFoundPage } from '@/pages/storefront/NotFoundPage';
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from '@/lib/utils';

// Lazy-loaded route modules for performance & optimal bundle splitting
const LandingPage = lazy(() =>
  import('@/pages/storefront/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const ShopPage = lazy(() =>
  import('@/pages/storefront/ShopPage').then((m) => ({ default: m.ShopPage }))
);
const CollectionsPage = lazy(() =>
  import('@/pages/storefront/CollectionsPage').then((m) => ({ default: m.CollectionsPage }))
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

const ROUTE_META: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'TIMESSELLERS | Haute Horlogerie & Luxury Maison',
    description:
      'Discover precision chronographs, Italian leather goods, rare extrait de parfum, titanium eyewear, and bespoke objects across India.',
  },
  '/collections': {
    title: 'Select Category | TIMESSELLERS',
    description: 'Choose a luxury department to explore curated creations at TIMESSELLERS.',
  },
  '/shop': {
    title: 'Collections | TIMESSELLERS',
    description:
      'Explore the curated TIMESSELLERS catalog of luxury watches, eyewear, fragrances, leather goods, and acoustic instruments.',
  },
  '/cart': {
    title: 'Shopping Bag | TIMESSELLERS',
    description: 'Review your selected luxury items and proceed to express checkout.',
  },
  '/checkout': {
    title: 'Express Checkout | TIMESSELLERS',
    description: 'Complete your TIMESSELLERS order securely via UPI QR or cryptocurrency.',
  },
  '/track-order': {
    title: 'Track Order | TIMESSELLERS',
    description: 'Check live delivery milestones and tracking details for your TIMESSELLERS order.',
  },
  '/about': {
    title: 'About Maison | TIMESSELLERS',
    description: 'Learn about TIMESSELLERS provenance, quality inspection, and pan-India delivery.',
  },
  '/contact': {
    title: 'Private Concierge | TIMESSELLERS',
    description: 'Contact the TIMESSELLERS client concierge desk for order support and inquiries.',
  },
  '/shipping-policy': {
    title: 'Shipping & Delivery Policy | TIMESSELLERS',
    description: 'Pan-India insured delivery timelines and complimentary shipping thresholds.',
  },
  '/return-policy': {
    title: 'Return & Refund Policy | TIMESSELLERS',
    description: '7-day inspection window, return eligibility, and refund processing details.',
  },
  '/privacy-policy': {
    title: 'Privacy Policy | TIMESSELLERS',
    description: 'How TIMESSELLERS protects your personal order and contact information.',
  },
  '/privacy': {
    title: 'Privacy Policy | TIMESSELLERS',
    description: 'How TIMESSELLERS protects your personal order and contact information.',
  },
  '/terms': {
    title: 'Terms of Service | TIMESSELLERS',
    description: 'Terms of service, pricing, and settlement policies for TIMESSELLERS.',
  },
  '/tos': {
    title: 'Terms of Service | TIMESSELLERS',
    description: 'Terms of service, pricing, and settlement policies for TIMESSELLERS.',
  },
};

const RouteMetaManager: React.FC = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const isAdminRoute = pathname.startsWith(ADMIN_BASE_PATH);
    const matched =
      ROUTE_META[pathname] ||
      (pathname.startsWith('/shop/')
        ? ROUTE_META['/shop']
        : pathname.startsWith('/product/')
          ? {
              title: 'Creation Dossier | TIMESSELLERS',
              description: 'Inspect specifications, imagery, video, and availability at TIMESSELLERS.',
            }
          : isAdminRoute
            ? {
                title: 'Vault Console | TIMESSELLERS',
                description: 'Restricted administrative console.',
              }
            : {
                title: 'Page Not Found | TIMESSELLERS',
                description: 'The requested page could not be found on TIMESSELLERS.',
              });

    document.title = matched.title;

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', matched.description);

    let metaRobots = document.querySelector('meta[name="robots"]');
    if (isAdminRoute) {
      if (!metaRobots) {
        metaRobots = document.createElement('meta');
        metaRobots.setAttribute('name', 'robots');
        document.head.appendChild(metaRobots);
      }
      metaRobots.setAttribute('content', 'noindex, nofollow');
    } else if (metaRobots) {
      metaRobots.remove();
    }
  }, [pathname]);

  return null;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <RouteMetaManager />
      <StoreSettingsProvider>
        <AuthProvider>
          <CartProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* EXPERIENCE A & B: PUBLIC STOREFRONT & PROTECTED CUSTOMER DASHBOARD */}
                <Route element={<StorefrontLayout />}>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/collections" element={<CollectionsPage />} />
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
                  <Route path="/privacy" element={<PrivacyPolicyPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/tos" element={<TermsPage />} />

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
                  <Route path="*" element={<NotFoundPage />} />
                </Route>

                {/* EXPERIENCE C: HIDDEN ADMINISTRATIVE DASHBOARD */}
                <Route path={ADMIN_LOGIN_PATH} element={<AdminLoginPage />} />
                <Route
                  path={ADMIN_BASE_PATH}
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
