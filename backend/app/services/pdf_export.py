"""PDF report export using reportlab with CJK font support."""
from __future__ import annotations

import io
from datetime import datetime
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase.cidfonts import UnicodeCIDFont


# Register CJK font (CID font built into reportlab)
try:
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    CJK_FONT = "STSong-Light"
except Exception:
    CJK_FONT = "Helvetica"


def generate_report_pdf(history: dict) -> io.BytesIO:
    """Generate a PDF report for a solve history record."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("CJKTitle", parent=styles["Title"], fontName=CJK_FONT, fontSize=18)
    heading_style = ParagraphStyle("CJKHeading", parent=styles["Heading2"], fontName=CJK_FONT, fontSize=14)
    body_style = ParagraphStyle("CJKBody", parent=styles["Normal"], fontName=CJK_FONT, fontSize=10, leading=14)
    small_style = ParagraphStyle("CJKSmall", parent=styles["Normal"], fontName=CJK_FONT, fontSize=8, leading=10)

    elements = []

    # Cover
    elements.append(Paragraph("库存调拨助手 - 求解报告", title_style))
    elements.append(Spacer(1, 20))
    elements.append(Paragraph(f"求解编号: {history.get('solve_name', '')}", body_style))
    elements.append(Paragraph(f"求解时间: {history.get('created_at', '')}", body_style))
    elements.append(Paragraph(f"算法类型: {history.get('algorithm_type', '')}", body_style))
    elements.append(Paragraph(f"参数场景: {history.get('scenario_name', '未使用')}", body_style))
    elements.append(Paragraph(f"求解状态: {history.get('status', '')}", body_style))
    if history.get("model_variables"):
        elements.append(Paragraph(f"决策变量: {history.get('model_variables')}", body_style))
        elements.append(Paragraph(f"约束条件: {history.get('model_constraints')}", body_style))
    elements.append(Spacer(1, 20))

    # Parameters
    elements.append(Paragraph("参数配置", heading_style))
    params = history.get("params_snapshot", {}) or {}
    param_items = [
        ("目标服务水平", f"{params.get('target_service_level', 0.95) * 100:.1f}%"),
        ("最小调拨量", f"{params.get('min_transfer_qty', 10)} 件"),
        ("最大求解时间", f"{params.get('max_solve_time', 10)} 秒"),
        ("运输成本系数", f"{params.get('transport_cost_coeff', 1.0)}"),
        ("缺货成本系数", f"{params.get('shortage_cost_coeff', 1.0)}"),
        ("持仓成本系数", f"{params.get('holding_cost_coeff', 1.0)}"),
    ]
    param_table = Table([["参数项", "值"]] + [[k, v] for k, v in param_items],
                        colWidths=[120, 100])
    param_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), CJK_FONT),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(param_table)
    elements.append(Spacer(1, 15))

    # Results summary
    elements.append(Paragraph("求解结果", heading_style))
    result = history.get("result", {}) or {}
    summary_data = [
        ["总成本", f"{history.get('total_cost', 0):.2f}"],
        ["运输成本", f"{result.get('transport_cost', 0):.2f}"],
        ["缺货成本", f"{result.get('shortage_cost', 0):.2f}"],
        ["持仓成本", f"{result.get('holding_cost', 0):.2f}"],
        ["服务水平", f"{history.get('service_level', 0) * 100:.2f}%"],
        ["调拨次数", f"{result.get('transfer_count', 0)}"],
        ["调拨总量", f"{result.get('total_transfer_qty', 0)}"],
    ]
    summary_table = Table([["指标", "值"]] + summary_data, colWidths=[120, 100])
    summary_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), CJK_FONT),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 15))

    # Transfer advices
    advices = result.get("advices", []) or []
    if advices:
        elements.append(Paragraph("调拨建议明细", heading_style))
        adv_header = ["SKU", "源仓库", "目标仓库", "数量", "运输成本"]
        adv_rows = [adv_header]
        for a in advices[:30]:
            adv_rows.append([
                a.get("sku_code", ""),
                a.get("from_warehouse", ""),
                a.get("to_warehouse", ""),
                str(a.get("quantity", 0)),
                f"{a.get('transport_cost', 0):.2f}",
            ])
        adv_table = Table(adv_rows, colWidths=[70, 70, 70, 60, 70])
        adv_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), CJK_FONT),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        elements.append(adv_table)
        elements.append(Spacer(1, 15))

    # Metrics per warehouse-SKU
    metrics = result.get("warehouse_sku_metrics", []) or []
    if metrics:
        elements.append(PageBreak())
        elements.append(Paragraph("仓库-SKU 指标明细", heading_style))
        m_header = ["SKU", "仓库", "当前库存", "需求", "缺货量", "期末库存", "服务水平"]
        m_rows = [m_header]
        for m in metrics[:50]:
            sl = m.get("service_level", 0)
            m_rows.append([
                m.get("sku_code", ""),
                m.get("warehouse_code", ""),
                str(m.get("current_inventory", 0)),
                f"{m.get('demand', 0):.0f}",
                str(m.get("shortage", 0)),
                str(m.get("ending_inventory", 0)),
                f"{sl * 100:.1f}%",
            ])
        m_table = Table(m_rows, colWidths=[60, 60, 60, 55, 55, 60, 60])
        m_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), CJK_FONT),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        elements.append(m_table)

    # Footer
    elements.append(Spacer(1, 30))
    elements.append(Paragraph(f"报告生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", small_style))

    doc.build(elements)
    buf.seek(0)
    return buf
