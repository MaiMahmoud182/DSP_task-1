from flask import Blueprint, request, jsonify
import numpy as np
import librosa
import soundfile as sf
from transformers import AutoFeatureExtractor, AutoModelForAudioClassification
import torch
import os
import io
import base64
import tempfile
from scipy import signal
import logging
import traceback

# Configure logging
logger = logging.getLogger(__name__)

# Create blueprint
drone_bp = Blueprint('drone', __name__)

# Configuration
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'flac', 'ogg'}

class DroneDetector:
    def __init__(self):
        self.model_name = "preszzz/drone-audio-detection-05-17-trial-0"
        self.feature_extractor = None
        self.model = None
        self.load_model()
    
    def load_model(self):
        """Load drone detection model"""
        try:
            logger.info("Loading drone detection model...")
            self.feature_extractor = AutoFeatureExtractor.from_pretrained(self.model_name)
            self.model = AutoModelForAudioClassification.from_pretrained(self.model_name)
            logger.info("Drone detection model loaded successfully!")
        except Exception as e:
            logger.error(f"Error loading model: {str(e)}")
            raise
    
    def detect_drone(self, audio_path):
        """Drone detection using model inference"""
        try:
            # Load audio
            audio_array, sampling_rate = librosa.load(audio_path, sr=16000)
            
            # Model inference
            inputs = self.feature_extractor(
                audio_array, 
                sampling_rate=sampling_rate, 
                return_tensors="pt",
                padding=True
            )
            
            # Prediction
            with torch.no_grad():
                outputs = self.model(**inputs)
                predictions = torch.nn.functional.softmax(outputs.logits, dim=-1)
            
            # Process results
            id2label = self.model.config.id2label
            results = []
            
            for i in range(predictions.shape[1]):
                score = predictions[0][i].item()
                label = id2label[i]
                results.append({
                    'label': str(label),
                    'score': float(score),
                    'confidence_percentage': float(round(score * 100, 2))
                })
            
            # Sort by confidence
            results.sort(key=lambda x: x['score'], reverse=True)
            top_prediction = results[0] if results else None
            is_drone = bool(top_prediction['label'] == 'drone') if top_prediction else False
            
            return {
                'success': True,
                'is_drone': is_drone,
                'predictions': results,
                'top_prediction': top_prediction
            }
            
        except Exception as e:
            logger.error(f"Drone detection error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

# Global detector instance
drone_detector = DroneDetector()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def resample_audio_for_analysis(audio_data, original_sr, target_sr):
    """
    Resample audio for analysis with aliasing effects
    """
    try:
        logger.info(f"Resampling for analysis: {original_sr}Hz -> {target_sr}Hz")
        
        if target_sr != original_sr:
            duration = len(audio_data) / original_sr
            new_length = int(duration * target_sr)
            audio_resampled = signal.resample(audio_data, new_length)
        else:
            audio_resampled = audio_data.copy()
        
        return audio_resampled, target_sr
        
    except Exception as e:
        logger.error(f"Resampling error: {str(e)}")
        raise

def create_playback_audio(audio_data, sample_rate, mode='playback'):
    """
    Create audio for playback (browser-compatible) or download (exact sampling rate)
    """
    try:
        # Normalize audio
        audio_normalized = np.clip(audio_data, -1.0, 1.0)
        
        # Handle browser compatibility for playback
        if mode == 'playback':
            playback_sampling_rate = max(8000, int(sample_rate))
            
            if playback_sampling_rate > sample_rate:
                # Upsample for browser compatibility while preserving aliasing
                upsampling_factor = playback_sampling_rate / sample_rate
                upsampled_length = int(len(audio_normalized) * upsampling_factor)
                audio_playback = signal.resample(audio_normalized, upsampled_length)
                was_upsampled = True
            else:
                audio_playback = audio_normalized.copy()
                was_upsampled = False
        else:
            # Download mode: use exact sampling rate
            audio_playback = audio_normalized.copy()
            playback_sampling_rate = sample_rate
            was_upsampled = False
        
        # Prevent clipping
        peak = np.max(np.abs(audio_playback))
        if peak > 0.9:
            audio_playback = audio_playback * 0.9 / peak
        
        # Convert to 16-bit PCM
        audio_int16 = (audio_playback * 32767).astype(np.int16)
        
        # Create WAV file
        audio_buffer = io.BytesIO()
        sf.write(
            audio_buffer,
            audio_int16,
            int(playback_sampling_rate),
            format='WAV',
            subtype='PCM_16'
        )
        audio_buffer.seek(0)
        
        # Base64 encoding
        wav_data = audio_buffer.getvalue()
        audio_base64 = base64.b64encode(wav_data).decode('utf-8')
        
        return {
            'audio_data': f'data:audio/wav;base64,{audio_base64}',
            'playback_sampling_rate': playback_sampling_rate,
            'was_upsampled': was_upsampled
        }
        
    except Exception as e:
        logger.error(f"Audio creation error: {str(e)}")
        raise

def generate_waveform_data(audio_data, sample_rate, max_points=800):
    """
    Generate waveform data for visualization
    """
    try:
        # Downsample for efficient visualization
        downsample_factor = max(1, len(audio_data) // max_points)
        
        time_seconds = np.arange(len(audio_data)) / sample_rate
        time_display = time_seconds[::downsample_factor].tolist()
        amplitude_display = audio_data[::downsample_factor].tolist()
        
        # Aliasing detection for visualization
        nyquist_frequency = sample_rate / 2
        has_aliasing = sample_rate < 8000  # Simple rule for drone audio
        
        return {
            'time': time_display,
            'amplitude': amplitude_display,
            'sample_rate': int(sample_rate),
            'nyquist_frequency': float(nyquist_frequency),
            'is_aliasing': has_aliasing,
            'duration': float(len(audio_data) / sample_rate)
        }
        
    except Exception as e:
        logger.error(f"Waveform generation error: {str(e)}")
        return {'time': [], 'amplitude': []}

@drone_bp.route('/api/drone/detect', methods=['POST'])
def detect_drone():
    """Drone detection endpoint"""
    temporary_file_path = None
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        if file and allowed_file(file.filename):
            # Create temporary file
            file_descriptor, temporary_file_path = tempfile.mkstemp(suffix='.wav')
            os.close(file_descriptor)
            file.save(temporary_file_path)
            
            try:
                # Drone detection
                result = drone_detector.detect_drone(temporary_file_path)
                return jsonify(result)
                
            finally:
                # Clean up
                if temporary_file_path and os.path.exists(temporary_file_path):
                    os.unlink(temporary_file_path)
        
        else:
            return jsonify({
                'success': False, 
                'error': f'Invalid file type. Allowed types: {", ".join(ALLOWED_EXTENSIONS)}'
            }), 400
            
    except Exception as e:
        logger.error(f"Detection endpoint error: {str(e)}")
        if temporary_file_path and os.path.exists(temporary_file_path):
            try:
                os.unlink(temporary_file_path)
            except:
                pass
        return jsonify({'success': False, 'error': str(e)}), 500

@drone_bp.route('/api/drone/resample-audio', methods=['POST'])
def resample_audio():
    """Audio resampling with aliasing effects and web compatibility"""
    temporary_file_path = None
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No audio file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        # Get target sampling rate
        target_sampling_rate = request.form.get('target_sampling_rate')
        if not target_sampling_rate:
            return jsonify({'success': False, 'error': 'No sampling rate provided'}), 400
        
        target_sampling_rate = int(target_sampling_rate)
        if target_sampling_rate < 100 or target_sampling_rate > 48000:
            return jsonify({'success': False, 'error': 'Sampling rate must be between 100 and 48000 Hz'}), 400
        
        # Get mode (playback or download)
        mode = request.form.get('mode', 'playback')
        
        if file and allowed_file(file.filename):
            # Create temporary file
            file_descriptor, temporary_file_path = tempfile.mkstemp(suffix='.wav')
            os.close(file_descriptor)
            file.save(temporary_file_path)
            
            # Load original audio
            original_audio, original_sr = librosa.load(temporary_file_path, sr=None)
            
            # Resample for analysis (creates actual aliasing)
            resampled_audio, final_sr = resample_audio_for_analysis(original_audio, original_sr, target_sampling_rate)
            
            # Create playback/download audio
            audio_result = create_playback_audio(resampled_audio, final_sr, mode)
            
            # Generate waveform data
            original_waveform = generate_waveform_data(original_audio, original_sr)
            resampled_waveform = generate_waveform_data(resampled_audio, final_sr)
            
            # Clean up
            if temporary_file_path and os.path.exists(temporary_file_path):
                os.unlink(temporary_file_path)
            
            # Response data
            response_data = {
                'success': True,
                'audio_data': audio_result['audio_data'],
                'waveform_data': resampled_waveform,
                'sampling_info': {
                    'original_sample_rate': int(original_sr),
                    'analysis_sample_rate': int(final_sr),
                    'playback_sample_rate': int(audio_result['playback_sampling_rate']),
                    'nyquist_frequency': resampled_waveform['nyquist_frequency'],
                    'was_resampled': bool(target_sampling_rate != original_sr),
                    'was_upsampled': audio_result['was_upsampled'],
                    'has_aliasing': resampled_waveform['is_aliasing'],
                    'mode': mode
                }
            }
            
            return jsonify(response_data)
        else:
            return jsonify({
                'success': False, 
                'error': f'Invalid file type. Allowed types: {", ".join(ALLOWED_EXTENSIONS)}'
            }), 400
            
    except Exception as e:
        logger.error(f"Resampling endpoint error: {str(e)}")
        if temporary_file_path and os.path.exists(temporary_file_path):
            try:
                os.unlink(temporary_file_path)
            except:
                pass
        return jsonify({'success': False, 'error': f'Processing failed: {str(e)}'}), 500

@drone_bp.route('/api/drone/get-waveform', methods=['POST'])
def get_waveform():
    """Get waveform data from audio"""
    temporary_file_path = None
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No audio file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        if file and allowed_file(file.filename):
            # Create temporary file
            file_descriptor, temporary_file_path = tempfile.mkstemp(suffix='.wav')
            os.close(file_descriptor)
            file.save(temporary_file_path)
            
            # Load audio
            audio_data, sample_rate = librosa.load(temporary_file_path, sr=None)
            
            # Generate waveform
            waveform_data = generate_waveform_data(audio_data, sample_rate)
            
            # Clean up
            if temporary_file_path and os.path.exists(temporary_file_path):
                os.unlink(temporary_file_path)
            
            return jsonify({
                'success': True,
                'waveform': waveform_data
            })
        else:
            return jsonify({
                'success': False, 
                'error': f'Invalid file type. Allowed types: {", ".join(ALLOWED_EXTENSIONS)}'
            }), 400
            
    except Exception as e:
        logger.error(f"Waveform endpoint error: {str(e)}")
        if temporary_file_path and os.path.exists(temporary_file_path):
            try:
                os.unlink(temporary_file_path)
            except:
                pass
        return jsonify({'success': False, 'error': str(e)}), 500

@drone_bp.route('/api/drone/health', methods=['GET'])
def health_check():
    """Health check"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': bool(drone_detector.model is not None),
        'endpoints': {
            'detect': 'POST /api/drone/detect',
            'resample_audio': 'POST /api/drone/resample-audio',
            'get_waveform': 'POST /api/drone/get-waveform'
        }
    })