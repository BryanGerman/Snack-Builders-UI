import { useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Field, TextInput } from '../../components/FormField';
import { JsonBlock } from '../../components/JsonBlock';
import { StatusBadge } from '../../components/StatusBadge';
import { categoryLabel, dateTime, priorityLabel, remainingFromKitchenTime, remainingSeconds, truncateMiddle } from '../../lib/format';
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

function isTaskReady(task: KitchenTask, kitchenStatus: KitchenStatus): boolean {
  if (typeof task.remaining_bake_seconds === 'number') {
    return task.remaining_bake_seconds <= 0;
  }

  if (!task.finishes_at) return false;
  const finishesAt = new Date(task.finishes_at).getTime();
  const current = kitchenStatus.current_time ? new Date(kitchenStatus.current_time).getTime() : Date.now();
  return Number.isFinite(finishesAt) && Number.isFinite(current) && finishesAt <= current;
}

function taskRemaining(task: KitchenTask, kitchenStatus: KitchenStatus): string {
  const zeroLabel = isTaskReady(task, kitchenStatus) ? 'ready now' : task.oven_id ? 'finishing...' : 'queued';

  if (task.remaining_bake_seconds !== null && task.remaining_bake_seconds !== undefined) {
    return remainingSeconds(task.remaining_bake_seconds, zeroLabel);
  }

  return remainingFromKitchenTime(task.finishes_at, kitchenStatus.current_time, zeroLabel);
}

function orderIsTerminal(order: Order): boolean {
  return order.status === 'ready' || order.status === 'cancelled';
}

function kitchenOrderState(order: Order, unscheduledOrders: Order[]): { value: string; tone: 'success' | 'warning' | 'neutral' } {
  if (orderIsTerminal(order)) return { value: order.status, tone: 'neutral' };
  if (unscheduledOrders.some((pending) => pending.id === order.id)) return { value: 'not scheduled', tone: 'warning' };
  return { value: 'scheduled', tone: 'success' };
}

