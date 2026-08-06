import io
import pandas as pd
from typing import Dict, Any, List
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

RULE_LABELS = {
    "rule1_no_unsafe_allocated": "Rule 1: No unsafe/quarantined battery allocated",
    "rule2_no_duplicate_battery": "Rule 2: No battery assigned to more than one vehicle",
    "rule3_no_duplicate_vehicle": "Rule 3: No vehicle receives more than one battery",
    "rule4_min_soc_satisfied": "Rule 4: Allocated battery satisfies minimum acceptable SoC",
    "rule5_metrics_reproducible": "Rule 5: Reported metrics are recomputable from submitted assignments",
}


def generate_csv_export(assignments: List[Dict[str, Any]]) -> bytes:
    df = pd.DataFrame(assignments)
    output = io.StringIO()
    df.to_csv(output, index=False)
    return output.getvalue().encode("utf-8")


def generate_verification_log_csv(verification: Dict[str, bool], kpis: Dict[str, Any], allocator_name: str) -> bytes:
    rows = [
        {"check": RULE_LABELS.get(k, k), "result": "PASS" if v else "FAIL"}
        for k, v in verification.items() if k != "all_passed"
    ]
    rows.append({"check": "Overall", "result": "PASS" if verification.get("all_passed") else "FAIL"})
    for k, v in kpis.items():
        if k == "allocator_name":
            continue
        rows.append({"check": f"KPI: {k}", "result": str(v)})

    output = io.StringIO()
    output.write(f"Verification Log - {allocator_name}\n\n")
    pd.DataFrame(rows).to_csv(output, index=False)
    return output.getvalue().encode("utf-8")


def generate_summary_report_pdf(
    assignments: List[Dict[str, Any]],
    kpis: Dict[str, Any],
    verification: Dict[str, bool],
    allocator_name: str,
) -> bytes:
    """Single judge/management-facing PDF: KPI summary + Verification Rules
    1-5 compliance + a sample of the allocation table — the formatted overview
    that a raw CSV export can't provide on its own."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    story = []
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "ReportTitle", parent=styles["Heading1"], fontSize=18, leading=22,
        textColor=colors.HexColor("#1E293B"), spaceAfter=12
    )
    story.append(Paragraph(f"BatteryHealth Allocation Summary Report — {allocator_name}", title_style))
    story.append(Spacer(1, 10))

    # Executive Summary KPIs
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

    # Verification Rules 1-5
    overall_pass = verification.get("all_passed", False)
    story.append(Paragraph(
        f"<b>Verification Rules 1-5 Compliance — Overall: {'PASS' if overall_pass else 'FAIL'}</b>",
        styles["Heading2"]
    ))
    story.append(Spacer(1, 4))
    rule_data = [["Verification Rule", "Result"]]
    for k, v in verification.items():
        if k == "all_passed":
            continue
        rule_data.append([RULE_LABELS.get(k, k), "PASS" if v else "FAIL"])
    t_rules = Table(rule_data, colWidths=[420, 80])
    t_rules.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F172A')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F8FAFC')),
    ]))
    story.append(t_rules)
    story.append(Spacer(1, 15))

    # Sample Assignments
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
        if len(assignments) > 25:
            story.append(Spacer(1, 6))
            story.append(Paragraph(
                f"<i>Showing 25 of {len(assignments)} assignments — download the CSV export for the complete table.</i>",
                styles["Normal"]
            ))

    doc.build(story)
    return buffer.getvalue()
