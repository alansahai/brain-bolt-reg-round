import os
import io
import pandas as pd
from typing import Dict, Any, List
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_csv_export(assignments: List[Dict[str, Any]]) -> bytes:
    df = pd.DataFrame(assignments)
    output = io.StringIO()
    df.to_csv(output, index=False)
    return output.getvalue().encode("utf-8")

def generate_excel_export(
    assignments: List[Dict[str, Any]],
    kpis: Dict[str, Any],
    allocator_name: str
) -> bytes:
    wb = Workbook()
    ws_assignments = wb.active
    ws_assignments.title = "Assignments"

    # Header style
    header_fill = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")

    if assignments:
        headers = list(assignments[0].keys())
        ws_assignments.append(headers)
        for col_num in range(1, len(headers) + 1):
            cell = ws_assignments.cell(row=1, column=col_num)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        for row_data in assignments:
            ws_assignments.append(list(row_data.values()))

    # Metrics sheet
    ws_metrics = wb.create_sheet(title="KPI Summary")
    ws_metrics.append(["Metric", "Value"])
    ws_metrics.cell(row=1, column=1).font = header_font
    ws_metrics.cell(row=1, column=1).fill = header_fill
    ws_metrics.cell(row=1, column=2).font = header_font
    ws_metrics.cell(row=1, column=2).fill = header_fill

    for k, v in kpis.items():
        ws_metrics.append([str(k), str(v)])

    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()

def generate_pdf_export(
    assignments: List[Dict[str, Any]],
    kpis: Dict[str, Any],
    allocator_name: str
) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    story = []
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#1E293B"),
        spaceAfter=12
    )

    story.append(Paragraph(f"BatteryHealth Allocation Report — {allocator_name}", title_style))
    story.append(Spacer(1, 10))

    # KPI Summary Table
    story.append(Paragraph("<b>Executive Summary KPIs:</b>", styles["Heading2"]))
    kpi_data = [["Metric", "Value"]]
    for k, v in kpis.items():
        kpi_data.append([str(k).replace("_", " ").title(), str(v)])

    t_kpi = Table(kpi_data, colWidths=[250, 250])
    t_kpi.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F172A')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F8FAFC')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
    ]))
    story.append(t_kpi)
    story.append(Spacer(1, 15))

    # Top Assignments Table
    story.append(Paragraph("<b>Sample Vehicle Assignments:</b>", styles["Heading2"]))
    if assignments:
        cols = ["request_id", "vehicle_type", "priority", "battery_id", "battery_soc", "battery_soh", "battery_tier"]
        ass_data = [[c.replace("_", " ").title() for c in cols]]
        for row in assignments[:25]:  # Top 25 for clean PDF fit
            ass_data.append([str(row.get(c, "")) for c in cols])

        t_ass = Table(ass_data, colWidths=[65, 85, 55, 65, 65, 65, 65])
        t_ass.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#334155')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ]))
        story.append(t_ass)

    doc.build(story)
    return buffer.getvalue()
