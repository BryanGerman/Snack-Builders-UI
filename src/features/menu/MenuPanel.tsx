import { useMemo, useState } from 'react';
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
  onMenuChange: (items: MenuItem[]) => void;
  onError: (message: string) => void;
}

export function MenuPanel({ api, menu, onMenuChange, onError }: MenuPanelProps) {
  const [form, setForm] = useState<MenuItemCreate>(INITIAL_FORM);
  const [selectedId, setSelectedId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const selected = useMemo(() => menu.find((item) => item.id === selectedId) ?? null, [menu, selectedId]);

  async function loadMenu() {
    setIsLoading(true);
    try {
      onMenuChange(await api.listMenu());
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function createItem() {
    setIsLoading(true);
    try {
      const item = await api.createMenuItem(form);
      onMenuChange([item, ...menu]);
      setSelectedId(item.id);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function updateSelected() {
    if (!selected) return;
    setIsLoading(true);
    try {
      const updated = await api.updateMenuItem(selected.id, form);
      onMenuChange(menu.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function deactivateSelected() {
    if (!selected) return;
    setIsLoading(true);
    try {
      await api.deleteMenuItem(selected.id);
      onMenuChange(menu.filter((item) => item.id !== selected.id));
      setSelectedId('');
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
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
    setIsLoading(true);
    try {
      const created: MenuItem[] = [];
      for (const item of required) {
        created.push(await api.createMenuItem(item));
      }
      onMenuChange([...created, ...menu]);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card
      title="Menu Management"
      subtitle="Customers can view menu items; managers can create, update, and deactivate items. Bake time comes from category rules."
      actions={
        <div className="button-row">
          <Button variant="secondary" onClick={loadMenu} disabled={isLoading}>Refresh</Button>
          <Button variant="secondary" onClick={seedRequiredItems} disabled={isLoading}>Seed 3 demo items</Button>
        </div>
      }
    >
      <div className="grid grid-2">
        <div className="stack">
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
            <Button onClick={createItem} disabled={isLoading}>Create menu item</Button>
            <Button variant="secondary" onClick={updateSelected} disabled={!selected || isLoading}>Update selected</Button>
            <Button variant="danger" onClick={deactivateSelected} disabled={!selected || isLoading}>Deactivate selected</Button>
          </div>
          <details className="details-panel">
            <summary>Selected item JSON</summary>
            <JsonBlock value={selected} />
          </details>
        </div>

        <div className="table-wrap">
          {menu.length === 0 ? (
            <EmptyState title="Menu is empty in this UI state." detail="Click Refresh or Seed 3 demo items." />
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
      </div>
    </Card>
  );
}
