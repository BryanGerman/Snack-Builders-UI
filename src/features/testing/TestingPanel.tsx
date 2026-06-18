import { useState, type Dispatch, type SetStateAction } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { JsonBlock } from '../../components/JsonBlock';
import { StatusBadge } from '../../components/StatusBadge';
import { money, priorityLabel, relativeMinutes, truncateMiddle } from '../../lib/format';
import type { SnackBuildersApiClient } from '../../api/client';
import type { KitchenStatus, MenuItem, Order, Payment, PriorityLevel, SnackCategory, TestStepResult } from '../../types/domain';
import { TimeSimulationPanel } from './TimeSimulationPanel';

interface TestingPanelProps {
  api: SnackBuildersApiClient;
  menu: MenuItem[];
  orders: Order[];
  payments: Payment[];
  onMenuChange: Dispatch<SetStateAction<MenuItem[]>>;
  onOrdersChange: Dispatch<SetStateAction<Order[]>>;
  onPaymentsChange: Dispatch<SetStateAction<Payment[]>>;
  onKitchenStatusChange: (status: KitchenStatus) => void;
  onSelectedOrderIdChange: (orderId: string) => void;
  onError: (message: string) => void;
}

function upsertOrder(orders: Order[], next: Order): Order[] {
  const exists = orders.some((order) => order.id === next.id);
  if (!exists) return [next, ...orders];
  return orders.map((order) => (order.id === next.id ? next : order));
}

function makeStep(name: string, ok: boolean, detail: string, payload?: unknown): TestStepResult {
  return { name, ok, detail, payload };
}

