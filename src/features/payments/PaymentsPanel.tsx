import { useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Field, SelectInput, TextInput } from '../../components/FormField';
import { JsonBlock } from '../../components/JsonBlock';
import { StatusBadge } from '../../components/StatusBadge';
import { dateTime, money, truncateMiddle } from '../../lib/format';
import type { SnackBuildersApiClient } from '../../api/client';
import type { Order, Payment, PaymentMethod } from '../../types/domain';

interface PaymentsPanelProps {
  api: SnackBuildersApiClient;
  orders: Order[];
  payments: Payment[];
  selectedOrderId: string;
  onPaymentsChange: (payments: Payment[]) => void;
  onOrdersChange: (orders: Order[]) => void;
  onSelectedOrderIdChange: (orderId: string) => void;
  onError: (message: string) => void;
}

function upsertOrder(orders: Order[], next: Order): Order[] {
  const exists = orders.some((order) => order.id === next.id);
  if (!exists) return [next, ...orders];
  return orders.map((order) => (order.id === next.id ? next : order));
}

export function PaymentsPanel({
  api,
  orders,
  payments,
  selectedOrderId,
  onPaymentsChange,
  onOrdersChange,
  onSelectedOrderIdChange,
  onError,
}: PaymentsPanelProps) {
  const [orderId, setOrderId] = useState(selectedOrderId);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [isLoading, setIsLoading] = useState(false);

  const selectedOrder = useMemo(() => orders.find((order) => order.id === (orderId || selectedOrderId)) ?? null, [orders, orderId, selectedOrderId]);

  function useOrder(order: Order) {
    onSelectedOrderIdChange(order.id);
    setOrderId(order.id);
    setAmount(order.total_price);
  }

  async function loadBillIntoAmount() {
    const id = orderId || selectedOrderId;
    if (!id) {
      onError('Select or enter an order id first.');
      return;
    }
    setIsLoading(true);
    try {
      const bill = await api.getBill(id);
      setAmount(bill.amount_due);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function createPayment() {
    const id = orderId || selectedOrderId;
    if (!id) {
      onError('Select or enter an order id first.');
      return;
    }
    if (!amount) {
      onError('Amount is required.');
      return;
    }
    setIsLoading(true);
    try {
      const payment = await api.createPayment({ order_id: id, amount, method });
      onPaymentsChange([payment, ...payments]);
      try {
        const refreshed = await api.trackOrder(id);
        onOrdersChange(upsertOrder(orders, refreshed));
      } catch {
        // Payment succeeded; order refresh is diagnostic only.
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="workspace-grid">
        <Card
          title="Payment Capture"
          subtitle="Submit cash or credit card payments and verify payment_status transitions."
          actions={<Button variant="secondary" onClick={loadBillIntoAmount} disabled={isLoading || (!orderId && !selectedOrderId)}>Load amount due</Button>}
        >
          <Field label="Order ID">
            <TextInput value={orderId || selectedOrderId} onChange={(event) => setOrderId(event.target.value)} />
          </Field>
          <div className="grid grid-2">
            <Field label="Amount">
              <TextInput type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </Field>
            <Field label="Method">
              <SelectInput value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
                <option value="cash">Cash</option>
                <option value="credit_card">Credit card</option>
              </SelectInput>
            </Field>
          </div>
          <div className="button-row">
            <Button onClick={createPayment} disabled={isLoading}>Create payment</Button>
          </div>
        </Card>

        <div className="stack">
          {selectedOrder && (
            <Card title="Selected Order" subtitle="Payment target and current balance context.">
              <div className="metric-grid">
                <div className="metric"><span>Total</span><strong>{money(selectedOrder.total_price)}</strong></div>
                <div className="metric"><span>Payment</span><strong>{selectedOrder.payment_status}</strong></div>
              </div>
              <details className="details-panel json-card separated">
                <summary>Selected order JSON</summary>
                <JsonBlock value={selectedOrder} maxHeight={190} />
              </details>
            </Card>
          )}

          <Card title="Payable Orders" subtitle="Select an order to load its payment context.">
            <div className="table-wrap">
              {orders.length === 0 ? (
                <EmptyState title="No orders in this UI session." detail="Create an order first." />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Total</th>
                      <th>Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} onClick={() => useOrder(order)} className={order.id === (orderId || selectedOrderId) ? 'selected-row' : ''}>
                        <td className="mono">{truncateMiddle(order.id, 20)}</td>
                        <td>{money(order.total_price)}</td>
                        <td><StatusBadge value={order.payment_status} tone={order.payment_status === 'paid' ? 'success' : 'warning'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Payment Ledger" subtitle="Payments created in this UI session.">
        <div className="table-wrap">
          {payments.length === 0 ? (
            <EmptyState title="No payments yet." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Payment</th>
                  <th>Order</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="mono">{truncateMiddle(payment.id, 18)}</td>
                    <td className="mono">{truncateMiddle(payment.order_id, 18)}</td>
                    <td>{payment.method}</td>
                    <td><StatusBadge value={payment.status} tone={payment.status === 'paid' ? 'success' : 'warning'} /></td>
                    <td>{money(payment.amount)}</td>
                    <td>{dateTime(payment.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
