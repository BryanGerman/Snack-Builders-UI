import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Field, SelectInput, TextInput } from '../../components/FormField';
import { JsonBlock } from '../../components/JsonBlock';
import { StatusBadge } from '../../components/StatusBadge';
import { dateTime, money, priorityLabel, remainingFromKitchenTime, remainingSeconds, truncateMiddle } from '../../lib/format';
import type { SnackBuildersApiClient } from '../../api/client';
import type { KitchenStatus, KitchenTask, MenuItem, Order, OrderStatus, PriorityLevel } from '../../types/domain';

interface DraftOrderItem {
  localId: string;
  menu_item_id: string;
  quantity: number;
}

interface OrdersPanelProps {
  api: SnackBuildersApiClient;
  menu: MenuItem[];
  orders: Order[];
  selectedOrderId: string;
  kitchenStatus: KitchenStatus | null;
  onOrdersChange: Dispatch<SetStateAction<Order[]>>;
  onSelectedOrderIdChange: (orderId: string) => void;
  onKitchenStatusChange: (status: KitchenStatus) => void;
  onError: (message: string) => void;
  onReload: () => void | Promise<void>;
  isReloading: boolean;
}

function upsertOrder(orders: Order[], next: Order): Order[] {
  const exists = orders.some((order) => order.id === next.id);
  if (!exists) return [next, ...orders];
  return orders.map((order) => (order.id === next.id ? next : order));
}

function isTaskReady(task: KitchenTask, kitchenStatus: KitchenStatus | null): boolean {
  if (typeof task.remaining_bake_seconds === 'number') {
    return task.remaining_bake_seconds <= 0;
  }

  if (!task.finishes_at) return false;
  const finishesAt = new Date(task.finishes_at).getTime();
  const current = kitchenStatus?.current_time ? new Date(kitchenStatus.current_time).getTime() : Date.now();
  return Number.isFinite(finishesAt) && Number.isFinite(current) && finishesAt <= current;
}

function isOrderPastEta(order: Order | null | undefined, kitchenStatus: KitchenStatus | null): boolean {
  if (!order?.estimated_ready_time) return false;
  const eta = new Date(order.estimated_ready_time).getTime();
  const current = kitchenStatus?.current_time ? new Date(kitchenStatus.current_time).getTime() : Date.now();
  return Number.isFinite(eta) && Number.isFinite(current) && eta <= current;
}

function effectiveOrderStatus(order: Order | null | undefined, tasks: KitchenTask[], kitchenStatus: KitchenStatus | null): OrderStatus | 'ready' {
  if (!order) return 'received';
  if (order.status === 'ready') return 'ready';
  if (tasks.length > 0 && tasks.every((task) => isTaskReady(task, kitchenStatus))) return 'ready';
  if (tasks.some((task) => task.oven_id)) return 'baking';
  if (tasks.length > 0) return 'waiting';
  if (order.status === 'baking' && isOrderPastEta(order, kitchenStatus)) return 'ready';
  return order.status;
}

function orderZeroLabel(order: Order | null | undefined, tasks: KitchenTask[], kitchenStatus: KitchenStatus | null): string {
  if (effectiveOrderStatus(order, tasks, kitchenStatus) === 'ready') return 'ready now';
  if (order?.status === 'baking') return 'finishing...';
  return 'awaiting status sync';
}

function taskZeroLabel(task: KitchenTask, kitchenStatus: KitchenStatus | null): string {
  if (isTaskReady(task, kitchenStatus)) return 'ready now';
  return task.oven_id ? 'finishing...' : 'queued';
}

function statusTone(status: string): 'success' | 'warning' | 'neutral' {
  if (status === 'ready') return 'success';
  if (status === 'baking') return 'warning';
  return 'neutral';
}

function priorityTone(priority: number): 'vip' | 'warning' | 'neutral' {
  if (priority === 1) return 'vip';
  if (priority === 2) return 'warning';
  return 'neutral';
}

