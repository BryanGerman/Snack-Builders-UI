import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, CreditCard, Flame, KeyRound, LayoutDashboard, Menu as MenuIcon, TestTube2 } from 'lucide-react';
import { SnackBuildersApiClient } from './api/client';
import { Button } from './components/Button';
import { Field, TextArea, TextInput } from './components/FormField';
import { ApiLogPanel } from './features/dashboard/ApiLogPanel';
import { ChallengeCoverage } from './features/dashboard/ChallengeCoverage';
import { KitchenPanel } from './features/kitchen/KitchenPanel';
import { MenuPanel } from './features/menu/MenuPanel';
import { OrdersPanel } from './features/orders/OrdersPanel';
import { PaymentsPanel } from './features/payments/PaymentsPanel';
import { TestingPanel } from './features/testing/TestingPanel';
import { useLocalStorage } from './hooks/useLocalStorage';
import { createDemoAdminJwt } from './lib/jwt';
import type { ApiLogEntry, KitchenStatus, MenuItem, Order, Payment } from './types/domain';

type TabId = 'dashboard' | 'menu' | 'orders' | 'payments' | 'kitchen' | 'testing';

const ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const ENV_PROXY_TARGET = import.meta.env.VITE_PROXY_TARGET || '';
const DEFAULT_BASE_URL = getDefaultApiBaseUrl();
const DEFAULT_JWT_SECRET = import.meta.env.VITE_DEMO_JWT_SECRET || 'dev-only-snack-builders-secret';

function cleanBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '');
}

function isAbsoluteHttpUrl(baseUrl: string) {
  return /^https?:\/\//i.test(baseUrl.trim());
}

function isLocalProxyBaseUrl(baseUrl: string) {
  const normalized = cleanBaseUrl(baseUrl);
  return normalized === '' || normalized === '/' || normalized === '/api';
}

