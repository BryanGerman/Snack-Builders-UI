import { useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Field, TextInput } from '../../components/FormField';
import { JsonBlock } from '../../components/JsonBlock';
import { StatusBadge } from '../../components/StatusBadge';
import { categoryLabel, dateTime, priorityLabel, remainingFromKitchenTime, truncateMiddle } from '../../lib/format';
import type { SnackBuildersApiClient } from '../../api/client';
import type { KitchenStatus, KitchenTask, Order } from '../../types/domain';

interface KitchenPanelProps {
  api: SnackBuildersApiClient;
  kitchenStatus: KitchenStatus | null;
  orders: Order[];
  onKitchenStatusChange: (status: KitchenStatus) => void;
  onError: (message: string) => void;
}

function taskForSlot(tasks: KitchenTask[], ovenIndex: number, slotIndex: number): KitchenTask | undefined {
  const normalizedOvenIds = [`oven-${ovenIndex + 1}`, `oven_${ovenIndex + 1}`, String(ovenIndex + 1), `Oven ${ovenIndex + 1}`];
  return tasks.find((task) => {
    const slotMatches = task.slot_number === slotIndex + 1 || task.slot_number === slotIndex;
    const ovenMatches = task.oven_id ? normalizedOvenIds.includes(task.oven_id) : false;
    return slotMatches && ovenMatches;
  });
}

function fallbackSlotTasks(status: KitchenStatus, ovenIndex: number, slotIndex: number): KitchenTask | undefined {
  const flatIndex = ovenIndex * status.slots_per_oven + slotIndex;
  return status.active_tasks[flatIndex];
}

function priorityTone(priority: number): 'vip' | 'warning' | 'neutral' {
  if (priority === 1) return 'vip';
  if (priority === 2) return 'warning';
  return 'neutral';
}

export function KitchenPanel({ api, kitchenStatus, orders, onKitchenStatusChange, onError }: KitchenPanelProps) {
  const [manualOrderId, setManualOrderId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const queuedByPriority = useMemo(() => {
    if (!kitchenStatus) return [];
    return [...kitchenStatus.queued_tasks].sort((a, b) => a.priority_level - b.priority_level || a.sequence - b.sequence);
  }, [kitchenStatus]);

  async function scheduleOrder(orderId: string) {
    if (!orderId) {
      onError('Enter or select an order id.');
      return;
    }
    setIsLoading(true);
    try {
      onKitchenStatusChange(await api.scheduleOrder(orderId));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card
      title="Priority-Based Kitchen Scheduler"
      subtitle="Auto-monitors 2 ovens x 3 slots, active bakes, waiting queue, priority ordering, and updated ETAs."
    >
      {kitchenStatus ? (
        <>
          <div className="metric-grid kitchen-metrics">
            <div className="metric"><span>Ovens</span><strong>{kitchenStatus.ovens}</strong></div>
            <div className="metric"><span>Slots / oven</span><strong>{kitchenStatus.slots_per_oven}</strong></div>
            <div className="metric"><span>Total capacity</span><strong>{kitchenStatus.total_slots}</strong></div>
            <div className="metric"><span>Queued</span><strong>{kitchenStatus.queued_tasks.length}</strong></div>
            <div className="metric metric-wide"><span>Kitchen current time</span><strong>{dateTime(kitchenStatus.current_time ?? null)}</strong></div>
          </div>

          <div className="oven-grid">
            {Array.from({ length: kitchenStatus.ovens }).map((_, ovenIndex) => (
              <section className="oven-card" key={ovenIndex}>
                <h3>Oven {ovenIndex + 1}</h3>
                <div className="slot-grid">
                  {Array.from({ length: kitchenStatus.slots_per_oven }).map((__, slotIndex) => {
                    const task = taskForSlot(kitchenStatus.active_tasks, ovenIndex, slotIndex) ?? fallbackSlotTasks(kitchenStatus, ovenIndex, slotIndex);
                    return (
                      <div className={`oven-slot ${task ? 'slot-active' : ''}`} key={slotIndex}>
                        <span className="slot-title">Tray {slotIndex + 1}</span>
                        {task ? (
                          <>
                            <strong>{task.name}</strong>
                            <span>{categoryLabel(task.category)}</span>
                            <StatusBadge value={priorityLabel(task.priority_level)} tone={priorityTone(task.priority_level)} />
                            <small>Finishes {remainingFromKitchenTime(task.finishes_at, kitchenStatus.current_time)}</small>
                          </>
                        ) : (
                          <span className="muted">Available</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="grid grid-2 separated">
            <div className="table-wrap">
              <h3>Waiting queue · priority sorted</h3>
              {queuedByPriority.length === 0 ? (
                <EmptyState title="No queued tasks." detail="Fill all 6 slots, then place a VIP order to inspect queue reshuffling." />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Seq</th>
                      <th>Task</th>
                      <th>Priority</th>
                      <th>Bake</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queuedByPriority.map((task) => (
                      <tr key={task.id}>
                        <td>{task.sequence}</td>
                        <td>
                          <strong>{task.name}</strong>
                          <small className="mono">{truncateMiddle(task.order_id, 18)}</small>
                        </td>
                        <td><StatusBadge value={priorityLabel(task.priority_level)} tone={priorityTone(task.priority_level)} /></td>
                        <td>{task.bake_time_minutes} min</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="stack">
              <div className="inline-form">
                <Field label="Schedule order manually">
                  <TextInput value={manualOrderId} onChange={(event) => setManualOrderId(event.target.value)} placeholder="order id" />
                </Field>
                <Button onClick={() => scheduleOrder(manualOrderId)} disabled={isLoading || !manualOrderId}>Schedule</Button>
              </div>

              <div className="table-wrap compact-table">
                <h3>Orders from this session</h3>
                {orders.length === 0 ? (
                  <EmptyState title="No orders yet." />
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Priority</th>
                        <th>ETA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id} onClick={() => setManualOrderId(order.id)}>
                          <td className="mono">{truncateMiddle(order.id, 18)}</td>
                          <td>{priorityLabel(order.priority_level)}</td>
                          <td>{dateTime(order.estimated_ready_time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <details className="details-panel separated">
            <summary>Raw kitchen status JSON</summary>
            <JsonBlock value={kitchenStatus} />
          </details>
        </>
      ) : (
        <EmptyState title="Kitchen status not loaded." detail="Add the credential once; the UI auto-refreshes kitchen state in the background." />
      )}
    </Card>
  );
}
