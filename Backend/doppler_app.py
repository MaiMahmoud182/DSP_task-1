from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
import os
import numpy as np
import io
import traceback
import base64
import soundfile as sf
import logging
import tempfile

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Get the current directory and frontend path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, '..', 'frontend')

logger.info(f"Backend directory: {BASE_DIR}")
logger.info(f"Frontend directory: {FRONTEND_DIR}")
logger.info(f"Frontend exists: {os.path.exists(FRONTEND_DIR)}")

app = Flask(__name__, 
            template_folder=FRONTEND_DIR,
            static_folder=os.path.join(FRONTEND_DIR, 'assets'))

# Enhanced CORS configuration
CORS(app)

# Handle preflight requests
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response

# Handle OPTIONS requests
@app.route('/api/<path:path>', methods=['OPTIONS'])
def options_handler(path):
    return '', 200

# ===== IMPORT DOPPLER PROCESSOR =====
try:
    from doppler_processor import DopplerSoundGenerator, doppler_analyzer
    DOPPLER_AVAILABLE = True
    logger.info("Doppler sound processor loaded successfully")
except ImportError as import_error:
    logger.error(f"Doppler processor import failed: {import_error}")
    DOPPLER_AVAILABLE = False
    
    # Fallback implementation
    class DopplerSoundGenerator:
        def generate_vehicle_sound(self, base_freq=120, velocity=30):
            raise Exception("Doppler sound generator not available")
    
    doppler_analyzer = None

# Configuration
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

# ===== ROUTES =====

@app.route('/')
def index():
    try:
        return render_template('index.html')
    except Exception as error:
        return f"Error loading index.html: {str(error)}"

@app.route('/doppler-analysis')
def doppler_analysis_page():
    try:
        return render_template('Doppler-Analysis.html')
    except Exception as error:
        return f"Error loading Doppler-Analysis.html: {str(error)}"

@app.route('/service-details')
def service_details():
    try:
        return render_template('service-details.html')
    except Exception as error:
        return f"Error loading service-details.html: {str(error)}"

@app.route('/portfolio-details')
def portfolio_details():
    try:
        return render_template('portfolio-details.html')
    except Exception as error:
        return f"Error loading portfolio-details.html: {str(error)}"

# Serve static files
@app.route('/assets/<path:filename>')
def serve_assets(filename):
    assets_path = os.path.join(FRONTEND_DIR, 'assets')
    return send_from_directory(assets_path, filename)

# Health check endpoint
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'message': 'Vehicle Doppler Analyzer API is running!',
        'doppler_available': DOPPLER_AVAILABLE,
        'signal_processing_available': False,
        'version': '2.0'
    })

# Debug route
@app.route('/debug')
def debug():
    info = []
    info.append(f"Backend directory: {BASE_DIR}")
    info.append(f"Frontend directory: {FRONTEND_DIR}")
    info.append(f"Frontend exists: {os.path.exists(FRONTEND_DIR)}")
    
    if os.path.exists(FRONTEND_DIR):
        info.append("Files in frontend:")
        for file in os.listdir(FRONTEND_DIR):
            info.append(f"  - {file}")
    
    return "<br>".join(info)

# ===== DOPPLER API ROUTES =====

