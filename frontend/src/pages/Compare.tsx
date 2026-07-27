import React, { useState, useEffect } from 'react';
import { historyApi, compareApi } from '../lib/api';
import { Download, GitCompare } from 'lucide-react';

const ALGO_LABELS: Record<string, string> = { baseline: '基准成本', heuristic: '启发式', milp: '数学规划' };
const ALGO_COLORS: Record<string, string> = { baseline: '#9ca3af', heuristic: '#3b82f6', milp: '#8b5cf6' };

interface HistoryRecord {
  id: number;
  solve_name: string;
  algorithm_type: string;
  scenario_name: string | null;
  total_cost: number;
  service_level: number;
  result: Record<string, unknown>;
  created_at: string;
}

export default function Compare() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [selected, setSelected] = useState<Record<string, number | null>>({
    baseline: null,
    heuristic: null,
    milp: null,
  });
  const [compareResult, setCompareResult] = useState<{ records: HistoryRecord[]; summary: Record<string, unknown> } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    historyApi.list()
      .then((res) => {
        const arr = res as unknown as HistoryRecord[];
        setRecords(arr);
        // Auto-select first of each type
        ['baseline', 'heuristic', 'milp'].forEach((algo) => {
          const first = arr.find((r) => r.algorithm_type === algo);
          if (first) setSelected((prev) => ({ ...prev, [algo]: first.id }));
        });
      });
  }, []);

  const handleCompare = async () => {
    const ids = Object.values(selected).filter((v): v is number => v !== null);
    if (ids.length < 2) return;
    setLoading(true);
    try {
      const res = await compareApi.compare(ids);
      setCompareResult(res as unknown as { records: HistoryRecord[]; summary: Record<string, unknown> });
    } catch {
      setCompareResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    const ids = Object.values(selected).filter((v): v is number => v !== null);
    if (ids.length < 2) return;
    await compareApi.exportCompare(ids);
  };

  const baselineCost = compareResult?.records.find((r) => r.algorithm_type === 'baseline')?.total_cost;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">求解结果对比</h1>

      {/* Algorithm selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="font-medium text-sm text-gray-700 mb-3">选择对比算法</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(ALGO_LABELS).map(([algo, label]) => {
            const options = records.filter((r) => r.algorithm_type === algo);
            return (
              <div key={algo}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <select
                  value={selected[algo] ?? ''}
                  onChange={(e) => setSelected({ ...selected, [algo]: e.target.value ? Number(e.target.value) : null })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">-- 请选择 --</option>
                  {options.map((r) => (
                    <option key={r.id} value={r.id}>{r.solve_name} ({r.created_at?.slice(5, 16)})</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleCompare}
            disabled={Object.values(selected).filter(Boolean).length < 2 || loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <GitCompare size={16} /> {loading ? '对比中...' : '开始对比'}
          </button>
          <button
            onClick={handleExport}
            disabled={Object.values(selected).filter(Boolean).length < 2}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50"
          >
            <Download size={16} /> 导出Excel
          </button>
        </div>
      </div>

      {/* Compare result */}
      {compareResult && compareResult.records.length > 0 && (
        <div className="space-y-6">
          {/* Core metrics table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-bold text-sm text-gray-700">核心指标对比</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-gray-600">指标</th>
                    {compareResult.records.map((r) => (
                      <th key={r.id} className="px-4 py-3 text-right text-gray-600">
                        <span style={{ color: ALGO_COLORS[r.algorithm_type] }}>{ALGO_LABELS[r.algorithm_type]}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const metrics = [
                      { key: 'total_cost', label: '总成本', format: (v: number) => v.toFixed(2), lower: true },
                      { key: 'transport_cost', label: '运输成本', format: (v: number) => v.toFixed(2), lower: true },
                      { key: 'shortage_cost', label: '缺货成本', format: (v: number) => v.toFixed(2), lower: true },
                      { key: 'holding_cost', label: '持仓成本', format: (v: number) => v.toFixed(2), lower: true },
                      { key: 'service_level', label: '服务水平', format: (v: number) => (v * 100).toFixed(1) + '%', lower: false },
                      { key: 'transfer_count', label: '调拨次数', format: (v: number) => String(v), lower: true },
                      { key: 'total_transfer_qty', label: '调拨总量', format: (v: number) => String(v), lower: true },
                    ];
                    return metrics.map((m) => {
                      const values = compareResult.records.map((r) => {
                        if (m.key === 'service_level') return r.service_level;
                        return (r.result[m.key] as number) || 0;
                      });
                      const bestIdx = m.lower
                        ? values.reduce((acc, v, i, arr) => v < arr[acc] ? i : acc, 0)
                        : values.reduce((acc, v, i, arr) => v > arr[acc] ? i : acc, 0);
                      return (
                        <tr key={m.key} className="border-b border-gray-100">
                          <td className="px-4 py-2.5 text-gray-600">{m.label}</td>
                          {values.map((v, i) => (
                            <td key={i} className={`px-4 py-2.5 text-right ${i === bestIdx ? 'text-green-600 font-bold' : ''}`}>
                              {m.format(v)}
                              {baselineCost && baselineCost > 0 && m.key === 'total_cost' && i !== bestIdx && (
                                <span className="text-xs text-gray-400 ml-1">
                                  ({((v - baselineCost) / baselineCost * 100).toFixed(1)}%)
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cost comparison bar chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-bold text-sm text-gray-700 mb-4">成本构成对比</h3>
            <div className="space-y-4">
              {compareResult.records.map((r) => {
                const total = r.total_cost || 1;
                const transport = ((r.result.transport_cost as number) || 0) / total * 100;
                const shortage = ((r.result.shortage_cost as number) || 0) / total * 100;
                const holding = ((r.result.holding_cost as number) || 0) / total * 100;
                return (
                  <div key={r.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span style={{ color: ALGO_COLORS[r.algorithm_type] }} className="font-medium">{ALGO_LABELS[r.algorithm_type]}</span>
                      <span>{r.total_cost.toFixed(2)}</span>
                    </div>
                    <div className="flex h-6 rounded overflow-hidden bg-gray-100">
                      <div style={{ width: `${transport}%`, backgroundColor: '#3b82f6' }} title={`运输 ${(transport).toFixed(1)}%`} />
                      <div style={{ width: `${shortage}%`, backgroundColor: '#ef4444' }} title={`缺货 ${(shortage).toFixed(1)}%`} />
                      <div style={{ width: `${holding}%`, backgroundColor: '#f59e0b' }} title={`持仓 ${(holding).toFixed(1)}%`} />
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-4 text-xs text-gray-500 pt-2">
                <div className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500 rounded-sm" />运输</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-sm" />缺货</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-500 rounded-sm" />持仓</div>
              </div>
            </div>
          </div>

          {/* Service level comparison */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-bold text-sm text-gray-700 mb-4">服务水平对比</h3>
            <div className="flex items-end gap-8 justify-center h-48">
              {compareResult.records.map((r) => {
                const h = Math.max(10, r.service_level * 100);
                return (
                  <div key={r.id} className="flex flex-col items-center gap-1">
                    <span className="text-sm font-bold">{(r.service_level * 100).toFixed(1)}%</span>
                    <div
                      className="w-20 rounded-t-lg transition-all"
                      style={{ height: `${h * 1.5}px`, backgroundColor: ALGO_COLORS[r.algorithm_type] }}
                    />
                    <span className="text-xs" style={{ color: ALGO_COLORS[r.algorithm_type] }}>{ALGO_LABELS[r.algorithm_type]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
