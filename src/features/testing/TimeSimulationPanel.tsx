import { useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Field, TextInput } from '../../components/FormField';
import { JsonBlock } from '../../components/JsonBlock';
import { dateTime } from '../../lib/format';
import type { SnackBuildersApiClient } from '../../api/client';
import type { KitchenStatus, Order, TestStepResult } from '../../types/domain';

interface TimeSimulationPanelProps {
  api: SnackBuildersApiClient;
  orders: Order[];
  onOrdersChange: (orders: Order[]) => void;
  onKitchenStatusChange: (status: KitchenStatus) => void;
  onResult: (result: TestStepResult) => void;
  onError: (message: string) => void;
}

function upsertOrders(current: Order[], next: Order[]) {
  const updates = new Map(next.map((order) => [order.id, order]));
  const merged = current.map((order) => updates.get(order.id) ?? order);
  const existingIds = new Set(current.map((order) => order.id));
  return [...next.filter((order) => !existingIds.has(order.id)), ...merged];
}

export function TimeSimulationPanel({
  api,
  orders,
  onOrdersChange,
  onKitchenStatusChange,
  onResult,
  onError,
}: TimeSimulationPanelProps) {
  const [minutes, setMinutes] = useState(5);
  const [lastResponse, setLastResponse] = useState<KitchenStatus | null>(null);
  const [trackedOrders, setTrackedOrders] = useState<Order[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const seconds = useMemo(() => Math.max(1, Math.round(Number(minutes || 0) * 60)), [minutes]);

  function adjustMinutes(delta: number) {
    setMinutes((current) => Math.max(0.5, Number((Number(current || 0) + delta).toFixed(1))));
  }

  async function refreshOrders(currentOrders: Order[]) {
    const tracked: Order[] = [];
    for (const order of currentOrders) {
      try {
        tracked.push(await api.trackOrder(order.id));
      } catch {
        tracked.push(order);
      }
    }

    setTrackedOrders(tracked);
    if (tracked.length) {
      onOrdersChange(upsertOrders(currentOrders, tracked));
    }
    return tracked;
  }

  async function advanceTime() {
    setIsRunning(true);
    try {
      const kitchen = await api.advanceKitchenTime(seconds);
      onKitchenStatusChange(kitchen);
      setLastResponse(kitchen);
      const refreshed = await refreshOrders(orders);
      onResult({
        name: `Kitchen time advanced ${seconds} seconds`,
        ok: true,
        detail: `Current kitchen time: ${dateTime(kitchen.current_time ?? null)}`,
        payload: { request: { seconds }, kitchen, tracked_orders: refreshed },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onResult({ name: 'Kitchen time advance failed', ok: false, detail: message, payload: { request: { seconds } } });
      onError(message);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Card
      title="Kitchen Time Simulation"
      subtitle="Advance the kitchen scheduler clock using POST /kitchen/time/advance, then refresh ovens, queue, current_time, and visible orders."
      actions={
        <Button onClick={advanceTime} disabled={isRunning}>
          Advance {seconds}s
        </Button>
      }
    >
      <div className="grid grid-2">
        <div className="stack">
          <div className="grid grid-2">
            <Field label="Minutes to advance" hint="5 minutes sends { seconds: 300 }.">
              <div className="time-stepper">
                <Button variant="secondary" type="button" onClick={() => adjustMinutes(-1)} disabled={isRunning}>-</Button>
                <TextInput type="number" min={0.5} step="0.5" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} />
                <Button variant="secondary" type="button" onClick={() => adjustMinutes(1)} disabled={isRunning}>+</Button>
              </div>
            </Field>
            <div className="metric">
              <span>Request body</span>
              <strong className="mono">{`{ "seconds": ${seconds} }`}</strong>
            </div>
          </div>

          <div className="time-presets" aria-label="Bake time presets">
            <Button variant="secondary" type="button" onClick={() => setMinutes(5)} disabled={isRunning}>Cookies 5m</Button>
            <Button variant="secondary" type="button" onClick={() => setMinutes(10)} disabled={isRunning}>Pastries 10m</Button>
            <Button variant="secondary" type="button" onClick={() => setMinutes(20)} disabled={isRunning}>Breads 20m</Button>
            <Button variant="ghost" type="button" onClick={() => adjustMinutes(5)} disabled={isRunning}>+5m</Button>
          </div>

          <div className="info-callout">
            <strong>Dev/demo endpoint:</strong> requires a token with <span className="mono">kitchen:write</span>. In production the backend may return 403 because time simulation is disabled.
          </div>

          {trackedOrders.length > 0 && (
            <div className="table-wrap compact-table">
              <h3>Orders refreshed after time advance</h3>
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Status</th>
                    <th>ETA</th>
                  </tr>
                </thead>
                <tbody>
                  {trackedOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="mono">{order.id}</td>
                      <td>{order.status}</td>
                      <td>{dateTime(order.estimated_ready_time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <details className="details-panel" open>
          <summary>Last kitchen time response</summary>
          <JsonBlock value={lastResponse ?? { message: 'No kitchen time advance run yet.', endpoint: 'POST /kitchen/time/advance' }} />
        </details>
      </div>
    </Card>
  );
}
