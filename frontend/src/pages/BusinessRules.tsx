import React, { useState, useEffect } from 'react';
import { rulesApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, X, Save } from 'lucide-react';

interface Rule {
  id: number;
  rule_type: string;
  rule_json: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export default function BusinessRules() {
  const { isAdmin } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [form, setForm] = useState({ rule_type: 'TRANSPORT_BAN', rule_json: '', enabled: true });
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [skus, setSkus] = useState<string[]>([]);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      rulesApi.list(),
      fetch('/api/data/warehouses').then((r) => r.json()),
      fetch('/api/data/skus').then((r) => r.json()),
    ])
      .then(([r, wh, sk]) => {
        setRules(r as unknown as Rule[]);
        setWarehouses((wh as Record<string, unknown>[]).map((w) => w.warehouse_code as string));
        setSkus((sk as Record<string, unknown>[]).map((s) => s.sku_code as string));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openNew = (type?: string) => {
    setEditing(null);
    const defaultJson = type === 'MAX_TRANSPORT_QUANTITY'
      ? { sku: skus[0] || '', max_quantity: 100 }
      : { source: warehouses[0] || '', target: warehouses[1] || '' };
    setForm({ rule_type: type || 'TRANSPORT_BAN', rule_json: JSON.stringify(defaultJson, null, 2), enabled: true });
    setShowForm(true);
  };

  const openEdit = (rule: Rule) => {
    setEditing(rule);
    setForm({ rule_type: rule.rule_type, rule_json: rule.rule_json, enabled: rule.enabled });
    setShowForm(true);
  };

  const handleSave = async () => {
    setError('');
    try {
      JSON.parse(form.rule_json);
    } catch {
      setError('JSON格式无效');
      return;
    }
    try {
      if (editing) {
        await rulesApi.update(editing.id, form);
      } else {
        await rulesApi.create(form);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleToggle = async (id: number) => {
    try {
      await rulesApi.toggle(id);
      load();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此规则？')) return;
    try {
      await rulesApi.delete(id);
      load();
    } catch {}
  };

  const updateJsonField = (key: string, value: string) => {
    try {
      const parsed = JSON.parse(form.rule_json);
      parsed[key] = value;
      setForm({ ...form, rule_json: JSON.stringify(parsed, null, 2) });
    } catch {
      setForm({ ...form, rule_json: form.rule_json });
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">业务规则管理</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => openNew('TRANSPORT_BAN')} className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
              <Plus size={16} /> 禁止运输
            </button>
            <button onClick={() => openNew('MAX_TRANSPORT_QUANTITY')} className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700">
              <Plus size={16} /> 运输限量
            </button>
            <button onClick={() => rulesApi.exportRules()} className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
              导出
            </button>
          </div>
        )}
      </div>

      {rules.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无业务规则</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-gray-600">#</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">类型</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">规则详情</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">状态</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r, idx) => {
                let detail = '';
                try {
                  const parsed = JSON.parse(r.rule_json);
                  if (r.rule_type === 'TRANSPORT_BAN') {
                    detail = `${parsed.source} → ${parsed.target} (禁止运输)`;
                  } else {
                    detail = `SKU: ${parsed.sku}, 最大运输量: ${parsed.max_quantity}`;
                  }
                } catch {
                  detail = r.rule_json;
                }
                return (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.rule_type === 'TRANSPORT_BAN' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {r.rule_type === 'TRANSPORT_BAN' ? '禁止运输' : '运输限量'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs">{detail}</td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <button onClick={() => handleToggle(r.id)} className={`flex items-center gap-1 text-sm ${r.enabled ? 'text-green-600' : 'text-gray-400'}`}>
                          {r.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                          {r.enabled ? '启用' : '禁用'}
                        </button>
                      ) : (
                        <span className={r.enabled ? 'text-green-600 text-sm' : 'text-gray-400 text-sm'}>
                          {r.enabled ? '启用' : '禁用'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-blue-600"><Edit2 size={16} /></button>
                          <button onClick={() => handleDelete(r.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{editing ? '编辑规则' : '新建规则'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">规则类型</label>
                <select
                  value={form.rule_type}
                  onChange={(e) => {
                    setForm({ ...form, rule_type: e.target.value });
                    const newJson = e.target.value === 'TRANSPORT_BAN'
                      ? { source: warehouses[0] || '', target: warehouses[1] || '' }
                      : { sku: skus[0] || '', max_quantity: 100 };
                    if (!editing) setForm({ ...form, rule_type: e.target.value, rule_json: JSON.stringify(newJson, null, 2) });
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="TRANSPORT_BAN">禁止运输</option>
                  <option value="MAX_TRANSPORT_QUANTITY">最大运输量限制</option>
                </select>
              </div>

              {form.rule_type === 'TRANSPORT_BAN' && (() => {
                try {
                  const p = JSON.parse(form.rule_json);
                  return (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">源仓库</label>
                        <select value={p.source || ''} onChange={(e) => updateJsonField('source', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                          {warehouses.map((w) => <option key={w} value={w}>{w}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">目标仓库</label>
                        <select value={p.target || ''} onChange={(e) => updateJsonField('target', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                          {warehouses.filter((w) => w !== (p.source || '')).map((w) => <option key={w} value={w}>{w}</option>)}
                        </select>
                      </div>
                    </>
                  );
                } catch { return null; }
              })()}

              {form.rule_type === 'MAX_TRANSPORT_QUANTITY' && (() => {
                try {
                  const p = JSON.parse(form.rule_json);
                  return (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                        <select value={p.sku || ''} onChange={(e) => updateJsonField('sku', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                          {skus.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">最大运输量</label>
                        <input type="number" value={p.max_quantity || 0} onChange={(e) => updateJsonField('max_quantity', Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </>
                  );
                } catch { return null; }
              })()}

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                启用
              </label>

              <button onClick={handleSave} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2">
                <Save size={16} /> 保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
