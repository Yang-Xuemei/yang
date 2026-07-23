import React, { useEffect, useRef, useState } from 'react';

/**
 * Map component using Leaflet to visualize transfer paths between warehouses.
 * Uses Amap tile service as basemap.
 */

// Warehouse coordinates (from seed data)
const WAREHOUSES: Record<string, { name: string; lng: number; lat: number }> = {
  'WH-BJ': { name: '北京仓', lng: 116.4074, lat: 39.9042 },
  'WH-SH': { name: '上海仓', lng: 121.4737, lat: 31.2304 },
  'WH-GZ': { name: '广州仓', lng: 113.2644, lat: 23.1291 },
};

// SKU color palette
const SKU_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

interface Advice {
  sku_code: string;
  from_warehouse: string;
  to_warehouse: string;
  quantity: number;
  transport_cost: number;
}

interface Props {
  advices: Advice[];
  height?: number;
}

export default function TransferMap({ advices, height = 400 }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    // Dynamically load leaflet
    const loadLeaflet = async () => {
      // Load CSS
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      // Load JS
      if (!(window as unknown as { L?: unknown }).L) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
          script.onload = () => resolve();
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const L = (window as unknown as { L: typeof import('leaflet') }).L;
      if (!L || !mapRef.current) return;

      // Initialize map
      if (mapInstance.current) {
        (mapInstance.current as { remove: () => void }).remove();
      }

      const map = L.map(mapRef.current, {
        center: [36.0, 103.8],
        zoom: 5,
        zoomControl: true,
      });

      // Amap tile layer
      L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        subdomains: '1234',
        attribution: '&copy; 高德地图',
        maxZoom: 18,
      }).addTo(map);

      mapInstance.current = map;

      // Add warehouse markers
      const usedWarehouses = new Set<string>();
      advices.forEach((a) => {
        usedWarehouses.add(a.from_warehouse);
        usedWarehouses.add(a.to_warehouse);
      });

      Object.entries(WAREHOUSES).forEach(([code, wh]) => {
        if (!usedWarehouses.has(code) && advices.length > 0) return;
        const marker = L.marker([wh.lat, wh.lng]).addTo(map);
        marker.bindPopup(`<strong>${wh.name}</strong><br>${code}`);
      });

      // Draw curved polylines for each advice
      const uniqueSkus = Array.from(new Set(advices.map((a) => a.sku_code)));
      advices.forEach((advice, idx) => {
        const from = WAREHOUSES[advice.from_warehouse];
        const to = WAREHOUSES[advice.to_warehouse];
        if (!from || !to) return;

        const color = SKU_COLORS[uniqueSkus.indexOf(advice.sku_code) % SKU_COLORS.length];

        // Create curved path (quadratic bezier)
        const points: [number, number][] = [];
        const steps = 20;
        const midLng = (from.lng + to.lng) / 2;
        const midLat = (from.lat + to.lat) / 2;
        const dx = to.lng - from.lng;
        const dy = to.lat - from.lat;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const offset = distance * 0.15;
        // Perpendicular offset for curve
        const ctrlLng = midLng - (dy / distance) * offset;
        const ctrlLat = midLat + (dx / distance) * offset;

        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const lng = (1 - t) * (1 - t) * from.lng + 2 * (1 - t) * t * ctrlLng + t * t * to.lng;
          const lat = (1 - t) * (1 - t) * from.lat + 2 * (1 - t) * t * ctrlLat + t * t * to.lat;
          points.push([lat, lng]);
        }

        const polyline = L.polyline(points, {
          color,
          weight: 2,
          opacity: 0.8,
          dashArray: '5, 5',
        }).addTo(map);

        polyline.bindTooltip(
          `<strong>${advice.sku_code}</strong><br>${from.name} → ${to.name}<br>数量: ${advice.quantity}<br>成本: ${advice.transport_cost.toFixed(2)}`,
          { sticky: true }
        );

        // Arrow at midpoint
        const midIdx = Math.floor(steps / 2);
        const arrowMarker = L.marker(points[midIdx], {
          icon: L.divIcon({
            className: 'transfer-arrow',
            html: `<div style="color:${color};font-size:16px;font-weight:bold;">▶</div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
        }).addTo(map);
      });

      // Fit bounds to visible markers
      if (usedWarehouses.size > 0) {
        const markers = Array.from(usedWarehouses)
          .map((c) => WAREHOUSES[c])
          .filter(Boolean)
          .map((w) => [w.lat, w.lng] as [number, number]);
        if (markers.length > 0) {
          map.fitBounds(markers, { padding: [50, 50] });
        }
      }
    };

    loadLeaflet();

    return () => {
      if (mapInstance.current) {
        (mapInstance.current as { remove: () => void }).remove();
        mapInstance.current = null;
      }
    };
  }, [advices]);

  return (
    <div className="relative">
      <div ref={mapRef} style={{ height: `${height}px`, width: '100%' }} className="rounded-lg border border-gray-200" />
      {/* Legend */}
      <div className="absolute bottom-2 right-2 bg-white/90 rounded-lg shadow-sm p-2 text-xs">
        {Array.from(new Set(advices.map((a) => a.sku_code))).map((sku, i) => (
          <div key={sku} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: SKU_COLORS[i % SKU_COLORS.length] }} />
            <span>{sku}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
