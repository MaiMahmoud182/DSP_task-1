from flask import Blueprint, request, jsonify
import os
import numpy as np
import base64
import soundfile as sf
import logging
import tempfile
import io
import traceback
import sys

# Configure logging
logger = logging.getLogger(__name__)

# Create blueprint
doppler_bp = Blueprint('doppler', __name__)

# ===== IMPORT DOPPLER PROCESSOR =====
try:
    from doppler_processor import DopplerSoundGenerator, doppler_analyzer
    DOPPLER_AVAILABLE = True
    logger.info("Doppler sound processor loaded successfully")
except ImportError as import_error:
    DOPPLER_AVAILABLE = False
    logger.error(f"Doppler processor import failed: {import_error}")
    
    # Fallback implementation
    class DopplerSoundGenerator:
        def generate_vehicle_sound(self, base_freq=120, velocity=30):
            raise Exception("Doppler sound generator not available")
    
    doppler_analyzer = None

@doppler_bp.route('/api/generate-doppler-sound', methods=['POST'])
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
        
        # Generate vehicle sound
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

@doppler_bp.route('/api/analyze-vehicle-sound', methods=['POST'])
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

@doppler_bp.route('/api/get-spectrogram', methods=['POST'])
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

@doppler_bp.route('/api/doppler/health', methods=['GET'])
def doppler_health_check():
    """Health check endpoint for Doppler analyzer"""
    return jsonify({
        'status': 'healthy' if DOPPLER_AVAILABLE else 'degraded',
        'message': 'Doppler Analyzer API is running!',
        'doppler_available': DOPPLER_AVAILABLE,
        'endpoints': {
            'generate_sound': 'POST /api/generate-doppler-sound',
            'analyze_sound': 'POST /api/analyze-vehicle-sound',
            'get_spectrogram': 'POST /api/get-spectrogram'
        }
    })