import React, { useState, useEffect } from 'react';
import { historyApi, solverApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Star, Trash2, Download, FileText, Map, ChevronDown, ChevronUp } from 'lucide-react';
import TransferMap from '../components/TransferMap';

interface HistoryRecord {
  id: number;
  solve_name: string;
  algorithm_type: string;
  scenario_name: string | null;
  status: string;
  total_cost: number;
  service_level: number;
  result: {
    advices: Record<string, unknown>[];
    transport_cost: number;
    holding_cost: number;
    shortage_cost: number;
    total_transfer_qty: number;
    transfer_count: number;
    warehouse_sku_metrics: Record<string, unknown>[];
    [key: string]: unknown;
  };
  model_variables: number | null;
  model_constraints: number | null;
  solver_status: string | null;
  is_starred: boolean;
  created_at: string;
}

const ALGO_LABELS: Record<string, string> = { baseline: '基准成本', heuristic: '启发式', milp: '数学规划' };

export default function History() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>('advices');

  const load = () => {
    setLoading(true);
    historyApi.list()
      .then((res) => setRecords(res as unknown as HistoryRecord[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const toggleStar = async (id: number) => {
    await historyApi.toggleStar(id);
    setRecords(records.map((r) => r.id === id ? { ...r, is_starred: !r.is_starred } : r));
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此记录？')) return;
    await historyApi.delete(id);
    setRecords(records.filter((r) => r.id !== id));
  };

  const handleModelDownload = async (id: number, type: string) => {
    await solverApi.downloadModel(id, type);
  };

  if (loading) return <div className="text-center py-12 text-gray-400">加载中...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">求解历史</h1>

      {records.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">暂无求解记录</div>
      ) : (
        <div className="space-y-3">
          {records.map((r) => {
            const isExpanded = expanded === r.id;
            const advices = r.result?.advices || [];
            const metrics = r.result?.warehouse_sku_metrics || [];
            return (
              <div key={r.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpanded(isExpanded ? null : r.id)}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleStar(r.id); }}
                    className={`p-1 ${r.is_starred ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}`}
                  >
                    <Star size={18} fill={r.is_starred ? 'currentColor' : 'none'} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.algorithm_type === 'baseline' ? 'bg-gray-100 text-gray-700' :
                        r.algorithm_type === 'heuristic' ? 'bg-blue-100 text-blue-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {ALGO_LABELS[r.algorithm_type] || r.algorithm_type}
                      </span>
                      <span className="font-medium text-sm text-gray-800">{r.solve_name}</span>
                      {r.scenario_name && <span className="text-xs text-gray-400">| {r.scenario_name}</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{r.created_at}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-gray-800">{r.total_cost.toFixed(2)}</div>
                    <div className="text-xs text-gray-500">服务水平 {(r.service_level * 100).toFixed(1)}%</div>
                  </div>
                  {r.algorithm_type === 'milp' && (
                    <div className="text-right text-xs text-gray-400">
                      <div>变量: {r.model_variables}</div>
                      <div>约束: {r.model_constraints}</div>
                      {r.solver_status && <div>状态: {r.solver_status}</div>}
                    </div>
                  )}
                  {isExpanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <div className="flex gap-1 px-5 pt-3 border-b border-gray-100">
                      {['advices', 'costs', 'metrics', 'map', 'model'].map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-t ${
                            activeTab === tab ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {tab === 'advices' ? '调拨建议' : tab === 'costs' ? '成本明细' : tab === 'metrics' ? '基本指标' : tab === 'map' ? '地图' : '模型'}
                        </button>
                      ))}
                      <div className="ml-auto flex gap-1">
                        <button onClick={() => historyApi.downloadPdf(r.id)} className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 flex items-center gap-1">
                          <Download size={12} /> PDF
                        </button>
                        {r.algorithm_type === 'milp' && (
                          <>
                            <button onClick={() => handleModelDownload(r.id, 'lp')} className="px-3 py-1.5 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100">LP</button>
                            <button onClick={() => handleModelDownload(r.id, 'mps')} className="px-3 py-1.5 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100">MPS</button>
                          </>
                        )}
                        <button onClick={() => handleDelete(r.id)} className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="p-5 max-h-96 overflow-auto">
                      {activeTab === 'advices' && (
                        advices.length === 0 ? (
                          <div className="text-center py-8 text-gray-400 text-sm">无调拨建议</div>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="px-3 py-2 text-left text-gray-600">SKU</th>
                                <th className="px-3 py-2 text-left text-gray-600">源仓库</th>
                                <th className="px-3 py-2 text-left text-gray-600">目标仓库</th>
                                <th className="px-3 py-2 text-right text-gray-600">数量</th>
                                <th className="px-3 py-2 text-right text-gray-600">运输成本</th>
                              </tr>
                            </thead>
                            <tbody>
                              {advices.map((a, i) => (
                                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                                  <td className="px-3 py-2">{a.sku_code as string}</td>
                                  <td className="px-3 py-2">{a.from_warehouse as string}</td>
                                  <td className="px-3 py-2">{a.to_warehouse as string}</td>
                                  <td className="px-3 py-2 text-right">{a.quantity as number}</td>
                                  <td className="px-3 py-2 text-right">{(a.transport_cost as number).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )
                      )}
                      {activeTab === 'costs' && (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between"><span className="text-gray-500">总成本</span><span className="font-bold">{r.total_cost.toFixed(2)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">运输成本</span><span>{(r.result?.transport_cost || 0).toFixed(2)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">缺货成本</span><span>{(r.result?.shortage_cost || 0).toFixed(2)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">持仓成本</span><span>{(r.result?.holding_cost || 0).toFixed(2)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">调拨次数</span><span>{r.result?.transfer_count || 0}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">调拨总量</span><span>{r.result?.total_transfer_qty || 0}</span></div>
                        </div>
                      )}
                      {activeTab === 'metrics' && (
                        metrics.length === 0 ? (
                          <div className="text-center py-8 text-gray-400 text-sm">无指标数据</div>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="px-3 py-2 text-left text-gray-600">SKU</th>
                                <th className="px-3 py-2 text-left text-gray-600">仓库</th>
                                <th className="px-3 py-2 text-right text-gray-600">初始库存</th>
                                <th className="px-3 py-2 text-right text-gray-600">需求</th>
                                <th className="px-3 py-2 text-right text-gray-600">缺货</th>
                                <th className="px-3 py-2 text-right text-gray-600">服务水平</th>
                              </tr>
                            </thead>
                            <tbody>
                              {metrics.map((m, i) => (
                                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                                  <td className="px-3 py-2">{m.sku_code as string}</td>
                                  <td className="px-3 py-2">{m.warehouse_code as string}</td>
                                  <td className="px-3 py-2 text-right">{m.current_inventory as number}</td>
                                  <td className="px-3 py-2 text-right">{(m.demand as number).toFixed(0)}</td>
                                  <td className="px-3 py-2 text-right">{m.shortage as number}</td>
                                  <td className="px-3 py-2 text-right">{((m.service_level as number) * 100).toFixed(1)}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )
                      )}
                      {activeTab === 'map' && (
                        advices.length === 0 ? (
                          <div className="text-center py-8 text-gray-400 text-sm">无调拨路径可显示</div>
                        ) : (
                          <TransferMap advices={advices} />
                        )
                      )}
                      {activeTab === 'model' && r.algorithm_type === 'milp' && (
                        <ModelView historyId={r.id} />
                      )}
                      {activeTab === 'model' && r.algorithm_type !== 'milp' && (
                        <div className="text-center py-8 text-gray-400 text-sm">仅数学规划算法支持模型展示</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModelView({ historyId }: { historyId: number }) {
  const [model, setModel] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    solverApi.getModel(historyId)
      .then((res) => setModel(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [historyId]);

  if (loading) return <div className="text-center py-4 text-gray-400">加载中...</div>;
  if (!model) return <div className="text-center py-4 text-gray-400">无法加载模型信息</div>;

  const overview = model.overview as Record<string, unknown>;
  const objective = model.objective as Record<string, unknown>;
  const constraints = (model.constraints as Record<string, unknown>[]) || [];

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">模型概览</h4>
        <div className="grid grid-cols-4 gap-2 text-sm">
          <div><span className="text-gray-500">类型:</span> {overview?.type as string}</div>
          <div><span className="text-gray-500">变量数:</span> {overview?.variables as number}</div>
          <div><span className="text-gray-500">约束数:</span> {overview?.constraints as number}</div>
          <div><span className="text-gray-500">求解器:</span> {overview?.solver as string}</div>
        </div>
      </div>
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">目标函数</h4>
        <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs overflow-x-auto">
          {objective?.latex as string}
        </div>
        <div className="text-xs text-gray-500 mt-1">{objective?.description as string}</div>
      </div>
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">约束条件</h4>
        <div className="space-y-2">
          {constraints.map((c, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs font-medium text-gray-700 mb-1">{c.name as string}</div>
              <div className="font-mono text-xs overflow-x-auto">{c.latex as string}</div>
              <div className="text-xs text-gray-500 mt-1">{c.description as string}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
