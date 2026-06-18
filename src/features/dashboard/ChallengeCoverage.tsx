import { CheckCircle2, CircleDashed, Clock3, CreditCard, Flame, LockKeyhole, PackagePlus, ReceiptText } from 'lucide-react';
import { Card } from '../../components/Card';
import { StatusBadge } from '../../components/StatusBadge';
import type { KitchenStatus, MenuItem, Order, Payment } from '../../types/domain';

interface ChallengeCoverageProps {
  menu: MenuItem[];
  orders: Order[];
  payments: Payment[];
  kitchenStatus: KitchenStatus | null;
  hasToken: boolean;
}

function requirementTone(isCovered: boolean) {
  return isCovered ? 'success' : 'warning';
}

export function ChallengeCoverage({ menu, orders, payments, kitchenStatus, hasToken }: ChallengeCoverageProps) {
  const activeMenu = menu.filter((item) => item.is_active);
  const hasAllBakeRules = ['cookies', 'pastries', 'breads'].every((category) =>
    activeMenu.some((item) => item.category === category),
  );
  const hasPriorityOrder = orders.some((order) => order.priority_level === 1);
  const hasQueuedWork = Boolean(kitchenStatus?.queued_tasks.length);
  const hasActiveKitchen = Boolean(kitchenStatus?.active_tasks.length);

  const requirements = [
    {
      title: 'Menu operations',
      detail: `${activeMenu.length} active items loaded`,
      covered: activeMenu.length > 0,
      icon: PackagePlus,
    },
    {
      title: 'Bake-time rules',
      detail: hasAllBakeRules ? 'Cookies, pastries, and breads present' : 'Seed or load all categories',
      covered: hasAllBakeRules,
      icon: Clock3,
    },
    {
      title: 'Order placement',
      detail: `${orders.length} orders in session`,
      covered: orders.length > 0,
      icon: ReceiptText,
    },
    {
      title: 'Payment flow',
      detail: `${payments.length} payments submitted`,
      covered: payments.length > 0,
      icon: CreditCard,
    },
    {
      title: 'Kitchen visibility',
      detail: kitchenStatus ? `${kitchenStatus.active_tasks.length}/${kitchenStatus.total_slots} active slots` : 'Kitchen snapshot not loaded',
      covered: Boolean(kitchenStatus),
      icon: Flame,
    },
    {
      title: 'Priority queue',
      detail: hasPriorityOrder || hasQueuedWork ? 'Priority scenario evidence available' : 'Run Priority scenario',
      covered: hasPriorityOrder || hasQueuedWork,
      icon: CircleDashed,
    },
  ];

  return (
    <Card
      title="Challenge Coverage"
      subtitle="Operational evidence for the Snack Builders backend requirements."
      actions={<StatusBadge value={hasToken ? 'auth ready' : 'auth missing'} tone={hasToken ? 'success' : 'danger'} />}
    >
      <div className="coverage-grid">
        {requirements.map((requirement) => {
          const Icon = requirement.icon;
          return (
            <article className="coverage-item" key={requirement.title}>
              <div className="coverage-icon">
                <Icon size={18} />
              </div>
              <div>
                <div className="coverage-title">
                  <strong>{requirement.title}</strong>
                  <StatusBadge value={requirement.covered ? 'covered' : 'pending'} tone={requirementTone(requirement.covered)} />
                </div>
                <p>{requirement.detail}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="architecture-strip">
        <div>
          <CheckCircle2 size={18} />
          <span>2 ovens</span>
        </div>
        <div>
          <CheckCircle2 size={18} />
          <span>6 concurrent slots</span>
        </div>
        <div>
          <LockKeyhole size={18} />
          <span>Bearer token from one connection panel</span>
        </div>
      </div>
    </Card>
  );
}
