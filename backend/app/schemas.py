"""Pydantic schemas for API requests and responses."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional, List

from pydantic import BaseModel, Field


# ============= Auth =============
class RegisterRequest(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    password: str
    name: str = ""

class LoginRequest(BaseModel):
    account: str  # email or phone
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class UserResponse(BaseModel):
    id: int
    email: Optional[str]
    phone: Optional[str]
    name: str
    role: str
    created_at: str

class AdminUserUpdate(BaseModel):
    role: Optional[str] = None
    name: Optional[str] = None


# ============= SKU =============
class SKUItem(BaseModel):
    sku_code: str
    sku_name: str = ""
    sku_desc: str = ""

# ============= Warehouse =============
class WarehouseItem(BaseModel):
    warehouse_code: str
    warehouse_name: str
    warehouse_type: str = "standard"
    address: str = ""
    city: str = ""
    longitude: float = 0.0
    latitude: float = 0.0
    status: str = "active"

# ============= Inventory =============
class InventoryItem(BaseModel):
    sku_code: str
    warehouse_code: str
    quantity: int = 0
    last_counted_at: Optional[str] = None

# ============= Demand =============
class DemandItem(BaseModel):
    sku_code: str
    warehouse_code: str
    expected_demand: float = 0.0
    accuracy: float = 0.8

# ============= Transport Cost =============
class TransportCostItem(BaseModel):
    source_warehouse: str
    target_warehouse: str
    unit_cost: float = 0.0

# ============= Holding Cost =============
class HoldingCostItem(BaseModel):
    sku_code: str
    warehouse_code: str
    unit_cost: float = 0.0

# ============= Shortage Cost =============
class ShortageCostItem(BaseModel):
    sku_code: str
    warehouse_code: str
    unit_cost: float = 0.0

# ============= Warehouse Capacity =============
class WarehouseCapacityItem(BaseModel):
    warehouse_code: str
    max_capacity: float = 10000.0
    current_usage: float = 0.0
    usage_rate: float = 0.0


# ============= Business Rule =============
class BusinessRuleItem(BaseModel):
    rule_type: str  # TRANSPORT_BAN | MAX_TRANSPORT_QUANTITY
    rule_json: str
    enabled: bool = True

class BusinessRuleResponse(BusinessRuleItem):
    id: int
    created_by: Optional[int] = None
    created_at: str
    updated_at: str


# ============= Scenario =============
class ScenarioParams(BaseModel):
    target_service_level: float = Field(default=0.95, ge=0.5, le=1.0)
    min_transfer_qty: int = Field(default=10, ge=1)
    max_solve_time: int = Field(default=10, ge=1, le=60)
    transport_cost_coeff: float = Field(default=1.0, ge=0.5, le=2.0)
    shortage_cost_coeff: float = Field(default=1.0, ge=0.5, le=3.0)
    holding_cost_coeff: float = Field(default=1.0, ge=0.5, le=2.0)
    enable_transport_ban: bool = True
    enable_max_transport_limit: bool = True

class ScenarioItem(BaseModel):
    name: str
    description: str = ""
    params: ScenarioParams = Field(default_factory=ScenarioParams)
    is_default: bool = False

class ScenarioResponse(ScenarioItem):
    id: int
    created_by: Optional[int] = None
    created_at: str
    updated_at: str


# ============= Solver =============
class SolveRequest(BaseModel):
    algorithm: str  # baseline | heuristic | milp
    scenario_id: Optional[int] = None
    params: Optional[ScenarioParams] = None

class TransferAdvice(BaseModel):
    sku_code: str
    from_warehouse: str
    to_warehouse: str
    quantity: int
    transport_cost: float
    total_cost_impact: float

class SolveResult(BaseModel):
    algorithm: str
    total_cost: float
    transport_cost: float = 0.0
    holding_cost: float = 0.0
    shortage_cost: float = 0.0
    service_level: float = 0.0
    total_transfer_qty: int = 0
    transfer_count: int = 0
    advices: List[TransferAdvice] = []
    warehouse_sku_metrics: List[dict] = []
    model_info: Optional[dict] = None


# ============= History =============
class HistoryRecord(BaseModel):
    id: int
    solve_name: str
    algorithm_type: str
    scenario_id: Optional[int]
    scenario_name: Optional[str]
    params_snapshot: dict
    input_snapshot: dict
    result: dict
    status: str
    total_cost: float
    service_level: float
    model_file_lp: Optional[str]
    model_file_mps: Optional[str]
    model_variables: Optional[int]
    model_constraints: Optional[int]
    solver_status: Optional[str]
    is_starred: bool
    created_by: Optional[int]
    created_at: str


# ============= Compare =============
class CompareRequest(BaseModel):
    history_ids: List[int] = Field(min_length=2, max_length=10)

class CompareResult(BaseModel):
    records: List[HistoryRecord]
    summary: dict


# ============= Data Upload =============
class DataStatusResponse(BaseModel):
    table_name: str
    record_count: int
    completeness: str  # ✅完整 / ⚠️部分缺失 / ❌严重缺失
    updated_at: Optional[str]