export function KitchenPanel({ api, kitchenStatus, orders, onKitchenStatusChange, onError }: KitchenPanelProps) {
  const [manualOrderId, setManualOrderId] = useState('');
  const [pendingAction, setPendingAction] = useState('');

  const queuedByPriority = useMemo(() => {
    if (!kitchenStatus) return [];
    return [...kitchenStatus.queued_tasks].sort((a, b) => a.priority_level - b.priority_level || a.sequence - b.sequence);
  }, [kitchenStatus]);

  const unscheduledOrders = useMemo(() => {
    if (!kitchenStatus) return [];
    const scheduledOrderIds = new Set([...kitchenStatus.active_tasks, ...kitchenStatus.queued_tasks].map((task) => task.order_id));
    return orders.filter((order) => !orderIsTerminal(order) && !scheduledOrderIds.has(order.id));
  }, [kitchenStatus, orders]);

  async function scheduleOrder(orderId: string) {
    if (!orderId) {
      onError('Enter or select an order id.');
      return;
    }
    setPendingAction('schedule');
    try {
      onKitchenStatusChange(await api.scheduleOrder(orderId));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction('');
    }
  }

  async function schedulePendingOrders() {
    if (unscheduledOrders.length === 0) return;
    setPendingAction('schedule-pending');
    const failures: string[] = [];
    let latestStatus: KitchenStatus | null = null;

    try {
      for (const order of unscheduledOrders) {
        try {
          latestStatus = await api.scheduleOrder(order.id);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
        }
      }

      try {
        latestStatus = await api.getKitchenStatus();
      } catch {
        // Keep the latest schedule response if a final read is temporarily unavailable.
      }

      if (latestStatus) {
        onKitchenStatusChange(latestStatus);
      }

      if (failures.length === unscheduledOrders.length) {
        onError(failures[0] ?? 'Pending orders could not be scheduled.');
      }
    } finally {
      setPendingAction('');
    }
  }

  return (
    <div className="page-stack">
      {kitchenStatus ? (
        <>
          <Card title="Kitchen Capacity" subtitle="Auto-monitored scheduler state for 2 ovens x 3 slots.">
            <div className="metric-grid">
              <div className="metric"><span>Ovens</span><strong>{kitchenStatus.ovens}</strong></div>
              <div className="metric"><span>Slots / oven</span><strong>{kitchenStatus.slots_per_oven}</strong></div>
              <div className="metric"><span>Total capacity</span><strong>{kitchenStatus.total_slots}</strong></div>
              <div className="metric"><span>Active bakes</span><strong>{kitchenStatus.active_tasks.length}</strong></div>
              <div className="metric"><span>Queued</span><strong>{kitchenStatus.queued_tasks.length}</strong></div>
              <div className="metric metric-wide"><span>Kitchen current time</span><strong>{dateTime(kitchenStatus.current_time ?? null)}</strong></div>
            </div>
          </Card>

          <Card title="Oven Slots" subtitle="Active bakes cannot be preempted; each tray shows priority and remaining bake time.">
            {unscheduledOrders.length > 0 && kitchenStatus.active_tasks.length === 0 && kitchenStatus.queued_tasks.length === 0 && (
              <div className="info-callout kitchen-alert">
                <strong>{unscheduledOrders.length} session orders are not in the kitchen scheduler.</strong>
                <span> Schedule pending orders to fill ovens and validate capacity behavior.</span>
              </div>
            )}
            <div className="oven-grid">
              {Array.from({ length: kitchenStatus.ovens }).map((_, ovenIndex) => (
                <section className="oven-card" key={ovenIndex}>
                  <h3>Oven {ovenIndex + 1}</h3>
                  <div className="slot-grid">
                    {Array.from({ length: kitchenStatus.slots_per_oven }).map((__, slotIndex) => {
                      const task = taskForSlot(kitchenStatus.active_tasks, ovenIndex, slotIndex) ?? fallbackSlotTasks(kitchenStatus, ovenIndex, slotIndex);
                      const taskReady = task ? isTaskReady(task, kitchenStatus) : false;
                      return (
                        <div className={`oven-slot ${task ? 'slot-active' : ''} ${taskReady ? 'slot-ready' : ''}`} key={slotIndex}>
                          <span className="slot-title">Tray {slotIndex + 1}</span>
                          {task ? (
                            <>
                              <strong>{task.name}</strong>
                              <span>{categoryLabel(task.category)}</span>
                              <StatusBadge value={priorityLabel(task.priority_level)} tone={priorityTone(task.priority_level)} />
                              {taskReady && <StatusBadge value="ready" tone="success" />}
                              <small>{taskRemaining(task, kitchenStatus)}</small>
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
          </Card>

          <div className="workspace-grid">
            <Card title="Waiting Queue" subtitle="Priority-sorted tasks waiting for the next available oven slot.">
              <div className="table-wrap">
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
                        <th>Remaining</th>
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
                          <td>{taskRemaining(task, kitchenStatus)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>

            <div className="stack">
              <Card title="Manual Scheduling" subtitle="Diagnostic endpoint for scheduling an existing order.">
                <div className="inline-form">
                  <Field label="Schedule order manually">
                    <TextInput value={manualOrderId} onChange={(event) => setManualOrderId(event.target.value)} placeholder="order id" />
                  </Field>
                  <Button onClick={() => scheduleOrder(manualOrderId)} disabled={pendingAction === 'schedule' || !manualOrderId}>Schedule</Button>
                </div>
                <div className="button-row separated">
                  <Button
                    variant="secondary"
                    onClick={schedulePendingOrders}
                    disabled={pendingAction === 'schedule-pending' || unscheduledOrders.length === 0}
                  >
                    Schedule pending orders ({unscheduledOrders.length})
                  </Button>
                </div>
              </Card>

              <Card title="Session Orders" subtitle="Click an order to stage it for manual scheduling.">
                <div className="table-wrap compact-table">
                  {orders.length === 0 ? (
                    <EmptyState title="No orders yet." />
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Priority</th>
                          <th>Kitchen</th>
                          <th>ETA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((order) => {
                          const kitchenState = kitchenOrderState(order, unscheduledOrders);
                          return (
                            <tr key={order.id} onClick={() => setManualOrderId(order.id)}>
                              <td className="mono">{truncateMiddle(order.id, 18)}</td>
                              <td>{priorityLabel(order.priority_level)}</td>
                              <td><StatusBadge value={kitchenState.value} tone={kitchenState.tone} /></td>
                              <td>{dateTime(order.estimated_ready_time)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
            </div>
          </div>

          <details className="details-panel json-card">
            <summary>Raw kitchen status JSON</summary>
            <JsonBlock value={kitchenStatus} />
          </details>
        </>
      ) : (
        <Card title="Kitchen Scheduler" subtitle="Auto-refresh loads kitchen state once credentials are configured.">
          <EmptyState title="Kitchen status not loaded." detail="Add the credential once; the UI auto-refreshes kitchen state in the background." />
        </Card>
      )}
    </div>
  );
}
