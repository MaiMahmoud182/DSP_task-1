from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
import os
import numpy as np
import pandas as pd
import io
import traceback
import sys

# Try to import TensorFlow with better error handling
try:
    import tensorflow as tf
    from tensorflow.keras.models import Model
    TENSORFLOW_AVAILABLE = True
    print("✅ TensorFlow imported successfully")
except ImportError as e:
    TENSORFLOW_AVAILABLE = False
    print(f"❌ TensorFlow not available: {e}")
    print("Please install TensorFlow: pip install tensorflow")

# Try to import your model
try:
    from model import get_model
    MODEL_AVAILABLE = True
    print("✅ Model architecture imported successfully")
except ImportError as e:
    MODEL_AVAILABLE = False
    print(f"❌ Could not import model: {e}")

app = Flask(__name__, 
            template_folder='../Frontend',
            static_folder='../Frontend/assets')

# Enable CORS for all routes
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://127.0.0.1:5500", "http://localhost:5500", "http://127.0.0.1:3000" , "http://127.0.0.1:5000",],
        "methods": ["GET", "POST"],
        "allow_headers": ["Content-Type"]
    }
})
app.config['SECRET_KEY'] = 'ecg-analyzer-secret-key'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

# Configuration
ALLOWED_EXTENSIONS = {'csv', 'txt'}
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Model configuration
MODEL_LABELS = ["1dAVb", "RBBB", "LBBB", "SB", "AF", "ST"]
MODEL_PATH = "static/models/model.hdf5"
NORMAL_THRESHOLD = 0.2

# Initialize model and ECG data
model = None
ecg_data_global = None
theta_global = None
sampling_rate_global = 360