function isCurrentStaticHostBaseUrl(baseUrl: string) {
  if (!baseUrl.trim() || typeof window === 'undefined') return false;

  try {
    const url = new URL(baseUrl, window.location.origin);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

function getDefaultApiBaseUrl() {
  const proxyTarget = cleanBaseUrl(ENV_PROXY_TARGET);
  const apiBaseUrl = cleanBaseUrl(ENV_API_BASE_URL);

  if (import.meta.env.PROD) {
    return proxyTarget || (isAbsoluteHttpUrl(apiBaseUrl) ? apiBaseUrl : '');
  }

  return apiBaseUrl || '/api';
}

function resolveApiBaseUrl(baseUrl: string) {
  const trimmedBaseUrl = cleanBaseUrl(baseUrl);

  if (
    import.meta.env.PROD &&
    DEFAULT_BASE_URL &&
    (isLocalProxyBaseUrl(trimmedBaseUrl) || isCurrentStaticHostBaseUrl(trimmedBaseUrl))
  ) {
    return DEFAULT_BASE_URL;
  }

  return trimmedBaseUrl || DEFAULT_BASE_URL;
}

const tabs: Array<{ id: TabId; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Coverage', icon: LayoutDashboard },
  { id: 'menu', label: 'Menu', icon: MenuIcon },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'kitchen', label: 'Kitchen', icon: Flame },
  { id: 'testing', label: 'Verification', icon: TestTube2 },
];

function upsertOrder(orders: Order[], next: Order): Order[] {
  const exists = orders.some((order) => order.id === next.id);
  if (!exists) return [next, ...orders];
  return orders.map((order) => (order.id === next.id ? next : order));
}

function App() {
  const [activeTab, setActiveTab] = useLocalStorage<TabId>('snack-ui.active-tab', 'dashboard');
  const [apiBaseUrl, setApiBaseUrl] = useLocalStorage('snack-ui.base-url', DEFAULT_BASE_URL);
  const [token, setToken] = useLocalStorage('snack-ui.token', '');
  const [jwtSecret, setJwtSecret] = useLocalStorage('snack-ui.jwt-secret', DEFAULT_JWT_SECRET);
  const [menu, setMenu] = useLocalStorage<MenuItem[]>('snack-ui.menu', []);
  const [orders, setOrders] = useLocalStorage<Order[]>('snack-ui.orders', []);
  const [payments, setPayments] = useLocalStorage<Payment[]>('snack-ui.payments', []);
  const [selectedOrderId, setSelectedOrderId] = useLocalStorage('snack-ui.selected-order-id', '');
  const [kitchenStatus, setKitchenStatus] = useLocalStorage<KitchenStatus | null>('snack-ui.kitchen-status', null);
  const [logs, setLogs] = useState<ApiLogEntry[]>([]);
  const [lastError, setLastError] = useState('');
  const [lastAutoRefreshAt, setLastAutoRefreshAt] = useState('');
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const effectiveApiBaseUrl = useMemo(() => resolveApiBaseUrl(apiBaseUrl), [apiBaseUrl]);

  useEffect(() => {
    if (
      effectiveApiBaseUrl !== apiBaseUrl.trim() &&
      (isLocalProxyBaseUrl(apiBaseUrl) || isCurrentStaticHostBaseUrl(apiBaseUrl))
    ) {
      setApiBaseUrl(effectiveApiBaseUrl);
    }
  }, [apiBaseUrl, effectiveApiBaseUrl, setApiBaseUrl]);

  const api = useMemo(
    () =>
      new SnackBuildersApiClient({
        baseUrl: effectiveApiBaseUrl,
        token,
        blockRelativeUrls: import.meta.env.PROD,
        onLog: (entry) => setLogs((current) => [entry, ...current].slice(0, 80)),
      }),
    [effectiveApiBaseUrl, token],
  );

  useEffect(() => {
    if (!token.trim() || !effectiveApiBaseUrl.trim()) return undefined;

    let cancelled = false;

    async function syncRuntimeState() {
      try {
        const kitchen = await api.getKitchenStatus();
        if (cancelled) return;
        setKitchenStatus(kitchen);

        try {
          const latestMenu = await api.listMenu();
          if (!cancelled) {
            setMenu(latestMenu);
          }
        } catch {
          // Keep existing menu state if the background refresh fails.
        }

        if (selectedOrderId) {
          try {
            const order = await api.trackOrder(selectedOrderId);
            if (!cancelled) {
              setOrders((current) => upsertOrder(current, order));
            }
          } catch {
            // A selected order can be stale; kitchen refresh should continue.
          }
        }

        if (!cancelled) {
          setLastAutoRefreshAt(new Date().toISOString());
        }
      } catch {
        // Avoid noisy banners during background polling; explicit actions still surface errors.
      }
    }

    syncRuntimeState();
    const timer = window.setInterval(syncRuntimeState, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [api, effectiveApiBaseUrl, selectedOrderId, setKitchenStatus, setMenu, setOrders, token]);

  function handleError(message: string) {
    setLastError(message);
    window.setTimeout(() => setLastError(''), 8000);
  }

  async function generateAdminToken() {
    setIsGeneratingToken(true);
    try {
      setToken(await createDemoAdminJwt(jwtSecret));
    } finally {
      setIsGeneratingToken(false);
    }
  }

  const sharedProps = {
    api,
    menu,
    orders,
    payments,
    selectedOrderId,
    onMenuChange: setMenu,
    onOrdersChange: setOrders,
    onPaymentsChange: setPayments,
    onSelectedOrderIdChange: setSelectedOrderId,
    onKitchenStatusChange: setKitchenStatus,
    onError: handleError,
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SB</div>
          <div>
            <strong>Snack Builders</strong>
            <span>Backend evaluator</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} className={activeTab === tab.id ? 'nav-active' : ''} onClick={() => setActiveTab(tab.id)}>
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <section className="connection-panel" aria-label="API connection">
          <div className="connection-heading">
            <KeyRound size={18} />
            <div>
              <strong>Connection</strong>
              <span>{token.trim() ? 'Credential ready' : 'Credential required'}</span>
            </div>
          </div>
          <Field label="API base">
            <TextInput value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} placeholder="https://api.example.com" />
          </Field>
          <Field label="JWT secret">
            <TextInput value={jwtSecret} onChange={(event) => setJwtSecret(event.target.value)} />
          </Field>
          <Button className="full-width" onClick={generateAdminToken} disabled={isGeneratingToken}>
            {isGeneratingToken ? 'Generating...' : 'Generate admin token'}
          </Button>
          <Field label="Bearer token">
            <TextArea rows={5} value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste the API credential once" />
          </Field>
          <p className="connection-footnote">Requests use <span className="mono">{effectiveApiBaseUrl || 'not configured'}</span></p>
          <p className="connection-footnote">Auto-refresh <span className="mono">{lastAutoRefreshAt ? 'active' : 'waiting for auth'}</span></p>
        </section>

        <div className="sidebar-footer">
          <span>2 ovens / 3 trays each</span>
          <span>Cookies 5m / Pastries 10m / Breads 20m</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="hero">
          <div>
            <p className="eyebrow">Snack Builders Backend Console</p>
            <h1>Order, payment, and kitchen scheduler verification</h1>
            <p>
              Validate menu operations, multi-item tickets, payments, oven capacity, ETA recalculation, and VIP priority behavior against the deployed API.
            </p>
          </div>
          <div className="hero-stats">
            <div><span>Menu</span><strong>{menu.length}</strong></div>
            <div><span>Orders</span><strong>{orders.length}</strong></div>
            <div><span>Payments</span><strong>{payments.length}</strong></div>
            <div><span>Queued</span><strong>{kitchenStatus?.queued_tasks.length ?? 0}</strong></div>
          </div>
        </header>

        {lastError && (
          <div className="error-banner">
            <AlertTriangle size={18} />
            <span>{lastError}</span>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="page-stack">
            <ChallengeCoverage
              menu={menu}
              orders={orders}
              payments={payments}
              kitchenStatus={kitchenStatus}
              hasToken={Boolean(token.trim())}
              hasTimeSimulationEvidence={logs.some((entry) => entry.path === '/kitchen/time/advance')}
            />
            <ApiLogPanel entries={logs} onClear={() => setLogs([])} />
          </div>
        )}

        {activeTab === 'menu' && <MenuPanel {...sharedProps} />}
        {activeTab === 'orders' && <OrdersPanel {...sharedProps} kitchenStatus={kitchenStatus} />}
        {activeTab === 'payments' && <PaymentsPanel {...sharedProps} />}
        {activeTab === 'kitchen' && <KitchenPanel {...sharedProps} kitchenStatus={kitchenStatus} />}
        {activeTab === 'testing' && <TestingPanel {...sharedProps} />}
      </main>
    </div>
  );
}

export default App;
