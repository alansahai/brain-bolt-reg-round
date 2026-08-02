import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
import json
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Tuple
from backend.src.classification import classify_fleet, load_config
from backend.src.allocators.proposed_priority_score import ProposedPriorityScoreAllocator

def evaluate_episode_reward(
    allocator_config: Dict[str, Any],
    classified_bats: pd.DataFrame,
    requests_df: pd.DataFrame
) -> float:
    allocator = ProposedPriorityScoreAllocator(allocator_config)
    res = allocator.allocate(classified_bats, requests_df)

    if res.unsafe_allocations_count > 0:
        return -10000.0  # Hard penalty for unsafe allocation

    # Reward function components:
    # w1: High/Critical served %
    # w2: Avg SoH allocated
    # w3: Avg Suitability Score allocated
    w1, w2, w3 = 1.0, 0.5, 0.5
    reward = (
        w1 * res.high_critical_served_pct +
        w2 * res.avg_soh_allocated +
        w3 * res.avg_suitability_allocated
    )
    return float(reward)

def tune_policy_weights(
    num_episodes: int = 100,
    config_path: str = "config.yaml",
    models_dir: str = "backend/ml/models"
) -> Dict[str, Any]:
    os.makedirs(models_dir, exist_ok=True)
    
    df_bat = pd.read_csv("data/Problem_1_Battery_Fleet_200_Packs.csv")
    df_veh = pd.read_csv("data/Problem_1_Vehicle_Demand_50_Requests.csv")
    base_config = load_config(config_path)
    classified_bats = classify_fleet(df_bat, base_config)

    best_reward = -float("inf")
    best_weights = {
        "soc_weight": 0.3,
        "soh_weight": 0.35,
        "suitability_weight": 0.35
    }

    np.random.seed(42)

    for i in range(num_episodes):
        # Sample candidate weight vector
        w_soc = float(np.random.uniform(0.1, 0.6))
        w_soh = float(np.random.uniform(0.2, 0.6))
        w_suit = float(np.random.uniform(0.2, 0.6))
        
        # Normalize sum to 1.0
        total = w_soc + w_soh + w_suit
        w_soc, w_soh, w_suit = round(w_soc/total, 3), round(w_soh/total, 3), round(w_suit/total, 3)

        trial_config = base_config.copy()
        trial_config["allocator_policy"] = trial_config.get("allocator_policy", {}).copy()
        trial_config["allocator_policy"]["soc_weight"] = w_soc
        trial_config["allocator_policy"]["soh_weight"] = w_soh
        trial_config["allocator_policy"]["suitability_weight"] = w_suit

        # Shuffle vehicle arrival order slightly to simulate sequence variations
        veh_shuffled = df_veh.sample(frac=1.0, random_state=i).reset_index(drop=True)
        
        reward = evaluate_episode_reward(trial_config, classified_bats, veh_shuffled)
        
        if reward > best_reward:
            best_reward = reward
            best_weights = {
                "soc_weight": w_soc,
                "soh_weight": w_soh,
                "suitability_weight": w_suit,
                "best_reward": round(reward, 2)
            }

    print(f"=== POLICY TUNER CONVERGED ===")
    print(f"Episodes evaluated: {num_episodes}")
    print(f"Optimal Policy Weights: {best_weights}")
    print(f"Max Simulated Reward: {best_reward:.2f}")

    out_path = os.path.join(models_dir, "policy_weights.json")
    with open(out_path, "w") as f:
        json.dump(best_weights, f, indent=2)

    return best_weights

if __name__ == "__main__":
    tune_policy_weights()
