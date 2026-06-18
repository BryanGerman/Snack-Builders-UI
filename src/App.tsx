import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, CreditCard, Flame, LayoutDashboard, Menu as MenuIcon, TestTube2 } from 'lucide-react';
import { SnackBuildersApiClient } from './api/client';
import { ApiLogPanel } from './features/dashboard/ApiLogPanel';
import { ConfigPanel } from './features/dashboard/ConfigPanel';
import { KitchenPanel } from './features/kitchen/KitchenPanel';
import { MenuPanel } from './features/menu/MenuPanel';
import { OrdersPanel } from './features/orders/OrdersPanel';
import { PaymentsPanel } from './features/payments/PaymentsPanel';
import { TestingPanel } from './features/testing/TestingPanel';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { ApiLogEntry, KitchenStatus, MenuItem, Order, Payment } from './types/domain';

type TabId = 'dashboard' | 'menu' | 'orders' | 'payments' | 'kitchen' | 'testing';

const ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const ENV_PROXY_TARGET = import.meta.env.VITE_PROXY_TARGET || '';
const DEFAULT_BASE_URL = import.meta.env.PROD && isLocalProxyBaseUrl(ENV_API_BASE_URL)
  ? ENV_PROXY_TARGET || ENV_API_BASE_URL || '/api'
  : ENV_API_BASE_URL || '/api';
const DEFAULT_JWT_SECRET = import.meta.env.VITE_DEMO_JWT_SECRET || 'dev-only-snack-builders-secret';

function isLocalProxyBaseUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  return normalized === '' || normalized === '/' || normalized === '/api';
}

function resolveApiBaseUrl(baseUrl: string) {
  const trimmedBaseUrl = baseUrl.trim();

  if (import.meta.env.PROD && ENV_PROXY_TARGET && isLocalProxyBaseUrl(trimmedBaseUrl)) {
    return ENV_PROXY_TARGET;
  }

  return trimmedBaseUrl || DEFAULT_BASE_URL;
}

const tabs: Array<{ id: TabId; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'menu', label: 'Menu', icon: MenuIcon },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'kitchen', label: 'Kitchen', icon: Flame },
  { id: 'testing', label: 'Test Console', icon: TestTube2 },
];

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
  const effectiveApiBaseUrl = useMemo(() => resolveApiBaseUrl(apiBaseUrl), [apiBaseUrl]);

  useEffect(() => {
    if (effectiveApiBaseUrl !== apiBaseUrl.trim() && isLocalProxyBaseUrl(apiBaseUrl)) {
      setApiBaseUrl(effectiveApiBaseUrl);
    }
  }, [apiBaseUrl, effectiveApiBaseUrl, setApiBaseUrl]);

  const api = useMemo(
    () =>
      new SnackBuildersApiClient({
        baseUrl: effectiveApiBaseUrl,
        token,
        onLog: (entry) => setLogs((current) => [entry, ...current].slice(0, 80)),
      }),
    [effectiveApiBaseUrl, token],
  );

  function handleError(message: string) {
    setLastError(message);
    window.setTimeout(() => setLastError(''), 8000);
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
            <span>Bakery API Tester</span>
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

        <div className="sidebar-footer">
          <span>Capacity: 2 ovens × 3 trays</span>
          <span>Cookies 5m · Pastries 10m · Breads 20m</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="hero">
          <div>
            <p className="eyebrow">Backend Challenge Control Center</p>
            <h1>Snack Builders Bakery Functional UI</h1>
            <p>
              Exercise menu management, multi-item order tickets, payments, kitchen monitoring, capacity estimation, and VIP priority queue behavior against the deployed API.
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
            <ConfigPanel
              apiBaseUrl={apiBaseUrl}
              token={token}
              jwtSecret={jwtSecret}
              onApiBaseUrlChange={setApiBaseUrl}
              onTokenChange={setToken}
              onJwtSecretChange={setJwtSecret}
            />
            <ApiLogPanel entries={logs} onClear={() => setLogs([])} />
          </div>
        )}

        {activeTab === 'menu' && <MenuPanel {...sharedProps} />}
        {activeTab === 'orders' && <OrdersPanel {...sharedProps} />}
        {activeTab === 'payments' && <PaymentsPanel {...sharedProps} />}
        {activeTab === 'kitchen' && <KitchenPanel {...sharedProps} kitchenStatus={kitchenStatus} />}
        {activeTab === 'testing' && <TestingPanel {...sharedProps} />}
      </main>
    </div>
  );
}

export default App;
