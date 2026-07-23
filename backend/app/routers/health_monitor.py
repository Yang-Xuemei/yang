"""Warehouse health monitoring router."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.database import get_connection

router = APIRouter(prefix="/api/health", tags=["health_monitor"])


@router.get("/warehouses", response_model=list)
def warehouse_health(user: dict = Depends(get_current_user)):
    """Compute health score for each warehouse.

    Score = 0.4 * risk_sku_score + 0.5 * avg_sufficiency_score + 0.1 * capacity_score
    Special cases:
      - total_inventory == 0 => score = 0 (danger)
      - no demand => score = 100 (idle/normal)
    """
    conn = get_connection()
    wh_rows = conn.execute("SELECT warehouse_code, warehouse_name, status FROM warehouses ORDER BY warehouse_code").fetchall()
    results = []

    for wh in wh_rows:
        code = wh["warehouse_code"]
        # Total inventory
        inv_total = conn.execute(
            "SELECT COALESCE(SUM(quantity), 0) as t FROM inventory WHERE warehouse_code = ?",
            (code,),
        ).fetchone()["t"]

        # Demand for this warehouse
        demands = conn.execute(
            "SELECT df.sku_code, df.expected_demand, COALESCE(i.quantity, 0) as qty "
            "FROM demand_forecast df LEFT JOIN inventory i ON df.sku_code = i.sku_code AND i.warehouse_code = ? "
            "WHERE df.warehouse_code = ?",
            (code, code),
        ).fetchall()

        if not demands or sum(d["expected_demand"] for d in demands) == 0:
            # No demand -> idle
            results.append({
                "warehouse_code": code,
                "warehouse_name": wh["warehouse_name"],
                "status": wh["status"],
                "health_score": 100.0,
                "health_level": "🟢正常",
                "total_inventory": inv_total,
                "risk_sku_count": 0,
                "total_sku_count": 0,
                "avg_sufficiency": 1.0,
                "capacity_rate": 0.0,
            })
            continue

        if inv_total == 0:
            results.append({
                "warehouse_code": code,
                "warehouse_name": wh["warehouse_name"],
                "status": wh["status"],
                "health_score": 0.0,
                "health_level": "🔴危险",
                "total_inventory": 0,
                "risk_sku_count": len(demands),
                "total_sku_count": len(demands),
                "avg_sufficiency": 0.0,
                "capacity_rate": 0.0,
            })
            continue

        # Compute sufficiency per SKU and risk count
        sufficiencies = []
        risk_count = 0
        total_demand = 0
        total_met = 0
        for d in demands:
            demand = d["expected_demand"]
            inv = d["qty"]
            total_demand += demand
            met = min(inv, demand)
            total_met += met
            if demand > 0:
                suff = min(inv / demand, 1.5)  # cap at 1.5 for scoring
            else:
                suff = 1.5 if inv > 0 else 0
            sufficiencies.append(suff)
            if inv < demand * 0.5:
                risk_count += 1

        avg_sufficiency = sum(sufficiencies) / len(sufficiencies) if sufficiencies else 0
        # Normalize avg_sufficiency to 0..1 score (1.0 = score 100)
        suff_score = min(avg_sufficiency, 1.0) * 100

        # Risk SKU ratio score: 100 * (1 - risk/total)
        risk_score = (1 - risk_count / len(demands)) * 100 if demands else 100

        # Capacity utilization score: best around 60-80%, penalty if too high or too low
        cap_row = conn.execute(
            "SELECT usage_rate FROM warehouse_capacity WHERE warehouse_code = ?",
            (code,),
        ).fetchone()
        cap_rate = cap_row["usage_rate"] if cap_row else 0
        if cap_rate <= 0.9:
            cap_score = 100 - abs(cap_rate - 0.7) * 100
        else:
            cap_score = max(0, 100 - (cap_rate - 0.7) * 200)
        cap_score = max(0, min(100, cap_score))

        health_score = 0.4 * risk_score + 0.5 * suff_score + 0.1 * cap_score
        health_score = max(0, min(100, round(health_score, 1)))

        if health_score > 80:
            level = "🟢正常"
        elif health_score >= 60:
            level = "🟡预警"
        else:
            level = "🔴危险"

        results.append({
            "warehouse_code": code,
            "warehouse_name": wh["warehouse_name"],
            "status": wh["status"],
            "health_score": health_score,
            "health_level": level,
            "total_inventory": inv_total,
            "risk_sku_count": risk_count,
            "total_sku_count": len(demands),
            "avg_sufficiency": round(avg_sufficiency, 3),
            "capacity_rate": round(cap_rate, 3),
        })

    return results
