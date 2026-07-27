import React, { useState, useEffect } from 'react';
import { solverApi, scenariosApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Play, Loader2 } from 'lucide-react';

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

export default function Solver() {
  const { isAdmin } = useAuth();
  const [algorithm, setAlgorithm] = useState<string>('baseline');
  const [scenarios, setScenarios] = useState<Record<string, unknown>[]>([]);
  const [scenarioId, setScenarioId] = useState<number | null>(null);
  const [params, setParams] = useState<Record<string, unknown>>({ ...defaultParams });
  const [useScenario, setUseScenario] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    scenariosApi.list().then((res) => {
      setScenarios(res);
      const def = (res as Record<string, unknown>[]).find((s) => s.is_default);
      if (def) {
        setScenarioId(def.id as number);
        setParams({ ...defaultParams, ...(def.params as Record<string, unknown>) });
      }
    });
  }, []);

  const handleScenarioChange = (id: number) => {
    setScenarioId(id);
    const s = scenarios.find((x) => x.id === id);
    if (s) {
      setParams({ ...defaultParams, ...(s.params as Record<string, unknown>) });
    }
  };

  const handleSolve = async () => {
    setError('');
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { algorithm };
      if (useScenario && scenarioId) {
        payload.scenario_id = scenarioId;
        payload.params = params;
      } else if (!useScenario) {
        payload.params = params;
      }
      const res = await solverApi.solve(payload as { algorithm: string; scenario_id?: number; params?: Record<string, unknown> });
      setResult(res as unknown as Record<string, unknown>);
    } catch (err) {
      setError(err instanceof Error ? err.message : '求解失败');
    } finally {
      setLoading(false);
    }
  };

  const advices = ((result?.result as Record<string, unknown>)?.advices as Record<string, unknown>[]) || [];
  const metrics = ((result?.result as Record<string, unknown>)?.warehouse_sku_metrics as Record<string, unknown>[]) || [];
  const resultData = (result?.result as Record<string, unknown>) || {};

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">调拨决策引擎</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config panel */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-gray-800 mb-4">参数配置</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">算法选择</label>
              <select value={algorithm} onChange={(e) => setAlgorithm(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="baseline">基准成本计算</option>
                <option value="heuristic">启发式算法（快速）</option>
                <option value="milp">数学规划算法（全局最优）</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" checked={useScenario} onChange={(e) => setUseScenario(e.target.checked)} id="useScenario" />
              <label htmlFor="useScenario" className="text-sm">使用参数场景</label>
            </div>

            {useScenario && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择场景</label>
                <select value={scenarioId || ''} onChange={(e) => handleScenarioChange(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">-- 请选择 --</option>
                  {scenarios.map((s) => (
                    <option key={s.id as number} value={s.id as number}>{s.name as string}{s.is_default ? ' (默认)' : ''}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="border-t border-gray-100 pt-3">
              <h4 className="text-sm font-medium text-gray-700 mb-2">参数详情 {useScenario && <span className="text-xs text-gray-400">(可临时修改)</span>}</h4>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-xs text-gray-500">目标服务水平</label>
                  <input type="range" min={50} max={100} step={5} value={((params.target_service_level as number) || 0.95) * 100} onChange={(e) => setParams({ ...params, target_service_level: Number(e.target.value) / 100 })} className="w-full" />
                  <span className="text-xs text-gray-400">{((params.target_service_level as number) * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <label className="text-xs text-gray-500">最小调拨量</label>
                  <input type="number" min={1} value={params.min_transfer_qty as number} onChange={(e) => setParams({ ...params, min_transfer_qty: Number(e.target.value) })} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">运输成本系数</label>
                  <input type="number" step={0.1} min={0.5} max={2} value={params.transport_cost_coeff as number} onChange={(e) => setParams({ ...params, transport_cost_coeff: Number(e.target.value) })} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">缺货成本系数</label>
                  <input type="number" step={0.1} min={0.5} max={3} value={params.shortage_cost_coeff as number} onChange={(e) => setParams({ ...params, shortage_cost_coeff: Number(e.target.value) })} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">持仓成本系数</label>
                  <input type="number" step={0.1} min={0.5} max={2} value={params.holding_cost_coeff as number} onChange={(e) => setParams({ ...params, holding_cost_coeff: Number(e.target.value) })} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                </div>
              </div>
            </div>

            <button
              onClick={handleSolve}
              disabled={loading}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> 求解中...</> : <><Play size={16} /> 生成调拨建议</>}
            </button>
          </div>
        </div>

        {/* Result panel */}
        <div className="lg:col-span-2">
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}

          {!result ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              配置参数后点击"生成调拨建议"查看结果
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">总成本</div>
                  <div className="text-xl font-bold text-gray-800">{(resultData.total_cost as number || 0).toFixed(2)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">服务水平</div>
                  <div className="text-xl font-bold text-green-600">{((resultData.service_level as number || 0) * 100).toFixed(1)}%</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">调拨次数</div>
                  <div className="text-xl font-bold text-blue-600">{resultData.transfer_count || 0}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">调拨总量</div>
                  <div className="text-xl font-bold text-purple-600">{resultData.total_transfer_qty || 0}</div>
                </div>
              </div>

              {/* Cost breakdown */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-bold text-sm text-gray-700 mb-3">成本构成</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">运输成本</span>
                    <span className="font-medium">{(resultData.transport_cost as number || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">缺货成本</span>
                    <span className="font-medium">{(resultData.shortage_cost as number || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">持仓成本</span>
                    <span className="font-medium">{(resultData.holding_cost as number || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Advices table */}
              {advices.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-4 border-b border-gray-100">
                    <h3 className="font-bold text-sm text-gray-700">调拨建议明细</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="px-4 py-2 text-left text-gray-600">SKU</th>
                          <th className="px-4 py-2 text-left text-gray-600">源仓库</th>
                          <th className="px-4 py-2 text-left text-gray-600">目标仓库</th>
                          <th className="px-4 py-2 text-right text-gray-600">数量</th>
                          <th className="px-4 py-2 text-right text-gray-600">运输成本</th>
                        </tr>
                      </thead>
                      <tbody>
                        {advices.map((a, i) => (
                          <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2">{a.sku_code as string}</td>
                            <td className="px-4 py-2">{a.from_warehouse as string}</td>
                            <td className="px-4 py-2">{a.to_warehouse as string}</td>
                            <td className="px-4 py-2 text-right">{a.quantity as number}</td>
                            <td className="px-4 py-2 text-right">{(a.transport_cost as number).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
