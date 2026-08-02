"""
Explainable AI (XAI) layer for the Battery Suitability Score.

Deliberately lightweight and rule-based rather than SHAP/LIME: since the
Suitability Score is itself already a transparent weighted linear formula
(backend/src/classification.py), a full SHAP explainer would add dependency
weight and runtime cost to explain something that is already fully decomposed
analytically. Instead this module attributes the total score to its 5
component parts, ranks the largest positive and negative contributors, and
renders them as short human-readable reasons — the same information SHAP
would produce for a linear model, without the extra machinery.

Exposed via `GET /api/explain/{battery_id}`.
"""

from typing import Dict, Any, List
import numpy as np
import pandas as pd

from backend.src.classification import calculate_suitability_components, calculate_suitability_score

DEFAULTS = {
    "strong_contribution_threshold": 12.0,
    "mild_contribution_threshold": 4.0,
    "max_reasons_per_side": 3,
    "neutral_component_score": 60.0,
    "suitability_uncertainty_base_pts": 2.0,
    "suitability_uncertainty_std_scaling": 0.15,
}

FEATURE_LABELS = {
    "soh": {
        "name": "State of Health",
        "tiers": [(85, "Excellent State of Health"), (70, "Good State of Health"),
                  (50, "Moderate State of Health"), (0, "Poor State of Health")],
    },
    "internal_resistance": {
        "name": "Internal Resistance",
        "tiers": [(85, "Very Low Internal Resistance"), (70, "Low Internal Resistance"),
                  (50, "Moderate Internal Resistance"), (0, "High Internal Resistance")],
    },
    "voltage_imbalance": {
        "name": "Cell Balance",
        "tiers": [(85, "Excellent Cell Balance"), (70, "Good Cell Balance"),
                  (50, "Moderate Cell Balance"), (0, "Poor Cell Balance")],
    },
    "temperature": {
        "name": "Temperature",
        "tiers": [(85, "Very Low Temperature"), (70, "Low Temperature"),
                  (50, "Moderate Temperature"), (0, "High Temperature")],
    },
    "cycle_count": {
        "name": "Cycle Count",
        "tiers": [(85, "Very Low Cycle Count"), (70, "Low Cycle Count"),
                  (50, "Medium Cycle Count"), (0, "High Cycle Count")],
    },
}


def _xai_cfg(config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = dict(DEFAULTS)
    cfg.update((config or {}).get("explainability", {}))
    return cfg


def _label_for(feature_key: str, component_score: float) -> str:
    for threshold, label in FEATURE_LABELS[feature_key]["tiers"]:
        if component_score >= threshold:
            return label
    return FEATURE_LABELS[feature_key]["tiers"][-1][1]


def estimate_suitability_uncertainty(row: pd.Series, config: Dict[str, Any]) -> float:
    """Heuristic +/- confidence band on the 0-100 suitability score: widens when
    the 5 underlying component scores disagree strongly with each other (a
    battery that's excellent on some axes and poor on others is inherently
    harder to summarize with a single scalar)."""
    cfg = _xai_cfg(config)
    components = calculate_suitability_components(row, config)
    spread = float(np.std(list(components.values())))
    uncertainty = cfg["suitability_uncertainty_base_pts"] + cfg["suitability_uncertainty_std_scaling"] * spread
    return round(uncertainty, 2)


def generate_suitability_explanation(row: pd.Series, config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = _xai_cfg(config)
    weights = config["suitability_score"]["weights"]
    components = calculate_suitability_components(row, config)
    total_score = calculate_suitability_score(row, config)
    uncertainty = estimate_suitability_uncertainty(row, config)
    neutral = cfg["neutral_component_score"]

    weight_key_map = {
        "soh": "soh",
        "internal_resistance": "internal_resistance",
        "voltage_imbalance": "voltage_imbalance",
        "temperature": "temperature",
        "cycle_count": "cycle_count",
    }

    breakdown = []
    for feature_key, component_score in components.items():
        weight = weights[weight_key_map[feature_key]]
        contribution_pts = round(weight * component_score, 2)
        weighted_deviation = round(weight * (component_score - neutral), 2)
        sign = "+" if component_score >= neutral else "-"
        label = _label_for(feature_key, component_score)

        if abs(weighted_deviation) >= cfg["strong_contribution_threshold"]:
            strength = "strong"
        elif abs(weighted_deviation) >= cfg["mild_contribution_threshold"]:
            strength = "moderate"
        else:
            strength = "minor"

        breakdown.append({
            "feature": FEATURE_LABELS[feature_key]["name"],
            "component_score": round(component_score, 1),
            "weight": weight,
            "contribution_pts": contribution_pts,
            "weighted_deviation": weighted_deviation,
            "sign": sign,
            "strength": strength,
            "label": label,
            "reason_text": f"{sign} {label}",
        })

    # Rank by absolute weighted impact — largest positive/negative contributors first.
    positives = sorted(
        [b for b in breakdown if b["sign"] == "+"], key=lambda b: b["weighted_deviation"], reverse=True
    )[: cfg["max_reasons_per_side"]]
    negatives = sorted(
        [b for b in breakdown if b["sign"] == "-"], key=lambda b: b["weighted_deviation"]
    )[: cfg["max_reasons_per_side"]]

    reasons_formatted: List[str] = [b["reason_text"] for b in positives] + [b["reason_text"] for b in negatives]

    # Feature contribution bars: what % of the Suitability Score formula each
    # feature structurally represents (the config weights themselves), paired
    # with how well THIS battery performs on that feature (fill_pct), so the
    # bar communicates both "how much this matters" and "how this battery did."
    contribution_bars = sorted(
        [
            {
                "feature": b["feature"],
                "weight_pct": round(b["weight"] * 100.0, 1),
                "fill_pct": b["component_score"],
                "contribution_pts": b["contribution_pts"],
            }
            for b in breakdown
        ],
        key=lambda b: b["weight_pct"],
        reverse=True,
    )

    if positives:
        overall_strength = positives[0]["label"]
    else:
        overall_strength = "No standout strength — all factors are middling"

    if negatives:
        overall_weakness = negatives[0]["label"]
    else:
        overall_weakness = "No significant weakness detected"

    summary_text = (
        f"Suitability {total_score:.1f}/100 (+/-{uncertainty:.1f}). "
        f"Strongest factor: {overall_strength}. "
        f"Weakest factor: {overall_weakness}."
    )

    decision_summary = {
        "overall_strength": overall_strength,
        "overall_weakness": overall_weakness,
        "summary_text": summary_text,
    }

    return {
        "battery_id": str(row.get("battery_id", "UNKNOWN")),
        "suitability_score": total_score,
        "suitability_uncertainty_pts": uncertainty,
        "component_breakdown": breakdown,
        "feature_contribution_bars": contribution_bars,
        "positive_reasons": positives,
        "negative_reasons": negatives,
        "reasons_formatted": reasons_formatted,
        "decision_summary": decision_summary,
        "methodology": (
            "Rule-based feature-attribution: each of the 5 weighted Suitability Score "
            "components is compared against a neutral pivot score; components above the "
            "pivot become '+' reasons, below become '-' reasons, ranked by weight x deviation. "
            "Contribution bars show each feature's structural weight in the formula alongside "
            "this battery's actual performance on that feature."
        ),
    }
