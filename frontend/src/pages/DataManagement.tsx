import React, { useState, useEffect } from 'react';
import { dataApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Upload, Download, RefreshCw, FileSpreadsheet, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

const TABLE_CONFIG: Record<string, { label: string; columns: { key: string; label: string }[]; keyField: string | string[] }> = {
  skus: {
    label: 'SKU主数据',
    columns: [
      { key: 'sku_code', label: 'SKU编码' },
      { key: 'sku_name', label: 'SKU名称' },
      { key: 'sku_desc', label: '描述' },
    ],
    keyField: 'sku_code',
  },
  warehouses: {
    label: '仓库主数据',
    columns: [
      { key: 'warehouse_code', label: '仓库编号' },
      { key: 'warehouse_name', label: '仓库名称' },
      { key: 'warehouse_type', label: '类型' },
      { key: 'city', label: '城市' },
      { key: 'longitude', label: '经度' },
      { key: 'latitude', label: '纬度' },
      { key: 'status', label: '状态' },
    ],
    keyField: 'warehouse_code',
  },
  inventory: {
    label: '当前库存',
    columns: [
      { key: 'sku_code', label: 'SKU编码' },
      { key: 'warehouse_code', label: '仓库编号' },
      { key: 'quantity', label: '库存量' },
      { key: 'last_counted_at', label: '最后盘点时间' },
    ],
    keyField: ['sku_code', 'warehouse_code'],
  },
  demand_forecast: {
    label: '需求预测',
    columns: [
      { key: 'sku_code', label: 'SKU编码' },
      { key: 'warehouse_code', label: '仓库编号' },
      { key: 'expected_demand', label: '预期需求量' },
      { key: 'accuracy', label: '预测准确度' },
    ],
    keyField: ['sku_code', 'warehouse_code'],
  },
  transport_cost: {
    label: '运输成本',
    columns: [
      { key: 'source_warehouse', label: '源仓库' },
      { key: 'target_warehouse', label: '目标仓库' },
      { key: 'unit_cost', label: '单位成本' },
    ],
    keyField: ['source_warehouse', 'target_warehouse'],
  },
  holding_cost: {
    label: '持仓成本',
    columns: [
      { key: 'sku_code', label: 'SKU编码' },
      { key: 'warehouse_code', label: '仓库编号' },
      { key: 'unit_cost', label: '单位成本' },
    ],
    keyField: ['sku_code', 'warehouse_code'],
  },
  shortage_cost: {
    label: '缺货成本',
    columns: [
      { key: 'sku_code', label: 'SKU编码' },
      { key: 'warehouse_code', label: '仓库编号' },
      { key: 'unit_cost', label: '单位成本' },
    ],
    keyField: ['sku_code', 'warehouse_code'],
  },
  warehouse_capacity: {
    label: '仓库容量',
    columns: [
      { key: 'warehouse_code', label: '仓库编号' },
      { key: 'max_capacity', label: '最大容量' },
      { key: 'current_usage', label: '当前使用' },
      { key: 'usage_rate', label: '使用率' },
    ],
    keyField: 'warehouse_code',
  },
};

const tabs = Object.keys(TABLE_CONFIG);

export default function DataManagement() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await dataApi.list(activeTab);
      setData(rows);
      const s = await dataApi.status();
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [activeTab]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const res = await dataApi.upload(file);
      setSuccess(`上传成功！已更新工作表: ${(res as { sheets?: string[] }).sheets?.join(', ') || activeTab}`);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const config = TABLE_CONFIG[activeTab];
  const tableStatus = status.find((s) => s.table_name === activeTab);

  const completenessIcon = (v: string) => {
    if (v?.includes('完整')) return <CheckCircle size={14} className="text-green-500 inline" />;
    if (v?.includes('部分')) return <AlertTriangle size={14} className="text-yellow-500 inline" />;
    if (v?.includes('严重')) return <XCircle size={14} className="text-red-500 inline" />;
    return null;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">数据管理中心</h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
              <Upload size={16} />
              {uploading ? '上传中...' : '上传数据'}
              <input type="file" accept=".xlsx" onChange={handleUpload} className="hidden" />
            </label>
          )}
          <button onClick={() => dataApi.downloadTemplate()} className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
            <FileSpreadsheet size={16} /> 下载模板
          </button>
          <button onClick={() => dataApi.exportData()} className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
            <Download size={16} /> 导出数据
          </button>
          <button onClick={loadData} className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
            <RefreshCw size={16} /> 刷新
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
      {success && <div className="bg-green-50 text-green-600 text-sm rounded-lg p-3 mb-4">{success}</div>}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {TABLE_CONFIG[tab].label}
          </button>
        ))}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 mb-4 text-sm text-gray-500">
        <span>记录数: <strong className="text-gray-800">{data.length}</strong></span>
        {tableStatus && (
          <>
            <span className="flex items-center gap-1">
              {completenessIcon(tableStatus.completeness as string)}
              <span>{tableStatus.completeness as string}</span>
            </span>
            <span>更新时间: {tableStatus.updated_at as string || '-'}</span>
          </>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-gray-600">#</th>
                {config.columns.map((col) => (
                  <th key={col.key} className="px-4 py-3 text-left font-medium text-gray-600">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr><td colSpan={config.columns.length + 1} className="text-center py-8 text-gray-400">暂无数据</td></tr>
              ) : (
                data.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-400">{idx + 1}</td>
                    {config.columns.map((col) => (
                      <td key={col.key} className="px-4 py-2.5 text-gray-700">
                        {String(row[col.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
