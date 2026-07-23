-- Preset seed data: 3 warehouses, 6 SKUs, various inventory states
-- This is only inserted when warehouses table is empty

-- Warehouses
INSERT OR IGNORE INTO warehouses (warehouse_code, warehouse_name, warehouse_type, address, city, longitude, latitude, status)
VALUES
    ('WH-BJ', '北京仓', 'regional', '北京市朝阳区XX路100号', '北京', 116.4074, 39.9042, 'active'),
    ('WH-SH', '上海仓', 'regional', '上海市浦东新区XX路200号', '上海', 121.4737, 31.2304, 'active'),
    ('WH-GZ', '广州仓', 'regional', '广州市天河区XX路300号', '广州', 113.2644, 23.1291, 'active');

-- SKUs
INSERT OR IGNORE INTO skus (sku_code, sku_name, sku_desc)
VALUES
    ('SKU001', '智能手表', '高端智能手表，支持健康监测'),
    ('SKU002', '无线耳机', '主动降噪无线耳机'),
    ('SKU003', '移动电源', '20000mAh大容量充电宝'),
    ('SKU004', '蓝牙音箱', '便携式防水蓝牙音箱'),
    ('SKU005', '平板电脑', '10英寸平板电脑'),
    ('SKU006', '机械键盘', 'RGB背光机械键盘');

-- Inventory (mix of scenarios: shortage, surplus, normal)
INSERT OR IGNORE INTO inventory (sku_code, warehouse_code, quantity, last_counted_at)
VALUES
    ('SKU001', 'WH-BJ', 50, '2026-07-22 10:00:00'),
    ('SKU002', 'WH-BJ', 800, '2026-07-22 10:00:00'),
    ('SKU003', 'WH-BJ', 200, '2026-07-22 10:00:00'),
    ('SKU004', 'WH-BJ', 150, '2026-07-22 10:00:00'),
    ('SKU005', 'WH-BJ', 80, '2026-07-22 10:00:00'),
    ('SKU006', 'WH-BJ', 300, '2026-07-22 10:00:00'),
    ('SKU001', 'WH-SH', 400, '2026-07-22 10:00:00'),
    ('SKU002', 'WH-SH', 250, '2026-07-22 10:00:00'),
    ('SKU003', 'WH-SH', 30, '2026-07-22 10:00:00'),
    ('SKU004', 'WH-SH', 180, '2026-07-22 10:00:00'),
    ('SKU005', 'WH-SH', 900, '2026-07-22 10:00:00'),
    ('SKU006', 'WH-SH', 100, '2026-07-22 10:00:00'),
    ('SKU001', 'WH-GZ', 300, '2026-07-22 10:00:00'),
    ('SKU002', 'WH-GZ', 300, '2026-07-22 10:00:00'),
    ('SKU003', 'WH-GZ', 500, '2026-07-22 10:00:00'),
    ('SKU004', 'WH-GZ', 400, '2026-07-22 10:00:00'),
    ('SKU005', 'WH-GZ', 250, '2026-07-22 10:00:00'),
    ('SKU006', 'WH-GZ', 200, '2026-07-22 10:00:00');

-- Demand forecast
INSERT OR IGNORE INTO demand_forecast (sku_code, warehouse_code, expected_demand, accuracy)
VALUES
    ('SKU001', 'WH-BJ', 300.0, 0.85),
    ('SKU002', 'WH-BJ', 200.0, 0.88),
    ('SKU003', 'WH-BJ', 180.0, 0.82),
    ('SKU004', 'WH-BJ', 120.0, 0.90),
    ('SKU005', 'WH-BJ', 100.0, 0.87),
    ('SKU006', 'WH-BJ', 250.0, 0.84),
    ('SKU001', 'WH-SH', 200.0, 0.86),
    ('SKU002', 'WH-SH', 300.0, 0.89),
    ('SKU003', 'WH-SH', 400.0, 0.83),
    ('SKU004', 'WH-SH', 150.0, 0.91),
    ('SKU005', 'WH-SH', 400.0, 0.85),
    ('SKU006', 'WH-SH', 120.0, 0.82),
    ('SKU001', 'WH-GZ', 250.0, 0.87),
    ('SKU002', 'WH-GZ', 280.0, 0.88),
    ('SKU003', 'WH-GZ', 450.0, 0.84),
    ('SKU004', 'WH-GZ', 350.0, 0.92),
    ('SKU005', 'WH-GZ', 200.0, 0.86),
    ('SKU006', 'WH-GZ', 180.0, 0.83);

