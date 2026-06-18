export type SnackCategory = 'cookies' | 'pastries' | 'breads';
export type PriorityLevel = 1 | 2 | 3;
export type OrderStatus = 'received' | 'waiting' | 'baking' | 'ready' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod = 'cash' | 'credit_card';

export interface MenuItem {
  id: string;
  name: string;
  category: SnackCategory;
  price: string;
  is_active: boolean;
  bake_time_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface MenuItemCreate {
  name: string;
  category: SnackCategory;
  price: string;
}

export interface MenuItemUpdate {
  name?: string;
  category?: SnackCategory;
  price?: string;
  is_active?: boolean;
}

export interface OrderItemCreate {
  menu_item_id: string;
  quantity: number;
}

export interface OrderCreate {
  priority_level: PriorityLevel;
  items: OrderItemCreate[];
}

export interface OrderItem {
  id: string;
  menu_item_id: string;
  name: string;
  category: SnackCategory;
  unit_price: string;
  quantity: number;
  line_total: string;
  bake_time_minutes: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  priority_level: PriorityLevel;
  items: OrderItem[];
  total_price: string;
  estimated_ready_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillItem {
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}

export interface OrderBill {
  order_id: string;
  payment_status: PaymentStatus;
  items: BillItem[];
  subtotal: string;
  total: string;
  amount_due: string;
}

export interface PaymentCreate {
  order_id: string;
  amount: string;
  method: PaymentMethod;
}

export interface Payment {
  id: string;
  order_id: string;
  amount: string;
  method: PaymentMethod;
  status: PaymentStatus;
  created_at: string;
  updated_at: string;
}

export interface KitchenTask {
  id: string;
  order_id: string;
  order_item_id: string;
  menu_item_id: string;
  name: string;
  category: SnackCategory;
  priority_level: PriorityLevel;
  sequence: number;
  oven_id: string | null;
  slot_number: number | null;
  queued_at: string;
  started_at: string | null;
  finishes_at: string | null;
  bake_time_minutes: number;
  remaining_bake_seconds?: number | null;
}

export interface KitchenStatus {
  ovens: number;
  slots_per_oven: number;
  total_slots: number;
  current_time?: string;
  active_tasks: KitchenTask[];
  queued_tasks: KitchenTask[];
}

export interface HealthResponse {
  status: string;
  environment: string;
  service: string;
}

export interface ApiLogEntry {
  id: string;
  at: string;
  method: string;
  path: string;
  status?: number;
  ok?: boolean;
  durationMs?: number;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string;
}

export interface TestStepResult {
  name: string;
  ok: boolean;
  detail: string;
  payload?: unknown;
}
