import * as React from 'react';
import { createBrowserRouter, RouterProvider, Link } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useDbStore, bootDb, resetDemo } from '@/store/db';
import { useSession } from '@/store/session';
import { DASHBOARD_ROLES } from '@/domain/roles';
import { AppShell } from '@/components/layout/AppShell';
import { ConfirmProvider, TipProvider } from '@/components/ui/overlay';
import { Button } from '@/components/ui/core';
import { BrandMark } from '@/components/layout/Brand';
import { AlertTriangle } from '@/components/ui/icons';

const lazy = (f: () => Promise<{ default: React.ComponentType }>) => React.lazy(f);
const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'));
const Pricing = lazy(() => import('@/features/pricing/PricingPage'));
const Catalog = lazy(() => import('@/features/catalog/CatalogPage'));
const Enquiries = lazy(() => import('@/features/enquiries/EnquiriesPage'));
const Quotes = lazy(() => import('@/features/quotes/QuotesPage'));
const QuoteStudio = lazy(() => import('@/features/quotes/QuoteStudio'));
const Orders = lazy(() => import('@/features/orders/OrdersPage'));
const Procurement = lazy(() => import('@/features/procurement/ProcurementPage'));
const Inventory = lazy(() => import('@/features/inventory/InventoryPage'));
const Warehouse = lazy(() => import('@/features/warehouse3d/WarehousePage'));
const Delivery = lazy(() => import('@/features/delivery/DeliveryPage'));
const Customers = lazy(() => import('@/features/crm/CustomersPage'));
const Pos = lazy(() => import('@/features/pos/PosPage'));
const Finance = lazy(() => import('@/features/finance/FinancePage'));
const Analytics = lazy(() => import('@/features/analytics/AnalyticsPage'));
const Approvals = lazy(() => import('@/features/approvals/ApprovalsPage'));
const Settings = lazy(() => import('@/features/settings/SettingsPage'));
const Tour = lazy(() => import('@/features/tour/TourPage'));
const Workspace = lazy(() => import('@/features/workspace/WorkspacePage'));

/** Owner / managers land on the management dashboard; operational roles on their workspace. */
function Home() {
  const role = useSession((s) => s.role);
  return DASHBOARD_ROLES.includes(role) ? <Dashboard /> : <Workspace />;
}

function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="font-display text-5xl font-extrabold text-brand">404</p>
      <p className="mt-2 font-semibold">This page doesn't exist in the demo.</p>
      <p className="mt-1 text-sm text-muted">Check the address, or head back to Mission Control.</p>
      <Link to="/" className="mt-5 inline-block">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/pricing', element: <Pricing /> },
      { path: '/catalog', element: <Catalog /> },
      { path: '/enquiries', element: <Enquiries /> },
      { path: '/quotes', element: <Quotes /> },
      { path: '/quotes/:id', element: <QuoteStudio /> },
      { path: '/orders', element: <Orders /> },
      { path: '/procurement', element: <Procurement /> },
      { path: '/inventory', element: <Inventory /> },
      { path: '/warehouse', element: <Warehouse /> },
      { path: '/delivery', element: <Delivery /> },
      { path: '/customers', element: <Customers /> },
      { path: '/pos', element: <Pos /> },
      { path: '/finance', element: <Finance /> },
      { path: '/analytics', element: <Analytics /> },
      { path: '/approvals', element: <Approvals /> },
      { path: '/settings', element: <Settings /> },
      { path: '/tour', element: <Tour /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

function useThemeEffect() {
  const theme = useSession((s) => s.theme);
  const motionPref = useSession((s) => s.motion);
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1e1a' : '#103F34');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  React.useEffect(() => {
    document.documentElement.classList.toggle('motion-reduce', motionPref === 'reduce');
    document.documentElement.classList.toggle('motion-full', motionPref === 'full');
  }, [motionPref]);
}

function Splash({ seeding }: { seeding: boolean }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-forest-900 px-6 text-center">
      <div>
        <div className="mx-auto mb-5 w-fit">
          <BrandMark />
        </div>
        <div className="mx-auto h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 animate-[shimmer_1.2s_linear_infinite] rounded-full bg-jade-400" style={{ animationName: 'none', transform: 'translateX(0)', width: '60%' }} />
        </div>
        <p className="mt-4 text-sm text-white/70">{seeding ? 'Generating 90 days of fictional demo history in this browser…' : 'Loading demo data…'}</p>
      </div>
    </div>
  );
}

export function App() {
  const status = useDbStore((s) => s.status);
  const error = useDbStore((s) => s.error);
  useThemeEffect();
  React.useEffect(() => {
    void bootDb();
  }, []);
  if (status === 'loading' || status === 'seeding') return <Splash seeding={status === 'seeding'} />;
  if (status === 'error')
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
          <AlertTriangle className="mx-auto size-8 text-danger" />
          <p className="mt-3 font-semibold">The demo data could not be loaded</p>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <Button className="mt-4" onClick={() => resetDemo().then(() => window.location.reload())}>
            Reset demo data
          </Button>
        </div>
      </div>
    );
  return (
    <TipProvider delayDuration={250}>
      <ConfirmProvider>
        <RouterProvider router={router} />
        <Toaster position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }} />
      </ConfirmProvider>
    </TipProvider>
  );
}
