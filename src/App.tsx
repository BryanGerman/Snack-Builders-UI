import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, CreditCard, Flame, KeyRound, LayoutDashboard, Menu as MenuIcon, RefreshCw, TestTube2 } from 'lucide-react';
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
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useLocalStorage('snack-ui.auto-refresh-enabled', false);
  const [logs, setLogs] = useState<ApiLogEntry[]>([]);
  const [lastError, setLastError] = useState('');
  const [lastRefreshAt, setLastRefreshAt] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  function handleError(message: string) {
    setLastError(message);
    window.setTimeout(() => setLastError(''), 8000);
  }

  const refreshRuntimeState = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!token.trim() || !effectiveApiBaseUrl.trim()) {
        if (!silent) handleError('Configure the API base URL and bearer token before reloading.');
        return;
      }

      if (!silent) setIsRefreshing(true);
      const failures: string[] = [];

      try {
        const [kitchenResult, menuResult] = await Promise.allSettled([
          api.getKitchenStatus(),
          api.listMenu(),
        ]);

        if (kitchenResult.status === 'fulfilled') {
          setKitchenStatus(kitchenResult.value);
        } else {
          failures.push(kitchenResult.reason instanceof Error ? kitchenResult.reason.message : String(kitchenResult.reason));
        }

        if (menuResult.status === 'fulfilled') {
          setMenu(menuResult.value);
        } else {
          failures.push(menuResult.reason instanceof Error ? menuResult.reason.message : String(menuResult.reason));
        }

        if (selectedOrderId) {
          try {
            const order = await api.trackOrder(selectedOrderId);
            setOrders((current) => upsertOrder(current, order));
          } catch (error) {
            failures.push(error instanceof Error ? error.message : String(error));
          }
        }

        setLastRefreshAt(new Date().toISOString());
        if (failures.length > 0 && !silent) {
          handleError(failures[0] ?? 'Reload completed with errors.');
        }
      } finally {
        if (!silent) setIsRefreshing(false);
      }
    },
    [api, effectiveApiBaseUrl, selectedOrderId, setKitchenStatus, setMenu, setOrders, token],
  );

  useEffect(() => {
    if (!autoRefreshEnabled || !token.trim() || !effectiveApiBaseUrl.trim()) return undefined;

    let cancelled = false;
    async function syncRuntimeState() {
      if (cancelled) return;
      await refreshRuntimeState({ silent: true });
    }

    syncRuntimeState();
    const timer = window.setInterval(syncRuntimeState, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [autoRefreshEnabled, effectiveApiBaseUrl, refreshRuntimeState, token]);

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
    onReload: refreshRuntimeState,
    isReloading: isRefreshing,
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

        <div className="sidebar-section-label">Navigation</div>
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

        <details className="connection-panel" aria-label="API connection">
          <summary className="connection-heading">
            <KeyRound size={18} />
            <div>
              <strong>Environment</strong>
              <span>{token.trim() ? 'Connected · credential ready' : 'Credential required'}</span>
            </div>
          </summary>
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
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={autoRefreshEnabled}
              onChange={(event) => setAutoRefreshEnabled(event.target.checked)}
            />
            <span>Auto-refresh</span>
          </label>
          <p className="connection-footnote">Requests use <span className="mono">{effectiveApiBaseUrl || 'not configured'}</span></p>
          <p className="connection-footnote">Refresh mode <span className="mono">{autoRefreshEnabled ? 'automatic every 5s' : 'manual only'}</span></p>
          <p className="connection-footnote">Last reload <span className="mono">{lastRefreshAt || 'never'}</span></p>
        </details>

        <div className="sidebar-footer">
          <span>2 ovens / 3 trays each</span>
          <span>Cookies 5m / Pastries 10m / Breads 20m</span>
        </div>
      </aside>

      <main className="main-content">
        <div className="page-container">
          <header className="page-header">
            <div className="page-title-group">
              <p className="page-kicker">Snack Builders Backend Console</p>
              <h1>Orders Verification Console</h1>
              <p>
                Validate menu operations, multi-item tickets, payments, oven capacity, ETA recalculation, and VIP priority behavior.
              </p>
            </div>
            <div className="environment-status">
              <span>{token.trim() ? 'Connected' : 'Auth required'}</span>
              <strong>{effectiveApiBaseUrl || 'API not configured'}</strong>
              <Button variant="secondary" className="status-reload" onClick={() => refreshRuntimeState()} disabled={isRefreshing}>
                <RefreshCw size={15} />
                {isRefreshing ? 'Reloading' : 'Reload'}
              </Button>
            </div>
          </header>

          <div className="summary-grid" aria-label="Runtime summary">
            <div className="metric"><span>Menu items</span><strong>{menu.length}</strong></div>
            <div className="metric"><span>Orders</span><strong>{orders.length}</strong></div>
            <div className="metric"><span>Payments</span><strong>{payments.length}</strong></div>
            <div className="metric"><span>Queued tasks</span><strong>{kitchenStatus?.queued_tasks.length ?? 0}</strong></div>
          </div>

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
                onReload={refreshRuntimeState}
                isReloading={isRefreshing}
              />
              <ApiLogPanel entries={logs} onClear={() => setLogs([])} />
            </div>
          )}

          {activeTab === 'menu' && <MenuPanel {...sharedProps} />}
          {activeTab === 'orders' && <OrdersPanel {...sharedProps} kitchenStatus={kitchenStatus} />}
          {activeTab === 'payments' && <PaymentsPanel {...sharedProps} />}
          {activeTab === 'kitchen' && <KitchenPanel {...sharedProps} kitchenStatus={kitchenStatus} />}
          {activeTab === 'testing' && <TestingPanel {...sharedProps} />}
        </div>
      </main>
    </div>
  );
}

export default App;
