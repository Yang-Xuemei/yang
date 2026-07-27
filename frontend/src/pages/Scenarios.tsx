import React, { useState, useEffect } from 'react';
import { scenariosApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Plus, Edit2, Trash2, Copy, Star, Eye, X, Save } from 'lucide-react';

interface Scenario {
  id: number;
  name: string;
  description: string;
  is_default: boolean;
  params: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const defaultParams = {
  target_service_level: 0.95,
  min_transfer_qty: 10,
  max_solve_time: 10,
  transport_cost_coeff: 1.0,
  shortage_cost_coeff: 1.0,
  holding_cost_coeff: 1.0,
  enable_transport_ban: true,
  enable_max_transport_limit: true,
};

const PARAM_LABELS: Record<string, { label: string; min: number; max: number; step: number; type: string }> = {
  target_service_level: { label: '目标服务水平 (%)', min: 50, max: 100, step: 5, type: 'range' },
  min_transfer_qty: { label: '最小调拨量 (件)', min: 1, max: 1000, step: 1, type: 'number' },
  max_solve_time: { label: '最大求解时间 (秒)', min: 1, max: 60, step: 1, type: 'number' },
  transport_cost_coeff: { label: '运输成本系数', min: 0.5, max: 2, step: 0.1, type: 'number' },
  shortage_cost_coeff: { label: '缺货成本系数', min: 0.5, max: 3, step: 0.1, type: 'number' },
  holding_cost_coeff: { label: '持仓成本系数', min: 0.5, max: 2, step: 0.1, type: 'number' },
};

export default function Scenarios() {
  const { isAdmin } = useAuth();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Scenario | null>(null);
  const [viewing, setViewing] = useState<Scenario | null>(null);
  const [form, setForm] = useState({ name: '', description: '', params: { ...defaultParams } });
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    scenariosApi.list()
      .then((res) => setScenarios(res as unknown as Scenario[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', description: '', params: { ...defaultParams } });
    setShowForm(true);
  };

  const openEdit = (s: Scenario) => {
    setEditing(s);
    setForm({ name: s.name, description: s.description, params: { ...defaultParams, ...s.params } });
    setShowForm(true);
  };

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) { setError('请输入场景名称'); return; }
    try {
      const payload = {
        name: form.name,
        description: form.description,
        is_default: false,
        params: {
          ...form.params,
          target_service_level: (form.params.target_service_level as number) / 100,
        },
      };
      if (editing) {
        await scenariosApi.update(editing.id, payload);
      } else {
        await scenariosApi.create(payload);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此场景？')) return;
    try {
      await scenariosApi.delete(id);
      load();
    } catch {}
  };

  const handleCopy = async (id: number) => {
    try {
      await scenariosApi.copy(id);
      load();
    } catch {}
  };

  const handleSetDefault = async (id: number) => {
    try {
      await scenariosApi.setDefault(id);
      load();
    } catch {}
  };

  if (loading) return <div className="text-center py-12 text-gray-400">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">参数场景管理</h1>
        {isAdmin && (
          <button onClick={openNew} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus size={16} /> 新建场景
          </button>
        )}
      </div>

      {/* Scenario list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scenarios.map((s) => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-gray-800">{s.name}</h3>
                  {s.is_default && (
                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full flex items-center gap-1">
                      <Star size={10} /> 默认
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">{s.description || '无描述'}</p>
              </div>
              <span className="text-xs text-gray-400">{s.updated_at?.slice(0, 16)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-3 bg-gray-50 rounded-lg p-3">
              <div>服务水平: {((s.params.target_service_level as number || 0.95) * 100).toFixed(0)}%</div>
              <div>最小调拨量: {s.params.min_transfer_qty || 10}</div>
              <div>运输系数: {s.params.transport_cost_coeff || 1}x</div>
              <div>缺货系数: {s.params.shortage_cost_coeff || 1}x</div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setViewing(s)} className="text-gray-400 hover:text-blue-600 p-1"><Eye size={16} /></button>
              {isAdmin && (
                <>
                  <button onClick={() => openEdit(s)} className="text-gray-400 hover:text-green-600 p-1"><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete(s.id)} className="text-gray-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                </>
              )}
              <button onClick={() => handleCopy(s.id)} className="text-gray-400 hover:text-purple-600 p-1"><Copy size={16} /></button>
              {!s.is_default && isAdmin && (
                <button onClick={() => handleSetDefault(s.id)} className="text-gray-400 hover:text-yellow-600 p-1"><Star size={16} /></button>
              )}
            </div>
          </div>
        ))}
      </div>

      {scenarios.length === 0 && (
        <div className="text-center py-12 text-gray-400">暂无参数场景</div>
      )}

      {/* View detail modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{viewing.name}</h3>
              <button onClick={() => setViewing(null)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">{viewing.description}</p>
            <h4 className="font-medium text-sm text-gray-700 mb-2">基础参数</h4>
            <div className="space-y-2 text-sm mb-4">
              {Object.entries(PARAM_LABELS).map(([key, cfg]) => {
                const val = viewing.params[key];
                const displayVal = key === 'target_service_level' ? `${((val as number) || 0.95) * 100}%` : val;
                return (
                  <div key={key} className="flex justify-between">
                    <span className="text-gray-500">{cfg.label}</span>
                    <span className="font-medium">{displayVal}</span>
                  </div>
                );
              })}
            </div>
            <h4 className="font-medium text-sm text-gray-700 mb-2">业务规则</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">启用运输禁止规则</span>
                <span className="font-medium">{viewing.params.enable_transport_ban ? '是' : '否'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">启用最大运输量限制</span>
                <span className="font-medium">{viewing.params.enable_max_transport_limit ? '是' : '否'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{editing ? '编辑场景' : '新建场景'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">场景名称</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
              <h4 className="font-medium text-sm text-gray-700">参数配置</h4>
              {Object.entries(PARAM_LABELS).map(([key, cfg]) => {
                const val = form.params[key] as number;
                const actualVal = key === 'target_service_level' ? val / 100 : val;
                return (
                  <div key={key}>
                    <label className="block text-sm text-gray-600 mb-1">{cfg.label}</label>
                    {cfg.type === 'range' ? (
                      <input
                        type="range"
                        min={cfg.min} max={cfg.max} step={cfg.step}
                        value={val}
                        onChange={(e) => setForm({ ...form, params: { ...form.params, [key]: Number(e.target.value) } })}
                        className="w-full"
                      />
                    ) : (
                      <input
                        type="number"
                        min={cfg.min} max={cfg.max} step={cfg.step}
                        value={val}
                        onChange={(e) => setForm({ ...form, params: { ...form.params, [key]: Number(e.target.value) } })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    )}
                    <span className="text-xs text-gray-400">
                      {key === 'target_service_level' ? `${val}%` : val}
                    </span>
                  </div>
                );
              })}
              <div className="flex gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.params.enable_transport_ban as boolean} onChange={(e) => setForm({ ...form, params: { ...form.params, enable_transport_ban: e.target.checked } })} />
                  启用运输禁止规则
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.params.enable_max_transport_limit as boolean} onChange={(e) => setForm({ ...form, params: { ...form.params, enable_max_transport_limit: e.target.checked } })} />
                  启用最大运输量限制
                </label>
              </div>
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
