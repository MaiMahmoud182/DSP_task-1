from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging

# ==================================================
# ✅ Logging Configuration
# ==================================================
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# ==================================================
# ✅ Flask App Setup
# ==================================================
app = Flask(__name__)

# Enhanced CORS configuration
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:3000", "http://127.0.0.1:3000", "*"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})
app.config['SECRET_KEY'] = 'ecg-doppler-drone-analyzer-secret-key'
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024  # 1 GB max upload

# ==================================================
# ✅ Import Blueprints and Load Models
# ==================================================
from blueprints.doppler import doppler_bp
from blueprints.ecg import ecg_bp, load_ecg_model , init_ecg_blueprint
from blueprints.eeg import eeg_bp
from blueprints.drone import drone_bp
from blueprints.sar import sar_bp
from blueprints.voice_aliasing import voice_bp

# Load ECG model once at startup
logger.info("🧠 Loading ECG model...")
ecg_model = load_ecg_model()

if ecg_model is None:
    logger.warning("⚠️ ECG model failed to load. Classification endpoint will not work.")
else:
    logger.info("✅ ECG model successfully loaded and ready for inference.")

# Store model globally in config (optional but clean)
app.config['ECG_MODEL'] = ecg_model
#app.config['ECG_MODEL'] = load_ecg_model()
init_ecg_blueprint(app)
# ==================================================
# ✅ Register Blueprints
# ==================================================
app.register_blueprint(doppler_bp)
app.register_blueprint(ecg_bp)
app.register_blueprint(eeg_bp)
app.register_blueprint(drone_bp)  # ✅ Drone blueprint registered
app.register_blueprint(sar_bp)
app.register_blueprint(voice_bp)


# ==================================================
# ✅ Global CORS and OPTIONS Handling
# ==================================================
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response

@app.route('/api/<path:path>', methods=['OPTIONS'])
def options_handler(path):
    return '', 200

# ==================================================
# ✅ Health Check Endpoint
# ==================================================
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint for Docker and local development"""
    return jsonify({
        'status': 'healthy',
        'message': 'Backend API is running',
        'version': '1.0',
        'models': {
            'ecg_model_loaded': ecg_model is not None
        },
        'endpoints': {
            'ecg': ['/api/ecg/upload', '/api/ecg/classify'],
            'eeg': ['/api/eeg/upload', '/api/eeg/classify'],
            'doppler': ['/api/generate-doppler-sound', '/api/analyze-vehicle-sound','/api/get-spectrogram','/api/get-resampled-audio'],
            'drone': [
                '/api/drone/detect',                    
                '/api/drone/resample-audio',           
                '/api/drone/get-waveform',             
                '/api/drone/health'                    
            ],
            'sar': ['/api/sar/analyze'],
            'voice': ['/api/analyze-voice', '/api/get-resampled-voice'] 
        }
    }), 200

# ==================================================
# ✅ Error Handlers
# ==================================================
@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.exception("❌ Internal server error:")
    return jsonify({'success': False, 'error': 'Internal server error'}), 500

@app.errorhandler(413)
def too_large(error):
    return jsonify({'success': False, 'error': 'File too large'}), 413

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({'success': False, 'error': 'Method not allowed'}), 405

# ==================================================
# ✅ App Runner
# ==================================================
if __name__ == '__main__':
    logger.info("\n" + "="*60)
    logger.info("🚀 STARTING BACKEND API SERVER")
    logger.info("="*60)
    logger.info("📍 Server URL: http://0.0.0.0:5000")
    logger.info("📍 Health check: http://0.0.0.0:5000/api/health")
    logger.info("📍 Mode: Combined Medical, Vehicle Sound, Drone Detection & SAR Analysis")
    logger.info("="*60)
    logger.info("✅ All systems ready with Blueprint architecture!")
    
    # Bind to 0.0.0.0 for Docker or local network
    app.run(debug=True, port=5000, host='0.0.0.0')