import sys
import numpy as np
import pandas as pd
from model import get_model

def run_prediction(csv_path):
    """Run model prediction on ECG CSV file"""
    
    # Build model
    model = get_model(n_classes=6, last_layer='sigmoid')
    
    try:
        # Load pretrained weights
        model.load_weights("static/models/model.hdf5")
        print("✅ Model weights loaded successfully")
    except:
        print("⚠️  Could not load model weights, using untrained model")
    
    # Load and preprocess ECG data
    df = pd.read_csv(csv_path, header=0)
    
    # Normalize column names
    df.columns = [c.strip().upper() for c in df.columns]
    
    # Expected 12 leads
    expected_leads = ["I","II","III","AVR","AVL","AVF","V1","V2","V3","V4","V5","V6"]
    
    # Keep only first 12 leads
    df = df[[c for c in df.columns if c in expected_leads]]
    
    # Ensure all expected leads exist
    for lead in expected_leads:
        if lead not in df.columns:
            df[lead] = 0.0
    
    # Reorder to model order
    df = df[expected_leads]
    
    # Convert to numpy
    ecg_array = df.to_numpy().astype(np.float32)
    
    print(f"Loaded ECG shape: {ecg_array.shape}")
    
    # Preprocess
    if ecg_array.shape[0] < 4096:
        pad_len = 4096 - ecg_array.shape[0]
        ecg_array = np.pad(ecg_array, ((0, pad_len), (0, 0)), mode="constant")
    
    if ecg_array.shape[0] > 4096:
        ecg_array = ecg_array[:4096, :]
    
    # Add batch dimension
    ecg_input = np.expand_dims(ecg_array, axis=0)
    
    print(f"Final ECG shape for model: {ecg_input.shape}")
    
    # Run prediction
    probs = model.predict(ecg_input, verbose=0)
    
    # Print results
    labels = ["1dAVb", "RBBB", "LBBB", "SB", "AF", "ST"]
    for label, p in zip(labels, probs[0]):
        print(f"{label}: {p:.3f}")
    
    # Normal vs Abnormal
    if all(p < 0.5 for p in probs[0]):
        print("Prediction: Normal ECG")
    else:
        print("Prediction: Abnormal ECG")
    
    return probs[0]

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python model_runner.py <csv_file_path>")
        sys.exit(1)
    
    csv_file = sys.argv[1]
    run_prediction(csv_file)