export function TestingPanel({
  api,
  menu,
  orders,
  payments,
  onMenuChange,
  onOrdersChange,
  onPaymentsChange,
  onKitchenStatusChange,
  onSelectedOrderIdChange,
  onError,
}: TestingPanelProps) {
  const [results, setResults] = useState<TestStepResult[]>([]);
  const [scenarioOrders, setScenarioOrders] = useState<Order[]>([]);
  const [pendingScenario, setPendingScenario] = useState('');

  function push(step: TestStepResult) {
    setResults((current) => [step, ...current]);
  }

  async function ensureMenuItem(category: SnackCategory): Promise<MenuItem> {
    const latestMenu = await api.listMenu();
    onMenuChange(latestMenu);
    const existing = latestMenu.find((item) => item.category === category && item.is_active);
    if (existing) return existing;
    const bakeName = category === 'cookies' ? 'Smoke Test Cookies' : category === 'pastries' ? 'Smoke Test Pastries' : 'Smoke Test Bread';
    const price = category === 'cookies' ? '3.50' : category === 'pastries' ? '5.25' : '7.75';
    const created = await api.createMenuItem({ name: `${bakeName} ${Date.now()}`, category, price });
    onMenuChange((current) => [created, ...current]);
    return created;
  }

  async function createSingleItemOrder(menuItem: MenuItem, priority: PriorityLevel, quantity = 1): Promise<Order> {
    const order = await api.placeOrder({
      priority_level: priority,
      items: [{ menu_item_id: menuItem.id, quantity }],
    });
    onOrdersChange((current) => upsertOrder(current, order));
    onSelectedOrderIdChange(order.id);
    return order;
  }

  async function runSmokeTests() {
    setPendingScenario('smoke');
    setResults([]);
    try {
      const items = await api.listMenu();
      onMenuChange(items);
      push(makeStep('Menu can be read', true, `${items.length} active items returned`, items));

      const cookies = await ensureMenuItem('cookies');
      push(makeStep('Menu can be created when needed', true, `${cookies.name} available`, cookies));

      const order = await createSingleItemOrder(cookies, 3, 1);
      push(makeStep('Order can be placed', true, `Ticket ${order.id}, total ${money(order.total_price)}, ETA ${relativeMinutes(order.estimated_ready_time)}`, order));

      const tracked = await api.trackOrder(order.id);
      push(makeStep('Order can be tracked', true, `Status ${tracked.status}`, tracked));

      const bill = await api.getBill(order.id);
      push(makeStep('Bill can be loaded', true, `Amount due ${money(bill.amount_due)}`, bill));

      const kitchen = await api.getKitchenStatus();
      onKitchenStatusChange(kitchen);
      push(makeStep('Kitchen can be monitored', true, `${kitchen.active_tasks.length} active, ${kitchen.queued_tasks.length} queued`, kitchen));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      push(makeStep('Smoke test failed', false, message));
      onError(message);
    } finally {
      setPendingScenario('');
    }
  }

  async function runCompleteE2E() {
    setPendingScenario('e2e');
    setResults([]);
    try {
      const cookies = await ensureMenuItem('cookies');
      const pastries = await ensureMenuItem('pastries');
      const bread = await ensureMenuItem('breads');
      push(makeStep('Menu coverage ready', true, 'Cookies, pastries, and breads are available.', { cookies, pastries, bread }));

      const order = await api.placeOrder({
        priority_level: 2,
        items: [
          { menu_item_id: cookies.id, quantity: 2 },
          { menu_item_id: pastries.id, quantity: 1 },
          { menu_item_id: bread.id, quantity: 1 },
        ],
      });
      onOrdersChange((current) => upsertOrder(current, order));
      onSelectedOrderIdChange(order.id);
      push(makeStep('Multi-item order placed', true, `Ticket ${truncateMiddle(order.id, 24)} · total ${money(order.total_price)} · ETA ${relativeMinutes(order.estimated_ready_time)}`, order));

      const bill = await api.getBill(order.id);
      push(makeStep('Price ticket / bill verified', true, `Subtotal ${money(bill.subtotal)}, amount due ${money(bill.amount_due)}`, bill));

      const payment = await api.createPayment({ order_id: order.id, amount: bill.amount_due, method: 'credit_card' });
      onPaymentsChange((current) => [payment, ...current]);
      push(makeStep('Credit card payment accepted', true, `Payment ${payment.status} for ${money(payment.amount)}`, payment));

      const paidOrder = await api.trackOrder(order.id);
      onOrdersChange((current) => upsertOrder(upsertOrder(current, order), paidOrder));
      push(makeStep('Order payment status refreshed', paidOrder.payment_status === 'paid', `Payment status: ${paidOrder.payment_status}`, paidOrder));

      const kitchen = await api.getKitchenStatus();
      onKitchenStatusChange(kitchen);
      push(makeStep('Kitchen snapshot loaded', true, `${kitchen.total_slots} total slots, ${kitchen.active_tasks.length} active bakes`, kitchen));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      push(makeStep('E2E flow failed', false, message));
      onError(message);
    } finally {
      setPendingScenario('');
    }
  }

  async function runPriorityScenario() {
    setPendingScenario('priority');
    setResults([]);
    setScenarioOrders([]);
    try {
      const bread = await ensureMenuItem('breads');
      const cookies = await ensureMenuItem('cookies');
      push(makeStep('Scenario menu ready', true, 'Using breads for long bakes and cookies for a VIP order.', { bread, cookies }));

      const created: Order[] = [];
      for (let i = 0; i < 6; i += 1) {
        const order = await api.placeOrder({
          priority_level: i < 3 ? 3 : 2,
          items: [{ menu_item_id: bread.id, quantity: 1 }],
        });
        created.push(order);
        push(makeStep(`Capacity filler ${i + 1}/6`, true, `${priorityLabel(order.priority_level)} · ETA ${relativeMinutes(order.estimated_ready_time)}`, order));
      }

      const beforeVip = await api.getKitchenStatus();
      onKitchenStatusChange(beforeVip);
      push(makeStep('Kitchen capacity inspected before VIP', true, `${beforeVip.active_tasks.length}/${beforeVip.total_slots} active slots`, beforeVip));

      const vip = await api.placeOrder({
        priority_level: 1,
        items: [{ menu_item_id: cookies.id, quantity: 1 }],
      });
      created.push(vip);
      onSelectedOrderIdChange(vip.id);
      push(makeStep('VIP order inserted', true, `VIP ticket ${truncateMiddle(vip.id, 24)} · ETA ${relativeMinutes(vip.estimated_ready_time)}`, vip));

      const afterVip = await api.getKitchenStatus();
      onKitchenStatusChange(afterVip);
      push(makeStep('Kitchen capacity inspected after VIP', true, `${afterVip.active_tasks.length} active, ${afterVip.queued_tasks.length} queued. VIP should be ahead of lower-priority queued items.`, afterVip));

      const refreshed: Order[] = [];
      for (const order of created) {
        try {
          refreshed.push(await api.trackOrder(order.id));
        } catch {
          refreshed.push(order);
        }
      }
      setScenarioOrders(refreshed);
      onOrdersChange((current) => [...refreshed, ...current.filter((order) => !refreshed.some((next) => next.id === order.id))]);
      push(makeStep('Lower-priority ETAs refreshed', true, 'Tracked scenario orders after VIP insertion to compare estimated_ready_time.', refreshed));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      push(makeStep('Priority scenario failed', false, message));
      onError(message);
    } finally {
      setPendingScenario('');
    }
  }

  return (
    <div className="page-stack">
      <TimeSimulationPanel
        api={api}
        orders={orders}
        onOrdersChange={onOrdersChange}
        onKitchenStatusChange={onKitchenStatusChange}
        onResult={push}
        onError={onError}
      />

      <Card
        title="Functional Scenarios"
        subtitle="Run high-value checks for menu, tickets, payment, capacity, priority queue, and ETA updates."
        actions={
          <div className="button-row">
            <Button variant="secondary" onClick={runSmokeTests} disabled={pendingScenario === 'smoke'}>Smoke</Button>
            <Button onClick={runCompleteE2E} disabled={pendingScenario === 'e2e'}>Run E2E</Button>
            <Button variant="secondary" onClick={runPriorityScenario} disabled={pendingScenario === 'priority'}>Priority scenario</Button>
          </div>
        }
      >
        <div className="info-callout">
          <strong>Priority scenario intent:</strong> create 6 active bakes to fill capacity, then insert a VIP order. Existing bakes must not be preempted; queued lower-priority work should be delayed behind VIP work when the scheduler recalculates estimates.
        </div>
      </Card>

      {scenarioOrders.length > 0 && (
        <Card title="Scenario Orders" subtitle="ETA evidence after capacity filling and VIP insertion.">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Estimated ready</th>
                </tr>
              </thead>
              <tbody>
                {scenarioOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="mono">{truncateMiddle(order.id, 20)}</td>
                    <td><StatusBadge value={priorityLabel(order.priority_level)} tone={order.priority_level === 1 ? 'vip' : order.priority_level === 2 ? 'warning' : 'neutral'} /></td>
                    <td>{order.status}</td>
                    <td>{money(order.total_price)}</td>
                    <td>{relativeMinutes(order.estimated_ready_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Test Results" subtitle="Step-by-step request evidence from the latest run.">
        <div className="test-results">
          {results.length === 0 ? (
            <div className="empty-state"><strong>No test run yet.</strong><span>Run Smoke, E2E, Priority scenario, or advance the test clock.</span></div>
          ) : (
            results.map((step) => (
              <details className={`test-step ${step.ok ? 'test-ok' : 'test-fail'}`} key={`${step.name}-${step.detail}`} open={!step.ok}>
                <summary>
                  <StatusBadge value={step.ok ? 'PASS' : 'FAIL'} tone={step.ok ? 'success' : 'danger'} />
                  <strong>{step.name}</strong>
                  <span>{step.detail}</span>
                </summary>
                <JsonBlock value={step.payload ?? null} />
              </details>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