function kitchenHasOrder(status: KitchenStatus, orderId: string): boolean {
  return [...status.active_tasks, ...status.queued_tasks].some((task) => task.order_id === orderId);
}

export function OrdersPanel({
  api,
  menu,
  orders,
  selectedOrderId,
  kitchenStatus,
  onOrdersChange,
  onSelectedOrderIdChange,
  onKitchenStatusChange,
  onError,
  onReload,
  isReloading,
}: OrdersPanelProps) {
  const [priority, setPriority] = useState<PriorityLevel>(3);
  const [draftItems, setDraftItems] = useState<DraftOrderItem[]>([
    { localId: crypto.randomUUID(), menu_item_id: '', quantity: 1 },
  ]);
  const [manualOrderId, setManualOrderId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedItemQuantity, setSelectedItemQuantity] = useState(1);
  const [advanceMinutes, setAdvanceMinutes] = useState(1);
  const [pendingAction, setPendingAction] = useState('');

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const selectedOrderTasks = useMemo(() => {
    if (!selectedOrder || !kitchenStatus) return [];
    return [...kitchenStatus.active_tasks, ...kitchenStatus.queued_tasks].filter((task) => task.order_id === selectedOrder.id);
  }, [kitchenStatus, selectedOrder]);

  const selectedOrderRemaining = useMemo(() => {
    const remainingValues = selectedOrderTasks
      .map((task) => task.remaining_bake_seconds)
      .filter((value): value is number => typeof value === 'number');

    if (remainingValues.length > 0) {
      return remainingSeconds(Math.max(...remainingValues), orderZeroLabel(selectedOrder, selectedOrderTasks, kitchenStatus));
    }

    return remainingFromKitchenTime(
      selectedOrder?.estimated_ready_time,
      kitchenStatus?.current_time,
      orderZeroLabel(selectedOrder, selectedOrderTasks, kitchenStatus),
    );
  }, [kitchenStatus?.current_time, selectedOrder?.estimated_ready_time, selectedOrder?.status, selectedOrderTasks]);

  const activeMenu = menu.filter((item) => item.is_active);
  const selectedEffectiveStatus = effectiveOrderStatus(selectedOrder, selectedOrderTasks, kitchenStatus);

  function tasksForOrder(orderId: string): KitchenTask[] {
    if (!kitchenStatus) return [];
    return [...kitchenStatus.active_tasks, ...kitchenStatus.queued_tasks].filter((task) => task.order_id === orderId);
  }

  async function syncKitchenForOrder(orderId: string) {
    try {
      const current = await api.getKitchenStatus();
      if (kitchenHasOrder(current, orderId)) {
        onKitchenStatusChange(current);
        return;
      }
    } catch {
      // Scheduling below is the important recovery path when status cannot be read first.
    }

    try {
      onKitchenStatusChange(await api.scheduleOrder(orderId));
      return;
    } catch {
      // Some backends auto-schedule on creation or reject duplicate scheduling. Re-read state before giving up.
    }

    try {
      onKitchenStatusChange(await api.getKitchenStatus());
    } catch {
      // Order creation should still succeed even if the kitchen snapshot is temporarily unavailable.
    }
  }

  function updateDraftItem(localId: string, patch: Partial<DraftOrderItem>) {
    setDraftItems((items) => items.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  }

  function addDraftItem() {
    setDraftItems((items) => [...items, { localId: crypto.randomUUID(), menu_item_id: '', quantity: 1 }]);
  }

  function removeDraftItem(localId: string) {
    setDraftItems((items) => items.filter((item) => item.localId !== localId));
  }

  async function placeOrder() {
    const items = draftItems
      .filter((item) => item.menu_item_id.trim() !== '')
      .map((item) => ({ menu_item_id: item.menu_item_id, quantity: item.quantity }));
    if (items.length === 0) {
      onError('Select at least one menu item before placing an order.');
      return;
    }

    setPendingAction('place');
    try {
      const order = await api.placeOrder({ priority_level: priority, items });
      onOrdersChange((current) => upsertOrder(current, order));
      onSelectedOrderIdChange(order.id);
      setManualOrderId(order.id);
      await syncKitchenForOrder(order.id);
      try {
        const refreshedOrder = await api.trackOrder(order.id);
        onOrdersChange((current) => upsertOrder(current, refreshedOrder));
      } catch {
        // The placed ticket is already in state; tracking is a best-effort freshness pass.
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction('');
    }
  }

  async function trackOrder(orderId = selectedOrderId || manualOrderId) {
    if (!orderId) {
      onError('Enter or select an order id.');
      return;
    }
    setPendingAction('track');
    try {
      const order = await api.trackOrder(orderId);
      onOrdersChange((current) => upsertOrder(current, order));
      onSelectedOrderIdChange(order.id);
      setManualOrderId(order.id);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction('');
    }
  }

  async function getBill() {
    if (!selectedOrderId) {
      onError('Select an order first.');
      return;
    }
    setPendingAction('bill');
    try {
      await api.getBill(selectedOrderId);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction('');
    }
  }

  async function addItemToSelected() {
    if (!selectedOrderId || !selectedItemId) {
      onError('Select an order and a menu item first.');
      return;
    }
    setPendingAction('add-item');
    try {
      const order = await api.addOrderItem(selectedOrderId, selectedItemId, selectedItemQuantity);
      onOrdersChange((current) => upsertOrder(current, order));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction('');
    }
  }

  async function updateFirstItemQuantity() {
    if (!selectedOrder || selectedOrder.items.length === 0) return;
    setPendingAction('increment-item');
    try {
      const firstItem = selectedOrder.items[0];
      if (!firstItem) return;
      const order = await api.updateOrderItemQuantity(selectedOrder.id, firstItem.id, Math.max(1, firstItem.quantity + 1));
      onOrdersChange((current) => upsertOrder(current, order));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction('');
    }
  }

  async function removeFirstItem() {
    if (!selectedOrder || selectedOrder.items.length === 0) return;
    setPendingAction('remove-item');
    try {
      const firstItem = selectedOrder.items[0];
      if (!firstItem) return;
      const order = await api.removeOrderItem(selectedOrder.id, firstItem.id);
      onOrdersChange((current) => upsertOrder(current, order));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction('');
    }
  }

  async function advanceKitchenTimeFromOrder(minutes: number) {
    const seconds = Math.max(1, Math.round(minutes * 60));
    setPendingAction('advance-time');
    try {
      const kitchen = await api.advanceKitchenTime(seconds);
      onKitchenStatusChange(kitchen);

      const orderId = selectedOrderId || manualOrderId;
      if (orderId) {
        const refreshedOrder = await api.trackOrder(orderId);
        onOrdersChange((current) => upsertOrder(current, refreshedOrder));
        onSelectedOrderIdChange(refreshedOrder.id);
        setManualOrderId(refreshedOrder.id);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction('');
    }
  }

  return (
    <div className="page-stack">
      <div className="workspace-grid">
        <Card title="Order Builder" subtitle="Create multi-item tickets and verify priority-aware ETA calculation.">
          <Field label="Priority level">
            <SelectInput value={priority} onChange={(event) => setPriority(Number(event.target.value) as PriorityLevel)}>
              <option value={1}>Tier 1 · VIP</option>
              <option value={2}>Tier 2 · App/Delivery</option>
              <option value={3}>Tier 3 · Walk-in</option>
            </SelectInput>
          </Field>

          <div className="stack compact-stack">
            {draftItems.map((item, index) => (
              <div className="inline-form" key={item.localId}>
                <Field label={`Item ${index + 1}`}>
                  <SelectInput value={item.menu_item_id} onChange={(event) => updateDraftItem(item.localId, { menu_item_id: event.target.value })}>
                    <option value="">Select menu item...</option>
                    {activeMenu.map((menuItem) => (
                      <option key={menuItem.id} value={menuItem.id}>
                        {menuItem.name} · {money(menuItem.price)} · {menuItem.category}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Qty">
                  <TextInput type="number" min={1} max={100} value={item.quantity} onChange={(event) => updateDraftItem(item.localId, { quantity: Number(event.target.value) })} />
                </Field>
                <Button variant="ghost" onClick={() => removeDraftItem(item.localId)} disabled={draftItems.length === 1}>Remove</Button>
              </div>
            ))}
          </div>

          <div className="button-row">
            <Button variant="secondary" onClick={addDraftItem}>Add another item</Button>
            <Button onClick={placeOrder} disabled={pendingAction === 'place'}>Place order</Button>
          </div>

          <div className="inline-form">
            <Field label="Track order by ID">
              <TextInput value={manualOrderId} onChange={(event) => setManualOrderId(event.target.value)} placeholder="order id" />
            </Field>
            <Button variant="secondary" onClick={() => trackOrder(manualOrderId)} disabled={pendingAction === 'track' || !manualOrderId}>Track</Button>
          </div>
        </Card>

        <div className="stack">
          {selectedOrder ? (
            <>
              <Card title="Order Summary" subtitle="Selected ticket state, payment status, and remaining bake time.">
                <div className="order-summary">
                  <div className="metric-grid">
                    <div className="metric"><span>Status</span><strong>{selectedEffectiveStatus}</strong></div>
                    <div className="metric"><span>Payment</span><strong>{selectedOrder.payment_status}</strong></div>
                    <div className="metric"><span>Total</span><strong>{money(selectedOrder.total_price)}</strong></div>
                    <div className="metric"><span>Remaining bake</span><strong>{selectedOrderRemaining}</strong></div>
                  </div>
                  <p className="muted">Estimated ready time: {dateTime(selectedOrder.estimated_ready_time)}</p>
                  <p className="muted">Priority: {priorityLabel(selectedOrder.priority_level)}</p>
                </div>
              </Card>

              {selectedOrderTasks.length > 0 && (
                <Card title="Kitchen Tasks" subtitle="Bake tasks attached to the selected order.">
                  <div className="table-wrap compact-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Priority</th>
                          <th>Status</th>
                          <th>Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrderTasks.map((task) => (
                          <tr key={task.id}>
                            <td>{task.name}</td>
                            <td><StatusBadge value={priorityLabel(selectedOrder.priority_level)} tone={priorityTone(selectedOrder.priority_level)} /></td>
                            <td>{isTaskReady(task, kitchenStatus) ? 'ready' : task.oven_id ? 'baking' : 'queued'}</td>
                            <td>
                              {typeof task.remaining_bake_seconds === 'number'
                                ? remainingSeconds(task.remaining_bake_seconds, taskZeroLabel(task, kitchenStatus))
                                : remainingFromKitchenTime(task.finishes_at, kitchenStatus?.current_time, taskZeroLabel(task, kitchenStatus))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              <Card title="Kitchen Simulator" subtitle="Advance the scheduler clock, then use Reload if auto-refresh is disabled.">
                <div className="time-control-card">
                  <div>
                    <strong>Advance kitchen time</strong>
                    <span>Kitchen updates immediately; use Reload to refresh order records on demand.</span>
                  </div>
                  <div className="metric">
                    <span>Kitchen current time</span>
                    <strong>{dateTime(kitchenStatus?.current_time ?? null)}</strong>
                  </div>
                  <div className="time-stepper">
                    <Button variant="secondary" type="button" onClick={() => setAdvanceMinutes((value) => Math.max(0.5, value - 1))}>-</Button>
                    <TextInput type="number" min={0.5} step={0.5} value={advanceMinutes} onChange={(event) => setAdvanceMinutes(Number(event.target.value))} />
                    <Button variant="secondary" type="button" onClick={() => setAdvanceMinutes((value) => value + 1)}>+</Button>
                  </div>
                  <div className="time-presets">
                    <Button variant="secondary" type="button" onClick={() => setAdvanceMinutes(5)}>5m</Button>
                    <Button variant="secondary" type="button" onClick={() => setAdvanceMinutes(10)}>10m</Button>
                    <Button variant="secondary" type="button" onClick={() => setAdvanceMinutes(20)}>20m</Button>
                    <Button variant="ghost" type="button" onClick={() => setAdvanceMinutes((value) => value + 1)}>+1m</Button>
                    <Button type="button" onClick={() => advanceKitchenTimeFromOrder(advanceMinutes)} disabled={pendingAction === 'advance-time'}>
                      Advance {Math.max(1, Math.round(advanceMinutes * 60))}s
                    </Button>
                  </div>
                </div>
              </Card>

              <Card title="Order Actions" subtitle="Verify bill retrieval and item mutation endpoints.">
                <div className="button-row">
                  <Button variant="secondary" onClick={getBill} disabled={pendingAction === 'bill'}>Get bill</Button>
                  <Button variant="secondary" onClick={updateFirstItemQuantity} disabled={pendingAction === 'increment-item' || selectedOrder.items.length === 0}>+1 first item</Button>
                  <Button variant="danger" onClick={removeFirstItem} disabled={pendingAction === 'remove-item' || selectedOrder.items.length === 0}>Remove first item</Button>
                </div>

                <div className="inline-form separated">
                  <Field label="Add item to selected order">
                    <SelectInput value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)}>
                      <option value="">Select menu item...</option>
                      {activeMenu.map((menuItem) => (
                        <option key={menuItem.id} value={menuItem.id}>{menuItem.name}</option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Qty">
                    <TextInput type="number" min={1} value={selectedItemQuantity} onChange={(event) => setSelectedItemQuantity(Number(event.target.value))} />
                  </Field>
                  <Button variant="secondary" onClick={addItemToSelected} disabled={pendingAction === 'add-item' || !selectedItemId}>Add</Button>
                </div>
              </Card>

              <details className="details-panel json-card">
                <summary>Selected order JSON</summary>
                <JsonBlock value={selectedOrder} />
              </details>
            </>
          ) : (
            <Card title="Order Summary" subtitle="Select or create an order to inspect status, payment, ETA, kitchen tasks, and raw JSON.">
              <EmptyState title="No order selected." detail="Place an order or enter an order id to track it." />
            </Card>
          )}
        </div>
      </div>

      <Card
        title="Recent Orders"
        subtitle="Session-local orders; select one to inspect and operate on it."
        actions={<Button variant="secondary" onClick={onReload} disabled={isReloading}>Reload</Button>}
      >
        <div className="table-wrap">
          {orders.length === 0 ? (
            <EmptyState title="No orders created in this UI session." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Total</th>
                  <th>ETA</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const orderTasks = tasksForOrder(order.id);
                  const effectiveStatus = effectiveOrderStatus(order, orderTasks, kitchenStatus);
                  return (
                    <tr key={order.id} className={order.id === selectedOrderId ? 'selected-row' : ''} onClick={() => onSelectedOrderIdChange(order.id)}>
                      <td className="mono">{truncateMiddle(order.id, 22)}</td>
                      <td>{priorityLabel(order.priority_level)}</td>
                      <td><StatusBadge value={effectiveStatus} tone={statusTone(effectiveStatus)} /></td>
                      <td><StatusBadge value={order.payment_status} tone={order.payment_status === 'paid' ? 'success' : 'warning'} /></td>
                      <td>{money(order.total_price)}</td>
                      <td>{remainingFromKitchenTime(order.estimated_ready_time, kitchenStatus?.current_time, orderZeroLabel(order, orderTasks, kitchenStatus))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
