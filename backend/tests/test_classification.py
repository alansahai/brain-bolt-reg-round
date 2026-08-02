import pytest
import pandas as pd
from backend.src.classification import classify_fleet, load_config

def test_classification_on_real_data():
    df_bat = pd.read_csv("data/Problem_1_Battery_Fleet_200_Packs.csv")
    config = load_config("config.yaml")
    
    df_classified = classify_fleet(df_bat, config)
    
    assert "tier" in df_classified.columns
    assert "suitability_score" in df_classified.columns
    assert len(df_classified) == 200
    
    counts = df_classified["tier"].value_counts().to_dict()
    print("Classification counts:", counts)
    
    # Exact tier breakdown validation
    assert counts["SAFE"] == 98
    assert counts["DEGRADED"] == 61
    assert counts["UNSAFE"] == 41
    
    # Check quarantine override
    quarantined = df_classified[df_classified["station_status"] == "REVIEW/QUARANTINE"]
    assert (quarantined["tier"] == "UNSAFE").all()

    # Check suitability score range
    assert (df_classified["suitability_score"] >= 0.0).all()
    assert (df_classified["suitability_score"] <= 100.0).all()