@app.route('/api/generate-doppler-sound', methods=['POST'])
def generate_doppler_sound():
    """Generate vehicle sound with Doppler effect simulation"""
    try:
        # Validate request format
        if not request.is_json:
            return jsonify({'success': False, 'error': 'Request must contain JSON data'}), 400
            
        request_data = request.get_json()
        if not request_data:
            return jsonify({'success': False, 'error': 'No JSON data provided'}), 400
            
        # Extract and validate parameters
        base_frequency = request_data.get('base_freq', 120)
        vehicle_velocity = request_data.get('velocity', 60)
        sound_duration = request_data.get('duration', 6)
        
        # Parameter validation
        if not isinstance(base_frequency, (int, float)) or base_frequency < 80 or base_frequency > 1000:
            return jsonify({'success': False, 'error': 'Base frequency must be between 80 and 1000 Hz'}), 400
            
        if not isinstance(vehicle_velocity, (int, float)) or vehicle_velocity < 0 or vehicle_velocity > 500:
            return jsonify({'success': False, 'error': 'Vehicle velocity must be between 0 and 500 km/h'}), 400
        
        # Check processor availability
        if not DOPPLER_AVAILABLE:
            return jsonify({
                'success': False, 
                'error': 'Doppler sound generator not available'
            }), 500
        
        # Generate vehicle sound - FIXED: use sample_rate instead of sr
        sound_generator = DopplerSoundGenerator(sample_rate=48000, duration=sound_duration, downsample_factor=8)
        time_array, audio_waveform = sound_generator.generate_vehicle_sound(
            base_frequency=base_frequency, 
            velocity=vehicle_velocity/3.6
        )
        
        # Normalize audio waveform
        audio_max_amplitude = np.max(np.abs(audio_waveform))
        if audio_max_amplitude > 0:
            audio_waveform = audio_waveform / audio_max_amplitude
        
        # Encode audio for response
        audio_buffer = io.BytesIO()
        sf.write(audio_buffer, audio_waveform, 48000, format='WAV')
        audio_buffer.seek(0)
        audio_base64 = base64.b64encode(audio_buffer.getvalue()).decode()
        
        # Prepare visualization data
        downsample_factor = max(1, len(time_array) // 1000)
        display_time = time_array[::downsample_factor].tolist()
        display_amplitude = audio_waveform[::downsample_factor].tolist()
        
        return jsonify({
            'success': True,
            'audio_data': f'data:audio/wav;base64,{audio_base64}',
            'waveform_visualization': {
                'time': display_time,
                'amplitude': display_amplitude
            },
            'generation_parameters': {
                'base_frequency': base_frequency,
                'velocity': vehicle_velocity,
                'duration': sound_duration,
                'sample_rate': 48000
            }
        })
        
    except Exception as error:
        logger.error(f"Doppler sound generation error: {str(error)}")
        return jsonify({'success': False, 'error': str(error)}), 500

@app.route('/api/analyze-vehicle-sound', methods=['POST'])
def analyze_vehicle_sound():
    """Analyze uploaded audio for vehicle Doppler effect characteristics"""
    temporary_file_path = None
    try:
        # Validate file upload
        if 'audio_file' not in request.files:
            return jsonify({'success': False, 'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio_file']
        if audio_file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        # Validate file type
        supported_formats = {'.wav', '.mp3', '.flac', '.aac', '.ogg'}
        file_extension = os.path.splitext(audio_file.filename)[1].lower()
        if file_extension not in supported_formats:
            return jsonify({'success': False, 'error': f'Unsupported file type: {file_extension}'}), 400
        
        # Create temporary file for processing
        file_descriptor, temporary_file_path = tempfile.mkstemp(suffix='.wav')
        os.close(file_descriptor)
        audio_file.save(temporary_file_path)
        
        logger.info(f"Processing audio file: {audio_file.filename}")
        
        # Check analyzer availability
        if not DOPPLER_AVAILABLE or doppler_analyzer is None:
            return jsonify({
                'success': False, 
                'error': 'Doppler analyzer not available'
            }), 500
        
        # Perform vehicle sound analysis
        analysis_results = doppler_analyzer.analyze_audio_signal(temporary_file_path)
        
        # Clean up temporary file
        if temporary_file_path and os.path.exists(temporary_file_path):
            os.unlink(temporary_file_path)
        
        if 'error' in analysis_results:
            return jsonify({'success': False, 'error': analysis_results['error']}), 400
        
        return jsonify({
            'success': True,
            'analysis': analysis_results,
            'message': 'Vehicle sound analysis completed successfully'
        })
        
    except Exception as error:
        logger.error(f"Vehicle sound analysis error: {str(error)}")
        # Clean up temporary file
        if temporary_file_path and os.path.exists(temporary_file_path):
            try:
                os.unlink(temporary_file_path)
            except:
                pass
        return jsonify({'success': False, 'error': str(error)}), 500

@app.route('/api/get-spectrogram', methods=['POST'])
def get_spectrogram():
    """Generate spectrogram data for audio visualization"""
    temporary_file_path = None
    try:
        if 'audio_file' not in request.files:
            return jsonify({'success': False, 'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio_file']
        if audio_file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        # Create temporary file for processing
        file_descriptor, temporary_file_path = tempfile.mkstemp(suffix='.wav')
        os.close(file_descriptor)
        audio_file.save(temporary_file_path)
        
        # Load and analyze audio
        audio_data, sample_rate = sf.read(temporary_file_path)
        if audio_data.ndim > 1:
            audio_data = np.mean(audio_data, axis=1)
        
        # Generate enhanced spectrogram
        try:
            import librosa
            
            # Use safe parameters for spectrogram
            fft_size = min(2048, len(audio_data) // 4)
            hop_length = max(256, fft_size // 8)
            
            spectrogram = np.abs(librosa.stft(audio_data, n_fft=fft_size, hop_length=hop_length))
            time_points = librosa.frames_to_time(np.arange(spectrogram.shape[1]), sr=sample_rate, hop_length=hop_length)
            frequency_bins = librosa.fft_frequencies(sr=sample_rate, n_fft=fft_size)
            
            # Convert to decibel scale
            spectrogram_db = librosa.amplitude_to_db(spectrogram, ref=np.max)
            
            # Downsample for efficient display
            time_sampling_step = max(1, len(time_points) // 150)
            frequency_sampling_step = max(1, len(frequency_bins) // 80)
            
            spectrogram_data = {
                'intensity': spectrogram_db[::frequency_sampling_step, ::time_sampling_step].tolist(),
                'time': time_points[::time_sampling_step].tolist(),
                'frequency': frequency_bins[::frequency_sampling_step].tolist(),
                'sample_rate': sample_rate
            }
            
        except Exception as processing_error:
            logger.error(f"Spectrogram generation error: {processing_error}")
            return jsonify({
                'success': False, 
                'error': f'Spectrogram generation failed: {str(processing_error)}'
            }), 500
        
        # Clean up temporary file
        if temporary_file_path and os.path.exists(temporary_file_path):
            os.unlink(temporary_file_path)
        
        return jsonify({
            'success': True,
            'spectrogram': spectrogram_data
        })
        
    except Exception as error:
        logger.error(f"Spectrogram generation error: {str(error)}")
        # Clean up temporary file if it exists
        if temporary_file_path and os.path.exists(temporary_file_path):
            try:
                os.unlink(temporary_file_path)
            except:
                pass
        return jsonify({'success': False, 'error': str(error)}), 500

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'success': False, 'error': 'Internal server error'}), 500

@app.errorhandler(413)
def too_large(error):
    return jsonify({'success': False, 'error': 'File too large'}), 413

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({'success': False, 'error': 'Method not allowed'}), 405

if __name__ == '__main__':
    logger.info("\n" + "="*60)
    logger.info("🚀 STARTING VEHICLE DOPPLER ANALYZER SERVER")
    logger.info("="*60)
    logger.info(f"📍 Backend directory: {BASE_DIR}")
    logger.info(f"📍 Frontend directory: {FRONTEND_DIR}")
    logger.info("📍 Server URL: http://localhost:5000")
    logger.info("📍 Health check: http://localhost:5000/api/health")
    logger.info(f"📍 Doppler Analyzer available: {DOPPLER_AVAILABLE}")
    logger.info("📍 Mode: Professional Vehicle Sound Analysis")
    logger.info("="*60)
    
    if not os.path.exists(FRONTEND_DIR):
        logger.warning("❌ WARNING: Frontend directory not found!")
        logger.warning("Please make sure your HTML files are in the correct location")
    
    app.run(debug=True, port=5000, host='0.0.0.0')