-- Transport cost (between warehouses)
INSERT OR IGNORE INTO transport_cost (source_warehouse, target_warehouse, unit_cost)
VALUES
    ('WH-BJ', 'WH-SH', 8.5),
    ('WH-SH', 'WH-BJ', 8.5),
    ('WH-BJ', 'WH-GZ', 12.0),
    ('WH-GZ', 'WH-BJ', 12.0),
    ('WH-SH', 'WH-GZ', 6.5),
    ('WH-GZ', 'WH-SH', 6.5);

-- Holding cost
INSERT OR IGNORE INTO holding_cost (sku_code, warehouse_code, unit_cost)
VALUES
    ('SKU001', 'WH-BJ', 2.5), ('SKU002', 'WH-BJ', 1.8), ('SKU003', 'WH-BJ', 1.5),
    ('SKU004', 'WH-BJ', 2.0), ('SKU005', 'WH-BJ', 5.0), ('SKU006', 'WH-BJ', 3.0),
    ('SKU001', 'WH-SH', 2.8), ('SKU002', 'WH-SH', 2.0), ('SKU003', 'WH-SH', 1.6),
    ('SKU004', 'WH-SH', 2.2), ('SKU005', 'WH-SH', 5.5), ('SKU006', 'WH-SH', 3.2),
    ('SKU001', 'WH-GZ', 2.2), ('SKU002', 'WH-GZ', 1.6), ('SKU003', 'WH-GZ', 1.3),
    ('SKU004', 'WH-GZ', 1.8), ('SKU005', 'WH-GZ', 4.8), ('SKU006', 'WH-GZ', 2.8);

-- Shortage cost
INSERT OR IGNORE INTO shortage_cost (sku_code, warehouse_code, unit_cost)
VALUES
    ('SKU001', 'WH-BJ', 15.0), ('SKU002', 'WH-BJ', 10.0), ('SKU003', 'WH-BJ', 8.0),
    ('SKU004', 'WH-BJ', 12.0), ('SKU005', 'WH-BJ', 30.0), ('SKU006', 'WH-BJ', 18.0),
    ('SKU001', 'WH-SH', 16.0), ('SKU002', 'WH-SH', 11.0), ('SKU003', 'WH-SH', 9.0),
    ('SKU004', 'WH-SH', 13.0), ('SKU005', 'WH-SH', 32.0), ('SKU006', 'WH-SH', 20.0),
    ('SKU001', 'WH-GZ', 14.0), ('SKU002', 'WH-GZ', 9.5), ('SKU003', 'WH-GZ', 7.5),
    ('SKU004', 'WH-GZ', 11.5), ('SKU005', 'WH-GZ', 28.0), ('SKU006', 'WH-GZ', 17.0);

-- Warehouse capacity
INSERT OR IGNORE INTO warehouse_capacity (warehouse_code, max_capacity, current_usage, usage_rate)
VALUES
    ('WH-BJ', 5000.0, 1580.0, 0.316),
    ('WH-SH', 6000.0, 1860.0, 0.310),
    ('WH-GZ', 5500.0, 1630.0, 0.296);

-- Default scenario
INSERT OR IGNORE INTO scenarios (name, description, is_default, params_json)
VALUES
    ('默认场景', '系统预置的标准参数场景', 1,
     '{"target_service_level":0.95,"min_transfer_qty":10,"max_solve_time":10,"transport_cost_coeff":1.0,"shortage_cost_coeff":1.0,"holding_cost_coeff":1.0,"enable_transport_ban":true,"enable_max_transport_limit":true}');
