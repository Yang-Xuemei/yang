-- Inventory Transfer Assistant Database Schema (SQLite)
-- Idempotent DDL

-- Users and authentication
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    phone TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- SKU master data
CREATE TABLE IF NOT EXISTS skus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku_code TEXT UNIQUE NOT NULL,
    sku_name TEXT NOT NULL DEFAULT '',
    sku_desc TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Warehouse master data
CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_code TEXT UNIQUE NOT NULL,
    warehouse_name TEXT NOT NULL,
    warehouse_type TEXT NOT NULL DEFAULT 'standard',
    address TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    longitude REAL NOT NULL DEFAULT 0.0,
    latitude REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Current inventory
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku_code TEXT NOT NULL,
    warehouse_code TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    last_counted_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(sku_code, warehouse_code)
);

-- Demand forecast
CREATE TABLE IF NOT EXISTS demand_forecast (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku_code TEXT NOT NULL,
    warehouse_code TEXT NOT NULL,
    expected_demand REAL NOT NULL DEFAULT 0.0,
    accuracy REAL NOT NULL DEFAULT 0.8,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(sku_code, warehouse_code)
);

-- Transport cost
CREATE TABLE IF NOT EXISTS transport_cost (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_warehouse TEXT NOT NULL,
    target_warehouse TEXT NOT NULL,
    unit_cost REAL NOT NULL DEFAULT 0.0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(source_warehouse, target_warehouse)
);

-- Holding cost
CREATE TABLE IF NOT EXISTS holding_cost (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku_code TEXT NOT NULL,
    warehouse_code TEXT NOT NULL,
    unit_cost REAL NOT NULL DEFAULT 0.0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(sku_code, warehouse_code)
);

-- Shortage cost
CREATE TABLE IF NOT EXISTS shortage_cost (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku_code TEXT NOT NULL,
    warehouse_code TEXT NOT NULL,
    unit_cost REAL NOT NULL DEFAULT 0.0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(sku_code, warehouse_code)
);

-- Warehouse capacity
CREATE TABLE IF NOT EXISTS warehouse_capacity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_code TEXT UNIQUE NOT NULL,
    max_capacity REAL NOT NULL DEFAULT 10000.0,
    current_usage REAL NOT NULL DEFAULT 0.0,
    usage_rate REAL NOT NULL DEFAULT 0.0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Business rules (JSON format)
CREATE TABLE IF NOT EXISTS business_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('TRANSPORT_BAN', 'MAX_TRANSPORT_QUANTITY')),
    rule_json TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Parameter scenarios
CREATE TABLE IF NOT EXISTS scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    params_json TEXT NOT NULL DEFAULT '{}',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Solve history
CREATE TABLE IF NOT EXISTS solve_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solve_name TEXT NOT NULL,
    algorithm_type TEXT NOT NULL CHECK (algorithm_type IN ('baseline', 'heuristic', 'milp')),
    scenario_id INTEGER,
    scenario_name TEXT,
    params_snapshot_json TEXT NOT NULL DEFAULT '{}',
    input_snapshot_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'completed',
    model_file_lp TEXT,
    model_file_mps TEXT,
    model_variables INTEGER,
    model_constraints INTEGER,
    solver_status TEXT,
    total_cost REAL NOT NULL DEFAULT 0.0,
    service_level REAL NOT NULL DEFAULT 0.0,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_starred INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_sku_warehouse ON inventory(sku_code, warehouse_code);
CREATE INDEX IF NOT EXISTS idx_demand_sku_warehouse ON demand_forecast(sku_code, warehouse_code);
CREATE INDEX IF NOT EXISTS idx_holding_sku_warehouse ON holding_cost(sku_code, warehouse_code);
CREATE INDEX IF NOT EXISTS idx_shortage_sku_warehouse ON shortage_cost(sku_code, warehouse_code);
CREATE INDEX IF NOT EXISTS idx_history_created_at ON solve_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_algorithm ON solve_history(algorithm_type);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
