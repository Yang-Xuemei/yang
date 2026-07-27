import React, { useState, useEffect } from 'react';
import { healthApi } from '../lib/api';
import { Activity, TrendingUp, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface HealthData {
  warehouse_code: string;
  warehouse_name: string;
  status: string;
  health_score: number;
  health_level: string;
  total_inventory: number;
  risk_sku_count: number;
  total_sku_count: number;
  avg_sufficiency: number;
  capacity_rate: number;
}

export default function HealthMonitor() {
  const [data, setData] = useState<HealthData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    healthApi.warehouses()
      .then((res) => setData(res as unknown as HealthData[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-400">加载中...</div>;

  const getColor = (score: number) => {
    if (score > 80) return { bg: 'bg-green-50', text: 'text-green-600', bar: 'bg-green-500', icon: CheckCircle };
    if (score >= 60) return { bg: 'bg-yellow-50', text: 'text-yellow-600', bar: 'bg-yellow-500', icon: AlertTriangle };
    return { bg: 'bg-red-50', text: 'text-red-600', bar: 'bg-red-500', icon: XCircle };
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">库存健康监控</h1>
        <Activity size={24} className="text-blue-600" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.map((wh) => {
          const color = getColor(wh.health_score);
          const Icon = color.icon;
          return (
            <div key={wh.warehouse_code} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg text-gray-800">{wh.warehouse_name}</h3>
                  <p className="text-sm text-gray-400">{wh.warehouse_code}</p>
                </div>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${color.bg}`}>
                  <Icon size={24} className={color.text} />
                </div>
              </div>

              {/* Health score */}
              <div className="mb-4">
                <div className="flex items-end justify-between mb-1">
                  <span className="text-sm text-gray-500">健康度</span>
                  <span className={`text-2xl font-bold ${color.text}`}>{wh.health_score}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full">
                  <div
                    className={`h-full rounded-full ${color.bar} transition-all`}
                    style={{ width: `${wh.health_score}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">状态</span>
                  <span className="font-medium">{wh.health_level}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">总库存</span>
                  <span className="font-medium">{wh.total_inventory}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">风险SKU</span>
                  <span className="font-medium">{wh.risk_sku_count} / {wh.total_sku_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">充足率</span>
                  <span className="font-medium">{(wh.avg_sufficiency * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">容量使用率</span>
                  <span className="font-medium">{(wh.capacity_rate * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
