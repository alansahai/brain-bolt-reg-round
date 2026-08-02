import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import joblib
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor, StackingRegressor
from sklearn.linear_model import Ridge
from sklearn.model_selection import KFold, cross_validate
from sklearn.metrics import mean_squared_error, r2_score
from backend.src.classification import classify_fleet, load_config

FEATURE_COLS = [
    "state_of_health_percent",
    "internal_resistance_mOhm",
    "cell_voltage_imbalance_mV",
    "temperature_C",
    "max_temperature_last_24h_C",
    "cycle_count",
    "age_years",
]

def compute_electrochemistry_weak_label(row: pd.Series) -> float:
    """
    Computes a non-linear battery health index capturing physical electrochemistry degradation:
    1. Quadratic thermal-resistance interaction: P_loss = I^2 * R_int at elevated operating temp.
    2. Non-linear cell imbalance penalty: Weakest-cell capacity limiting effect (V_imb^1.8).
    3. Discontinuous tier boundary step-down penalties.
    """
    linear_score = row["suitability_score"]

    # 1. Non-linear thermal-resistance coupling
    ir_norm = max(0.0, (row["internal_resistance_mOhm"] - 30.0) / 60.0)
    temp_norm = max(0.0, (row["temperature_C"] - 15.0) / 40.0)
    thermal_penalty = 18.0 * ir_norm * (temp_norm ** 2)

    # 2. Non-linear cell voltage imbalance
    imb_norm = max(0.0, row["cell_voltage_imbalance_mV"] / 120.0)
    imbalance_penalty = 15.0 * (imb_norm ** 1.8)

    # 3. Tier step-down penalty
    tier_penalty = 0.0
    if row["tier"] == "DEGRADED":
        tier_penalty = 12.0
    elif row["tier"] == "UNSAFE":
        tier_penalty = 35.0

    score = linear_score - thermal_penalty - imbalance_penalty - tier_penalty
    return float(np.clip(score, 0.0, 100.0))

def train_ml_ensemble(
    csv_path: str = "data/Problem_1_Battery_Fleet_200_Packs.csv",
    config_path: str = "config.yaml",
    models_dir: str = "backend/ml/models"
):
    os.makedirs(models_dir, exist_ok=True)

    df_raw = pd.read_csv(csv_path)
    config = load_config(config_path)
    df_classified = classify_fleet(df_raw, config)

    # Generate non-linear electrochemistry weak label
    df_classified["weak_label"] = df_classified.apply(compute_electrochemistry_weak_label, axis=1)

    X = df_classified[FEATURE_COLS]
    y = df_classified["weak_label"]

    # Base estimators & stacking regressor
    rf = RandomForestRegressor(n_estimators=100, max_depth=5, random_state=42)
    gbr = GradientBoostingRegressor(n_estimators=100, max_depth=3, learning_rate=0.05, random_state=42)
    ridge = Ridge(alpha=1.0)

    estimators = [("rf", rf), ("gbr", gbr), ("ridge", ridge)]

    stack = StackingRegressor(
        estimators=estimators,
        final_estimator=Ridge(alpha=0.5),
        cv=5
    )

    # 5-Fold Cross-Validation Evaluation (Held-out vs Train)
    kf = KFold(n_splits=5, shuffle=True, random_state=42)
    cv_results = cross_validate(
        stack, X, y, cv=kf, scoring=["r2", "neg_root_mean_squared_error"], return_train_score=True
    )

    train_r2 = float(np.mean(cv_results["train_r2"]))
    train_rmse = float(-np.mean(cv_results["train_neg_root_mean_squared_error"]))
    test_r2 = float(np.mean(cv_results["test_r2"]))
    test_rmse = float(-np.mean(cv_results["test_neg_root_mean_squared_error"]))

    print(f"=== ML ENSEMBLE 5-FOLD CROSS VALIDATION ===")
    print(f"Train R^2: {train_r2:.4f} | Train RMSE: {train_rmse:.4f}")
    print(f"Held-out Test CV R^2: {test_r2:.4f} | Held-out Test CV RMSE: {test_rmse:.4f}")

    # Fit final model on full fleet dataset for inference
    stack.fit(X, y)
    rf.fit(X, y)
    gbr.fit(X, y)
    ridge.fit(X, y)

    # Save artifacts
    joblib.dump(stack, os.path.join(models_dir, "stack.pkl"))
    joblib.dump(rf, os.path.join(models_dir, "rf.pkl"))
    joblib.dump(gbr, os.path.join(models_dir, "gbr.pkl"))
    joblib.dump(ridge, os.path.join(models_dir, "ridge.pkl"))

    metrics = {
        "train_r2": train_r2,
        "train_rmse": train_rmse,
        "test_cv_r2": test_r2,
        "test_cv_rmse": test_rmse,
        "samples": len(X)
    }
    
    with open(os.path.join(models_dir, "cv_metrics.json"), "w") as f:
        import json
        json.dump(metrics, f, indent=2)

    return metrics

if __name__ == "__main__":
    train_ml_ensemble()