def load_model():
    """Load the ECG model with proper error handling"""
    global model
    
    if not TENSORFLOW_AVAILABLE:
        print("❌ TensorFlow not available - cannot load model")
        return False
        
    if not MODEL_AVAILABLE:
        print("❌ Model architecture not available - cannot load model")
        return False
        
    try:
        print("🔄 Loading ECG model...")
        model = get_model(n_classes=6, last_layer='sigmoid')
        
        if not os.path.exists(MODEL_PATH):
            print(f"❌ Model file not found at: {MODEL_PATH}")
            return False
            
        model.load_weights(MODEL_PATH)
        print("✅ ECG model loaded successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        model = None
        return False

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def parse_ecg_csv(file_content, sampling_rate=360):
    """Parse ECG CSV file with 12 leads and headers"""
    global ecg_data_global, theta_global, sampling_rate_global
    
    try:
        print("📊 Parsing ECG CSV file...")
        
        # Read CSV with headers
        df = pd.read_csv(io.StringIO(file_content))
        
        print(f"✅ CSV loaded successfully")
        print(f"📏 Shape: {df.shape}")
        print(f"📋 Columns: {df.columns.tolist()}")
        
        # Normalize column names (uppercase, remove spaces)
        df.columns = [c.strip().upper() for c in df.columns]
        
        # Expected 12 leads (model order)
        expected_leads = ["I", "II", "III", "AVR", "AVL", "AVF", "V1", "V2", "V3", "V4", "V5", "V6"]
        
        # Keep only first 12 leads if file has extra columns
        available_leads = [c for c in df.columns if c in expected_leads]
        df = df[available_leads]
        
        # Ensure all expected leads exist (fill missing with zeros)
        for lead in expected_leads:
            if lead not in df.columns:
                df[lead] = 0.0
                print(f"⚠️  Lead {lead} not found, filled with zeros")

        # Reorder to model order
        df = df[expected_leads]

        # Convert to list format for frontend
        leads = []
        for lead_name in expected_leads:
            lead_data = df[lead_name].dropna().values.tolist()
            leads.append(lead_data)
            print(f"📈 Lead {lead_name}: {len(lead_data)} samples")
        
        # Ensure all leads have the same length
        max_length = max(len(lead) for lead in leads)
        print(f"📏 Max lead length: {max_length}")
        
        for i in range(len(leads)):
            if len(leads[i]) < max_length:
                padding_needed = max_length - len(leads[i])
                leads[i].extend([0] * padding_needed)
        
        # Calculate theta values for polar plot
        time = np.arange(max_length) / sampling_rate
        theta = 360 * (time / max(time)) if max(time) > 0 else np.zeros(max_length)
        
        # Store globally for polar plot access
        ecg_data_global = {
            'leads': leads,
            'lead_names': expected_leads,
            'max_length': max_length
        }
        theta_global = theta.tolist()
        sampling_rate_global = sampling_rate
        
        # Convert DataFrame to JSON-serializable format
        df_dict = {
            'columns': df.columns.tolist(),
            'data': df.values.tolist(),
            'shape': list(df.shape)
        }
        
        return {
            'leads': leads,
            'sampling_rate': sampling_rate,
            'duration': max_length / sampling_rate,
            'lead_names': expected_leads,
            'samples_per_lead': max_length,
            'dataframe': df_dict,  # JSON-serializable format
            'theta': theta.tolist()  # Add theta values for polar plot
        }
        
    except Exception as e:
        print(f"❌ Error parsing ECG CSV: {e}")
        traceback.print_exc()
        return None

def preprocess_ecg_for_model(df_dict):
    """Preprocess ECG data for model input"""
    try:
        # Reconstruct DataFrame from dictionary
        df = pd.DataFrame(df_dict['data'], columns=df_dict['columns'])
        
        # Convert to numpy
        ecg_array = df.to_numpy().astype(np.float32)
        print(f"📊 Loaded ECG shape (raw): {ecg_array.shape}")

        # Pad if shorter than 4096
        if ecg_array.shape[0] < 4096:
            pad_len = 4096 - ecg_array.shape[0]
            ecg_array = np.pad(ecg_array, ((0, pad_len), (0, 0)), mode="constant")
            print(f"📏 Padded ECG to: {ecg_array.shape}")

        # Truncate if longer
        if ecg_array.shape[0] > 4096:
            ecg_array = ecg_array[:4096, :]
            print(f"📏 Truncated ECG to: {ecg_array.shape}")

        # Safety: if only 1 lead → duplicate across 12
        if ecg_array.shape[1] == 1:
            ecg_array = np.tile(ecg_array, (1, 12))
            print("⚠️  Duplicated single lead to 12 channels")

        # Keep as-is (no scaling as per your code)
        # Add batch dimension → (1, 4096, 12)
        ecg_input = np.expand_dims(ecg_array, axis=0)

        print(f"✅ Final ECG shape for model: {ecg_input.shape}")
        return ecg_input
        
    except Exception as e:
        print(f"❌ Error preprocessing ECG data: {e}")
        traceback.print_exc()
        return None

def classify_with_ecg_model(df_dict):
    """Classify ECG using your trained model with your exact logic"""
    try:
        # Preprocess data
        ecg_input = preprocess_ecg_for_model(df_dict)
        if ecg_input is None:
            raise Exception("Preprocessing failed")
        
        # Run prediction
        print("🧠 Running model prediction...")
        probs = model.predict(ecg_input, verbose=0)
        print(f"✅ Model prediction completed: {probs[0]}")
        
        # YOUR EXACT LOGIC from working code
        predictions = []
        max_prob = 0
        max_condition = ""
        
        for label, probability in zip(MODEL_LABELS, probs[0]):
            prob_float = float(probability)
            
            predictions.append({
                'condition': label,
                'probability': prob_float,
                'confidence': 'High' if prob_float > 0.7 else 'Medium' if prob_float > 0.4 else 'Low'
            })
            
            if prob_float > max_prob:
                max_prob = prob_float
                max_condition = label
        
        # Sort by probability (descending)
        predictions.sort(key=lambda x: x['probability'], reverse=True)
        
        # YOUR LOGIC: If all probabilities < 0.2 → Normal, else highest probability
        if all(p['probability'] < NORMAL_THRESHOLD for p in predictions):
            primary_diagnosis = "Normal ECG"
            is_normal = True
            is_abnormal = False
            message = "Normal ECG ✅"
        else:
            primary_diagnosis = max_condition
            is_normal = False
            is_abnormal = True
            message = "Abnormal ECG ⚠️"
        
        return {
            'predictions': predictions,
            'primary_diagnosis': primary_diagnosis,
            'is_abnormal': is_abnormal,
            'is_normal': is_normal,
            'model_used': True,
            'message': message,
            'confidence': max_prob if not is_normal else 1.0 - max(p['probability'] for p in predictions),
            'raw_probabilities': {label: float(prob) for label, prob in zip(MODEL_LABELS, probs[0])}
        }
        
    except Exception as e:
        print(f"❌ Error in model classification: {e}")
        traceback.print_exc()
        raise e

def detect_r_peaks(signal_data, sampling_rate=360):
    """Detect R peaks in ECG signal"""
    if len(signal_data) == 0:
        return []
    
    signal_array = np.array(signal_data)
    
    # Simple peak detection
    threshold = np.mean(signal_array) + 2 * np.std(signal_array)
    peaks = []
    min_peak_distance = int(0.3 * sampling_rate)
    
    for i in range(min_peak_distance, len(signal_array) - min_peak_distance):
        if (signal_array[i] > threshold and 
            signal_array[i] == np.max(signal_array[i-min_peak_distance:i+min_peak_distance])):
            peaks.append(i)
    
    return peaks

def calculate_heart_rate(lead_data, sampling_rate=360):
    """Calculate heart rate from lead data"""
    if not lead_data or len(lead_data) < sampling_rate:
        return 0
    
    r_peaks = detect_r_peaks(lead_data, sampling_rate)
    
    if len(r_peaks) < 2:
        return 0
    
    rr_intervals = np.diff(r_peaks) / sampling_rate
    avg_rr = np.mean(rr_intervals)
    heart_rate = int(60 / avg_rr) if avg_rr > 0 else 0
    
    return heart_rate

def calculate_rr_interval(lead_data, sampling_rate=360):
    """Calculate average RR interval in milliseconds"""
    r_peaks = detect_r_peaks(lead_data, sampling_rate)
    
    if len(r_peaks) < 2:
        return 0
    
    rr_intervals = np.diff(r_peaks) / sampling_rate
    avg_rr_ms = np.mean(rr_intervals) * 1000
    
    return int(avg_rr_ms)

def assess_signal_quality(leads):
    """Assess signal quality based on variance and dynamics"""
    if not leads:
        return 0
    
    qualities = []
    for lead in leads:
        if lead and len(lead) > 10:
            lead_array = np.array(lead)
            signal_range = np.max(lead_array) - np.min(lead_array)
            
            if signal_range > 0.1:
                quality = min(100, 80 + (signal_range * 50))
            else:
                quality = 30
                
            qualities.append(quality)
    
    return int(np.mean(qualities)) if qualities else 50

# ==================== ROUTES ====================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ecg-analysis')
def ecg_analysis():
    return render_template('ECG-Analysis.html')

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory('../Frontend/assets', filename)

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    model_loaded = model is not None
    return jsonify({
        'status': 'healthy',
        'message': 'ECG Analyzer API is running!',
        'model_loaded': model_loaded,
        'model_labels': MODEL_LABELS,
        'normal_threshold': NORMAL_THRESHOLD,
        'endpoints': {
            'upload_ecg': 'POST /api/upload-ecg',
            'classify_ecg': 'POST /api/classify-ecg',
            'get_polar_data': 'GET /api/get_polar_data/<mode>'
        }
    })

@app.route('/api/upload-ecg', methods=['POST'])
def upload_ecg():
    print("\n" + "="*50)
    print("📁 ECG UPLOAD ENDPOINT CALLED")
    print("="*50)
    
    try:
        if 'ecg_file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['ecg_file']
        print(f"📄 File received: {file.filename}")
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type'}), 400

        # Read file content
        file_content = file.read().decode('utf-8')
        
        print(f"📊 File size: {len(file_content)} characters")
        
        sampling_rate = int(request.form.get('sampling_rate', 360))
        print(f"🎯 Sampling rate: {sampling_rate} Hz")

        ecg_data = parse_ecg_csv(file_content, sampling_rate)
        
        if ecg_data is None:
            return jsonify({'error': 'Failed to parse ECG file'}), 400
        
        lead_ii_data = ecg_data['leads'][1] if len(ecg_data['leads']) > 1 else ecg_data['leads'][0]
        
        basic_analysis = {
            'heart_rate': calculate_heart_rate(lead_ii_data, sampling_rate),
            'rr_interval': calculate_rr_interval(lead_ii_data, sampling_rate),
            'signal_quality': assess_signal_quality(ecg_data['leads']),
            'total_beats': len(detect_r_peaks(lead_ii_data, sampling_rate))
        }
        
        response_data = {
            'message': 'ECG file processed successfully!',
            'data': ecg_data,
            'analysis': basic_analysis
        }
        
        print("✅ File parsed successfully!")
        print(f"❤️  Heart Rate: {basic_analysis['heart_rate']} bpm")
        print("="*50)
        
        return jsonify(response_data)
        
    except Exception as e:
        print(f"💥 Upload error: {str(e)}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/classify-ecg', methods=['POST'])
def classify_ecg_route():
    print("\n" + "="*50)
    print("🧠 CLASSIFICATION ENDPOINT CALLED")
    print("="*50)
    
    try:
        data = request.get_json()
        
        if not data or 'ecg_data' not in data:
            return jsonify({'error': 'No ECG data provided'}), 400
        
        ecg_leads = data['ecg_data']
        sampling_rate = data.get('sampling_rate', 360)
        
        if len(ecg_leads) != 12:
            return jsonify({'error': 'Expected 12 leads of ECG data'}), 400
        
        print(f"📊 Classifying ECG with {len(ecg_leads[0])} samples per lead...")
        
        # Create DataFrame for model input (using your exact column order)
        df_dict = {
            'columns': ['I', 'II', 'III', 'AVR', 'AVL', 'AVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'],
            'data': list(zip(*ecg_leads)),  # Transpose the leads
            'shape': [len(ecg_leads[0]), 12]
        }
        
        # Check if model is loaded
        if model is None:
            return jsonify({'error': 'Model not loaded. Please check server logs.'}), 500
        
        # Classify using your model
        classification_result = classify_with_ecg_model(df_dict)
        
        print(f"✅ Classification completed!")
        print(f"🏥 Primary diagnosis: {classification_result['primary_diagnosis']}")
        print(f"📊 Probabilities: {classification_result['raw_probabilities']}")
        print("="*50)
        
        return jsonify(classification_result)
        
    except Exception as e:
        print(f"💥 Classification error: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/get_polar_data/<mode>', methods=['GET'])
def get_polar_data(mode):
    """Get polar plot data with fixed or cumulative mode - EXACTLY like your first code"""
    try:
        print(f"\n🎯 POLAR DATA REQUEST - Mode: {mode}")
        
        if ecg_data_global is None or theta_global is None:
            print("❌ No ECG data loaded globally")
            return jsonify({'error': 'No ECG data loaded. Please upload a file first.'}), 400
        
        # Get current time from query parameters
        current_time = request.args.get('current_time', '0')
        try:
            current_time = float(current_time)
        except ValueError:
            current_time = 0.0
            
        print(f"📊 Current time: {current_time}s")
        print(f"🎯 Sampling rate: {sampling_rate_global} Hz")
        print(f"📏 Data length: {ecg_data_global['max_length']} samples")
        
        window_samples = sampling_rate_global * 2  # 2-second window
        
        if mode == "fixed":
            # Use current position for animation
            start = int(current_time * sampling_rate_global)
            start = max(0, start)
            # Ensure we don't go beyond data length
            if start + window_samples > ecg_data_global['max_length']:
                start = max(0, ecg_data_global['max_length'] - window_samples)
            end = start + window_samples
            print(f"🔧 Fixed mode - Start: {start}, End: {end}")
        else:
            # Cumulative mode - start from beginning
            start = 0
            end = ecg_data_global['max_length']
            print(f"🔧 Cumulative mode - Start: {start}, End: {end}")

        data = {}
        for i, lead_name in enumerate(ecg_data_global['lead_names']):
            lead_data = ecg_data_global['leads'][i]
            
            # Get the appropriate slice
            end_idx = min(end, len(lead_data))
            r = lead_data[start:end_idx]
            th = theta_global[start:end_idx]
            
            data[lead_name] = {
                "r": r,
                "theta": th
            }
            
            print(f"📈 Lead {lead_name}: {len(r)} samples")

        print("✅ Polar data prepared successfully")
        return jsonify(data)
        
    except Exception as e:
        print(f"❌ Error in get_polar_data: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Load model on startup
    model_loaded = load_model()
    
    print("\n" + "="*60)
    print("🚀 STARTING ECG ANALYZER SERVER")
    print("="*60)
    print("📍 Server URL: http://localhost:5000")
    print("📍 Health check: GET http://localhost:5000/api/health")
    print(f"📍 Model loaded: {model_loaded}")
    print(f"📍 Model labels: {MODEL_LABELS}")
    print(f"📍 Normal threshold: {NORMAL_THRESHOLD}")
    print("="*60)
    
    if not model_loaded:
        print("⚠️  WARNING: Model failed to load. Classification will not work.")
        print("💡 Make sure:")
        print("   1. TensorFlow is installed: pip install tensorflow")
        print("   2. model.py file exists in the same directory")
        print("   3. model/model.hdf5 file exists")
    
    app.run(debug=True, port=5000, host='0.0.0.0')