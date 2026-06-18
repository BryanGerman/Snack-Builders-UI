import { ApiError } from './errors';
import type {
  ApiLogEntry,
  HealthResponse,
  KitchenStatus,
  MenuItem,
  MenuItemCreate,
  MenuItemUpdate,
  Order,
  OrderBill,
  OrderCreate,
  Payment,
  PaymentCreate,
} from '../types/domain';

type Logger = (entry: ApiLogEntry) => void;

interface ApiClientOptions {
  baseUrl: string;
  token: string;
  onLog?: Logger;
  blockRelativeUrls?: boolean;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export type ApiRequestMethod = NonNullable<RequestOptions['method']>;
const REQUEST_TIMEOUT_MS = 25_000;

function cleanBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function pathWithSlash(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function isAbsoluteHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (response.status === 204) return null;
  if (contentType.includes('application/json')) return response.json();
  return response.text();
}

function errorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    return JSON.stringify(detail);
  }
  return `HTTP ${status}`;
}

function requestTimeoutMessage(path: string): string {
  return `Request to ${path} timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s. Check the API URL, CORS, or backend availability.`;
}

export class SnackBuildersApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly onLog: Logger | undefined;
  private readonly blockRelativeUrls: boolean;

  constructor(options: ApiClientOptions) {
    this.baseUrl = cleanBaseUrl(options.baseUrl);
    this.token = options.token;
    this.onLog = options.onLog;
    this.blockRelativeUrls = options.blockRelativeUrls ?? false;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const normalizedPath = pathWithSlash(path);
    const started = performance.now();
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (this.token.trim()) {
      headers.Authorization = `Bearer ${this.token.trim()}`;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    try {
      if (this.blockRelativeUrls && !isAbsoluteHttpUrl(this.baseUrl)) {
        throw new ApiError(
          'API base URL is not configured for production. Set VITE_PROXY_TARGET to the API Gateway URL.',
          0,
          null,
        );
      }

      const response = await fetch(`${this.baseUrl}${normalizedPath}`, init);
      window.clearTimeout(timeout);
      const body = await parseBody(response);
      const durationMs = Math.round(performance.now() - started);
      this.onLog?.({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        method,
        path: normalizedPath,
        status: response.status,
        ok: response.ok,
        durationMs,
        requestBody: options.body,
        responseBody: body,
      });

      if (!response.ok) {
        throw new ApiError(errorMessage(response.status, body), response.status, body);
      }
      return body as T;
    } catch (error) {
      window.clearTimeout(timeout);
      if (error instanceof ApiError) throw error;
      const normalizedError = error instanceof DOMException && error.name === 'AbortError'
        ? new Error(requestTimeoutMessage(normalizedPath))
        : error;
      const durationMs = Math.round(performance.now() - started);
      this.onLog?.({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        method,
        path: normalizedPath,
        ok: false,
        durationMs,
        requestBody: options.body,
        error: normalizedError instanceof Error ? normalizedError.message : String(normalizedError),
      });
      throw normalizedError;
    }
  }

  health(servicePath: '/health' | '/menu/health' | '/orders/health' | '/payments/health' | '/kitchen/health' = '/health') {
    return this.request<HealthResponse>(servicePath);
  }

  listMenu() {
    return this.request<MenuItem[]>('/menu');
  }

  getMenuItem(menuItemId: string) {
    return this.request<MenuItem>(`/menu/${encodeURIComponent(menuItemId)}`);
  }

  createMenuItem(payload: MenuItemCreate) {
    return this.request<MenuItem>('/menu', { method: 'POST', body: payload });
  }

  updateMenuItem(menuItemId: string, payload: MenuItemUpdate) {
    return this.request<MenuItem>(`/menu/${encodeURIComponent(menuItemId)}`, { method: 'PATCH', body: payload });
  }

  deleteMenuItem(menuItemId: string) {
    return this.request<null>(`/menu/${encodeURIComponent(menuItemId)}`, { method: 'DELETE' });
  }

  placeOrder(payload: OrderCreate) {
    return this.request<Order>('/orders', { method: 'POST', body: payload });
  }

  trackOrder(orderId: string) {
    return this.request<Order>(`/orders/${encodeURIComponent(orderId)}`);
  }

  getBill(orderId: string) {
    return this.request<OrderBill>(`/orders/${encodeURIComponent(orderId)}/bill`);
  }

  addOrderItem(orderId: string, menuItemId: string, quantity: number) {
    return this.request<Order>(`/orders/${encodeURIComponent(orderId)}/items`, {
      method: 'POST',
      body: { menu_item_id: menuItemId, quantity },
    });
  }

  updateOrderItemQuantity(orderId: string, orderItemId: string, quantity: number) {
    return this.request<Order>(`/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(orderItemId)}`, {
      method: 'PATCH',
      body: { quantity },
    });
  }

  removeOrderItem(orderId: string, orderItemId: string) {
    return this.request<Order>(`/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(orderItemId)}`, {
      method: 'DELETE',
    });
  }

  createPayment(payload: PaymentCreate) {
    return this.request<Payment>('/payments', { method: 'POST', body: payload });
  }

  getKitchenStatus() {
    return this.request<KitchenStatus>('/kitchen/status');
  }

  scheduleOrder(orderId: string) {
    return this.request<KitchenStatus>(`/kitchen/orders/${encodeURIComponent(orderId)}/schedule`, { method: 'POST' });
  }

  advanceKitchenTime(seconds: number) {
    return this.request<KitchenStatus>('/kitchen/time/advance', { method: 'POST', body: { seconds } });
  }

  testingEndpoint<T = unknown>(path: string, method: ApiRequestMethod = 'GET', body?: unknown) {
    return this.request<T>(path, { method, body });
  }
}
