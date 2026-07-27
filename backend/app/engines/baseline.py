"""Baseline cost calculation engine.

Computes the current state's cost without any transfer optimization.
"""
from __future__ import annotations

from typing import List, Tuple


def compute_baseline(
    conn,
    params: dict,
) -> dict:
    """
    Returns result dict with:
      total_cost, transport_cost, holding_cost, shortage_cost, service_level,
      total_transfer_qty, transfer_count, advices, warehouse_sku_metrics
    """
    transport_coeff = float(params.get("transport_cost_coeff", 1.0))
    shortage_coeff = float(params.get("shortage_cost_coeff", 1.0))
    holding_coeff = float(params.get("holding_cost_coeff", 1.0))

    # Load current data
    inventories = {
        (r["sku_code"], r["warehouse_code"]): r["quantity"]
        for r in conn.execute("SELECT * FROM inventory").fetchall()
    }
    demands = {
        (r["sku_code"], r["warehouse_code"]): r["expected_demand"]
        for r in conn.execute("SELECT * FROM demand_forecast").fetchall()
    }
    holding_costs = {
        (r["sku_code"], r["warehouse_code"]): r["unit_cost"]
        for r in conn.execute("SELECT * FROM holding_cost").fetchall()
    }
    shortage_costs = {
        (r["sku_code"], r["warehouse_code"]): r["unit_cost"]
        for r in conn.execute("SELECT * FROM shortage_cost").fetchall()
    }

    total_holding = 0.0
    total_shortage = 0.0
    total_demand = 0.0
    total_met = 0.0
    metrics = []

    for (sku, wh), demand in demands.items():
        inv = inventories.get((sku, wh), 0)
        h_cost = holding_costs.get((sku, wh), 0)
        s_cost = shortage_costs.get((sku, wh), 0)

        # Shortage
        shortage = max(0, demand - inv)
        shortage_cost = shortage * s_cost * shortage_coeff
        total_shortage += shortage_cost

        # Holding (ending inventory)
        ending = max(0, inv - demand)
        holding_cost = ending * h_cost * holding_coeff
        total_holding += holding_cost

        met = min(inv, demand)
        total_demand += demand
        total_met += met

        metrics.append({
            "sku_code": sku,
            "warehouse_code": wh,
            "current_inventory": inv,
            "demand": demand,
            "shortage": shortage,
            "ending_inventory": ending,
            "shortage_cost": shortage_cost,
            "holding_cost": holding_cost,
            "service_level": (met / demand) if demand > 0 else 1.0,
        })

    total_cost = total_holding + total_shortage  # transport = 0
    service_level = (total_met / total_demand) if total_demand > 0 else 1.0

    return {
        "total_cost": round(total_cost, 2),
        "transport_cost": 0.0,
        "holding_cost": round(total_holding, 2),
        "shortage_cost": round(total_shortage, 2),
        "service_level": round(service_level, 4),
        "total_transfer_qty": 0,
        "transfer_count": 0,
        "advices": [],
        "warehouse_sku_metrics": metrics,
        "model_info": None,
    }
