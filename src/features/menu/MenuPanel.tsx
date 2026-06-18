import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Field, SelectInput, TextInput } from '../../components/FormField';
import { JsonBlock } from '../../components/JsonBlock';
import { StatusBadge } from '../../components/StatusBadge';
import { categoryLabel, money, truncateMiddle } from '../../lib/format';
import type { SnackBuildersApiClient } from '../../api/client';
import type { MenuItem, MenuItemCreate, SnackCategory } from '../../types/domain';

const INITIAL_FORM: MenuItemCreate = {
  name: 'Chocolate Chip Cookies',
  category: 'cookies',
  price: '3.50',
};

interface MenuPanelProps {
  api: SnackBuildersApiClient;
  menu: MenuItem[];
  onMenuChange: Dispatch<SetStateAction<MenuItem[]>>;
  onError: (message: string) => void;
  onReload: () => void | Promise<void>;
  isReloading: boolean;
}

export function MenuPanel({ api, menu, onMenuChange, onError, onReload, isReloading }: MenuPanelProps) {
  const [form, setForm] = useState<MenuItemCreate>(INITIAL_FORM);
  const [selectedId, setSelectedId] = useState('');
  const [pendingAction, setPendingAction] = useState('');
  const selected = useMemo(() => menu.find((item) => item.id === selectedId) ?? null, [menu, selectedId]);

  async function loadMenu() {
    setPendingAction('load');
    try {
      onMenuChange(await api.listMenu());
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction('');
    }
  }

  async function createItem() {
    setPendingAction('create');
    try {
      const item = await api.createMenuItem(form);
      onMenuChange((current) => [item, ...current]);
      setSelectedId(item.id);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction('');
    }
  }

  async function updateSelected() {
    if (!selected) return;
    setPendingAction('update');
    try {
      const updated = await api.updateMenuItem(selected.id, form);
      onMenuChange((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction('');
    }
  }

  async function deactivateSelected() {
    if (!selected) return;
    setPendingAction('deactivate');
    try {
      await api.deleteMenuItem(selected.id);
      onMenuChange((current) => current.filter((item) => item.id !== selected.id));
      setSelectedId('');
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction('');
    }
  }

  function useSelectedAsTemplate(item: MenuItem) {
    setSelectedId(item.id);
    setForm({ name: item.name, category: item.category, price: item.price });
  }

  async function seedRequiredItems() {
    const required: MenuItemCreate[] = [
      { name: `Demo Cookies ${Date.now()}`, category: 'cookies', price: '3.50' },
      { name: `Demo Pastries ${Date.now()}`, category: 'pastries', price: '5.25' },
      { name: `Demo Bread ${Date.now()}`, category: 'breads', price: '7.75' },
    ];
    setPendingAction('seed');
    try {
      const created: MenuItem[] = [];
      for (const item of required) {
        created.push(await api.createMenuItem(item));
      }
      onMenuChange((current) => [...created, ...current]);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction('');
    }
  }

  return (
    <div className="page-stack">
      <div className="workspace-grid">
        <Card
          title="Menu Editor"
          subtitle="Create, update, and deactivate items. Bake time is inferred from category rules."
          actions={<Button variant="secondary" onClick={seedRequiredItems} disabled={pendingAction === 'seed'}>Seed demo items</Button>}
        >
          <Field label="Name">
            <TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <div className="grid grid-2">
            <Field label="Category">
              <SelectInput value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as SnackCategory })}>
                <option value="cookies">Cookies · 5 min</option>
                <option value="pastries">Pastries · 10 min</option>
                <option value="breads">Breads · 20 min</option>
              </SelectInput>
            </Field>
            <Field label="Price">
              <TextInput type="number" min="0.01" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
            </Field>
          </div>
          <div className="button-row">
            <Button onClick={createItem} disabled={pendingAction === 'create'}>Create menu item</Button>
            <Button variant="secondary" onClick={updateSelected} disabled={!selected || pendingAction === 'update'}>Update selected</Button>
            <Button variant="danger" onClick={deactivateSelected} disabled={!selected || pendingAction === 'deactivate'}>Deactivate selected</Button>
          </div>
        </Card>

        <div className="stack">
          <Card
            title="Menu Catalog"
            subtitle="Current items returned by the API; select one to edit it."
            actions={<Button variant="secondary" onClick={onReload} disabled={isReloading}>Reload</Button>}
          >
            <div className="table-wrap">
              {menu.length === 0 ? (
                <EmptyState title="Menu is empty in this UI state." detail="Use Reload or seed demo items." />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {menu.map((item) => (
                      <tr key={item.id} className={item.id === selectedId ? 'selected-row' : ''} onClick={() => useSelectedAsTemplate(item)}>
                        <td>
                          <strong>{item.name}</strong>
                          <small className="mono">{truncateMiddle(item.id, 20)}</small>
                        </td>
                        <td>{categoryLabel(item.category)}</td>
                        <td>{money(item.price)}</td>
                        <td><StatusBadge value={item.is_active ? 'active' : 'inactive'} tone={item.is_active ? 'success' : 'warning'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>

          <Card title="Bake Rules" subtitle="Scheduler duration is derived from the selected category.">
            <div className="metric-grid">
              <div className="metric"><span>Cookies</span><strong>5m</strong></div>
              <div className="metric"><span>Pastries</span><strong>10m</strong></div>
              <div className="metric"><span>Breads</span><strong>20m</strong></div>
              <div className="metric"><span>Active items</span><strong>{menu.filter((item) => item.is_active).length}</strong></div>
            </div>
          </Card>

          <details className="details-panel json-card">
            <summary>Selected item JSON</summary>
            <JsonBlock value={selected} />
          </details>
        </div>
      </div>
    </div>
  );
}
