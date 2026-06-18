import { useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Field, SelectInput, TextInput } from '../../components/FormField';
import { JsonBlock } from '../../components/JsonBlock';
import { StatusBadge } from '../../components/StatusBadge';
import { dateTime, money, priorityLabel, remainingFromKitchenTime, remainingSeconds, truncateMiddle } from '../../lib/format';
import type { SnackBuildersApiClient } from '../../api/client';
import type { KitchenStatus, MenuItem, Order, PriorityLevel } from '../../types/domain';

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
  onOrdersChange: (orders: Order[]) => void;
  onSelectedOrderIdChange: (orderId: string) => void;
  onKitchenStatusChange: (status: KitchenStatus) => void;
  onError: (message: string) => void;
}

function upsertOrder(orders: Order[], next: Order): Order[] {
  const exists = orders.some((order) => order.id === next.id);
  if (!exists) return [next, ...orders];
  return orders.map((order) => (order.id === next.id ? next : order));
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
}: OrdersPanelProps) {
  const [priority, setPriority] = useState<PriorityLevel>(3);
  const [draftItems, setDraftItems] = useState<DraftOrderItem[]>([
    { localId: crypto.randomUUID(), menu_item_id: '', quantity: 1 },
  ]);
  const [manualOrderId, setManualOrderId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedItemQuantity, setSelectedItemQuantity] = useState(1);
  const [advanceMinutes, setAdvanceMinutes] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

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
      return remainingSeconds(Math.max(...remainingValues));
    }

    return remainingFromKitchenTime(selectedOrder?.estimated_ready_time, kitchenStatus?.current_time);
  }, [kitchenStatus?.current_time, selectedOrder?.estimated_ready_time, selectedOrderTasks]);

  const activeMenu = menu.filter((item) => item.is_active);

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

    setIsLoading(true);
    try {
      const order = await api.placeOrder({ priority_level: priority, items });
      onOrdersChange(upsertOrder(orders, order));
      onSelectedOrderIdChange(order.id);
      setManualOrderId(order.id);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function trackOrder(orderId = selectedOrderId || manualOrderId) {
    if (!orderId) {
      onError('Enter or select an order id.');
      return;
    }
    setIsLoading(true);
    try {
      const order = await api.trackOrder(orderId);
      onOrdersChange(upsertOrder(orders, order));
      onSelectedOrderIdChange(order.id);
      setManualOrderId(order.id);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function getBill() {
    if (!selectedOrderId) {
      onError('Select an order first.');
      return;
    }
    setIsLoading(true);
    try {
      await api.getBill(selectedOrderId);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function addItemToSelected() {
    if (!selectedOrderId || !selectedItemId) {
      onError('Select an order and a menu item first.');
      return;
    }
    setIsLoading(true);
    try {
      const order = await api.addOrderItem(selectedOrderId, selectedItemId, selectedItemQuantity);
      onOrdersChange(upsertOrder(orders, order));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function updateFirstItemQuantity() {
    if (!selectedOrder || selectedOrder.items.length === 0) return;
    setIsLoading(true);
    try {
      const firstItem = selectedOrder.items[0];
      if (!firstItem) return;
      const order = await api.updateOrderItemQuantity(selectedOrder.id, firstItem.id, Math.max(1, firstItem.quantity + 1));
      onOrdersChange(upsertOrder(orders, order));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function removeFirstItem() {
    if (!selectedOrder || selectedOrder.items.length === 0) return;
    setIsLoading(true);
    try {
      const firstItem = selectedOrder.items[0];
      if (!firstItem) return;
      const order = await api.removeOrderItem(selectedOrder.id, firstItem.id);
      onOrdersChange(upsertOrder(orders, order));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function advanceKitchenTimeFromOrder(minutes: number) {
    const seconds = Math.max(1, Math.round(minutes * 60));
    setIsLoading(true);
    try {
      const kitchen = await api.advanceKitchenTime(seconds);
      onKitchenStatusChange(kitchen);

      const orderId = selectedOrderId || manualOrderId;
      if (orderId) {
        const refreshedOrder = await api.trackOrder(orderId);
        onOrdersChange(upsertOrder(orders, refreshedOrder));
        onSelectedOrderIdChange(refreshedOrder.id);
        setManualOrderId(refreshedOrder.id);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card
      title="Order Placement & Tracking"
      subtitle="Build multi-item tickets, verify total price, estimated_ready_time, status tracking, and item modification behavior."
    >
      <div className="grid grid-2">
        <div className="stack">
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
            <Button onClick={placeOrder} disabled={isLoading}>Place order</Button>
          </div>

          <div className="inline-form">
            <Field label="Track order by ID">
              <TextInput value={manualOrderId} onChange={(event) => setManualOrderId(event.target.value)} placeholder="order id" />
            </Field>
            <Button variant="secondary" onClick={() => trackOrder(manualOrderId)} disabled={isLoading || !manualOrderId}>Track</Button>
          </div>
        </div>

        <div className="stack">
          {selectedOrder ? (
            <div className="order-summary">
              <div className="metric-grid">
                <div className="metric"><span>Status</span><strong>{selectedOrder.status}</strong></div>
                <div className="metric"><span>Payment</span><strong>{selectedOrder.payment_status}</strong></div>
                <div className="metric"><span>Total</span><strong>{money(selectedOrder.total_price)}</strong></div>
                <div className="metric"><span>Remaining bake</span><strong>{selectedOrderRemaining}</strong></div>
              </div>
              <p className="muted">Estimated ready time: {dateTime(selectedOrder.estimated_ready_time)}</p>
              <p className="muted">Priority: {priorityLabel(selectedOrder.priority_level)}</p>
              {selectedOrderTasks.length > 0 && (
                <div className="table-wrap compact-table">
                  <h3>Kitchen tasks for this order</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Status</th>
                        <th>Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrderTasks.map((task) => (
                        <tr key={task.id}>
                          <td>{task.name}</td>
                          <td>{task.oven_id ? 'baking' : 'queued'}</td>
                          <td>
                            {typeof task.remaining_bake_seconds === 'number'
                              ? remainingSeconds(task.remaining_bake_seconds)
                              : remainingFromKitchenTime(task.finishes_at, kitchenStatus?.current_time)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="time-control-card">
                <div>
                  <strong>Advance kitchen time</strong>
                  <span>Auto-refresh keeps oven state and this order in sync.</span>
                </div>
                <div className="metric">
                  <span>Kitchen current time</span>
                  <strong>{dateTime(kitchenStatus?.current_time ?? null)}</strong>
                </div>
                <div className="time-stepper">
                  <Button variant="secondary" type="button" onClick={() => setAdvanceMinutes((value) => Math.max(0.5, value - 1))} disabled={isLoading}>-</Button>
                  <TextInput type="number" min={0.5} step={0.5} value={advanceMinutes} onChange={(event) => setAdvanceMinutes(Number(event.target.value))} />
                  <Button variant="secondary" type="button" onClick={() => setAdvanceMinutes((value) => value + 1)} disabled={isLoading}>+</Button>
                </div>
                <div className="time-presets">
                  <Button variant="secondary" type="button" onClick={() => setAdvanceMinutes(5)} disabled={isLoading}>5m</Button>
                  <Button variant="secondary" type="button" onClick={() => setAdvanceMinutes(10)} disabled={isLoading}>10m</Button>
                  <Button variant="secondary" type="button" onClick={() => setAdvanceMinutes(20)} disabled={isLoading}>20m</Button>
                  <Button variant="ghost" type="button" onClick={() => setAdvanceMinutes((value) => value + 1)} disabled={isLoading}>+1m</Button>
                  <Button type="button" onClick={() => advanceKitchenTimeFromOrder(advanceMinutes)} disabled={isLoading}>
                    Advance {Math.max(1, Math.round(advanceMinutes * 60))}s
                  </Button>
                </div>
              </div>
              <div className="button-row">
                <Button variant="secondary" onClick={getBill} disabled={isLoading}>Get bill</Button>
                <Button variant="secondary" onClick={updateFirstItemQuantity} disabled={isLoading || selectedOrder.items.length === 0}>+1 first item</Button>
                <Button variant="danger" onClick={removeFirstItem} disabled={isLoading || selectedOrder.items.length === 0}>Remove first item</Button>
              </div>

              <div className="inline-form">
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
                <Button variant="secondary" onClick={addItemToSelected} disabled={isLoading || !selectedItemId}>Add</Button>
              </div>

              <details className="details-panel" open>
                <summary>Selected order JSON</summary>
                <JsonBlock value={selectedOrder} />
              </details>
            </div>
          ) : (
            <EmptyState title="No order selected." detail="Place an order or enter an order id to track it." />
          )}
        </div>
      </div>

      <div className="table-wrap separated">
        <h3>Recent orders</h3>
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
              {orders.map((order) => (
                <tr key={order.id} className={order.id === selectedOrderId ? 'selected-row' : ''} onClick={() => onSelectedOrderIdChange(order.id)}>
                  <td className="mono">{truncateMiddle(order.id, 22)}</td>
                  <td>{priorityLabel(order.priority_level)}</td>
                  <td><StatusBadge value={order.status} tone={order.status === 'ready' ? 'success' : order.status === 'baking' ? 'warning' : 'neutral'} /></td>
                  <td><StatusBadge value={order.payment_status} tone={order.payment_status === 'paid' ? 'success' : 'warning'} /></td>
                  <td>{money(order.total_price)}</td>
                  <td>{remainingFromKitchenTime(order.estimated_ready_time, kitchenStatus?.current_time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
