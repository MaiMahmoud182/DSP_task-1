from flask import Blueprint, request, jsonify
import os
import numpy as np
import base64
import soundfile as sf
import logging
import tempfile
import io
import traceback
from scipy import signal

logger = logging.getLogger(__name__)

# Create blueprint
voice_bp = Blueprint('voice', __name__)

class VoiceAnalyzer:
    """Analyzes human voice for aliasing effects without gender classification"""
    
    def __init__(self):
        logger.info("Voice Analyzer initialized")
    
    def analyze_voice(self, audio_file_path, target_sampling_rate=None):
        """
        Analyze human voice for aliasing demonstration
        
        Args:
            audio_file_path: Path to audio file
            target_sampling_rate: Optional target sampling rate for aliasing demonstration
            
        Returns:
            dict: Analysis results with aliasing info
        """
        try:
            # Validate file
            if not os.path.exists(audio_file_path):
                return {'error': "Audio file not found"}
            
            # Load audio
            audio_data, original_sr = sf.read(audio_file_path)
            
            # Convert to mono if stereo
            if audio_data.ndim > 1:
                audio_data = np.mean(audio_data, axis=1)
            
            # Resample if target sampling rate specified
            if target_sampling_rate and target_sampling_rate != original_sr:
                logger.info(f"Resampling voice from {original_sr}Hz to {target_sampling_rate}Hz")
                resampling_factor = target_sampling_rate / original_sr
                new_length = int(len(audio_data) * resampling_factor)
                audio_data = signal.resample(audio_data, new_length)
                sample_rate = target_sampling_rate
            else:
                sample_rate = original_sr
            
            # Generate waveform data with improved aliasing detection
            waveform_data = self._generate_waveform_visualization(audio_data, sample_rate, target_sampling_rate)
            
            # Add sampling info
            analysis_result = {
                'waveform_data': waveform_data,
                'sampling_info': {
                    'original_sample_rate': original_sr,
                    'analysis_sample_rate': sample_rate,
                    'was_resampled': target_sampling_rate and target_sampling_rate != original_sr,
                    'nyquist_frequency': sample_rate / 2
                },
                'duration': len(audio_data) / sample_rate,
                'analysis_method': 'aliasing_demonstration',
                'message': 'Voice analysis completed successfully'
            }
            
            return analysis_result
            
        except Exception as error:
            logger.error(f"Voice analysis error: {error}")
            return {'error': f"Analysis failed: {str(error)}"}
    
    def _generate_waveform_visualization(self, audio_signal, sample_rate, target_sampling_rate=None):
        """Generate waveform data for frontend visualization with improved aliasing detection"""
        signal_duration = len(audio_signal) / sample_rate
        
        if len(audio_signal) == 0:
            return {
                'time': [0, 1],
                'amplitude': [0, 0],
                'is_aliasing': False,
                'nyquist_frequency': sample_rate / 2
            }
        
        # IMPROVED ALIASING DETECTION: Mark as aliasing when sampling rate is too low for voice
        # Voice frequencies typically range from 85Hz to 255Hz for fundamental, but harmonics go up to 4000Hz
        nyquist_frequency = sample_rate / 2
        
        # If sampling rate is below 8000Hz (Nyquist 4000Hz), voice harmonics will alias
        # If sampling rate is below 4000Hz (Nyquist 2000Hz), fundamental voice frequencies may alias
        is_aliasing = sample_rate < 8000  # Simple rule: below 8kHz sampling = aliasing expected for voice
        
        # Additional check: if we specifically set a low sampling rate for aliasing demonstration
        if target_sampling_rate and target_sampling_rate < 8000:
            is_aliasing = True
        
        # Downsample for efficient visualization
        max_display_points = 1000
        sampling_step = max(1, len(audio_signal) // max_display_points)
        
        time_axis = np.linspace(0, signal_duration, len(audio_signal))[::sampling_step].tolist()
        amplitude_axis = audio_signal[::sampling_step].tolist()
        
        return {
            'time': time_axis,
            'amplitude': amplitude_axis,
            'is_aliasing': is_aliasing,
            'nyquist_frequency': nyquist_frequency,
            'analysis_sample_rate': sample_rate
        }

# Create global analyzer instance
voice_analyzer = VoiceAnalyzer()

@voice_bp.route('/api/analyze-voice', methods=['POST'])
def analyze_voice():
    """Analyze human voice for aliasing demonstration"""
    temporary_file_path = None
    try:
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
        
        # Get target sampling rate for aliasing demonstration
        target_sampling_rate = request.form.get('target_sampling_rate')
        if target_sampling_rate:
            target_sampling_rate = int(target_sampling_rate)
            if target_sampling_rate < 100 or target_sampling_rate > 48000:
                return jsonify({'success': False, 'error': 'Target sampling rate must be between 100 and 48000 Hz'}), 400
        
        # Create temporary file
        file_descriptor, temporary_file_path = tempfile.mkstemp(suffix='.wav')
        os.close(file_descriptor)
        audio_file.save(temporary_file_path)
        
        logger.info(f"Processing voice file: {audio_file.filename} with target SR: {target_sampling_rate}")
        
        # Perform voice analysis
        analysis_results = voice_analyzer.analyze_voice(temporary_file_path, target_sampling_rate)
        
        # Clean up
        if temporary_file_path and os.path.exists(temporary_file_path):
            os.unlink(temporary_file_path)
        
        if 'error' in analysis_results:
            return jsonify({'success': False, 'error': analysis_results['error']}), 400
        
        return jsonify({
            'success': True,
            'analysis': analysis_results,
            'message': f'Voice analysis completed (SR: {analysis_results["sampling_info"]["analysis_sample_rate"]}Hz)'
        })
        
    except Exception as error:
        logger.error(f"Voice analysis error: {str(error)}")
        if temporary_file_path and os.path.exists(temporary_file_path):
            try:
                os.unlink(temporary_file_path)
            except:
                pass
        return jsonify({'success': False, 'error': str(error)}), 500

@voice_bp.route('/api/get-resampled-voice', methods=['POST'])
def get_resampled_voice():
    """Generate resampled voice audio for playback and download"""
    temporary_file_path = None
    try:
        if 'audio_file' not in request.files:
            return jsonify({'success': False, 'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio_file']
        if audio_file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        # Get target sampling rate and mode (playback vs download)
        target_sampling_rate = request.form.get('target_sampling_rate')
        mode = request.form.get('mode', 'playback')  # 'playback' or 'download'
        
        if not target_sampling_rate:
            return jsonify({'success': False, 'error': 'No target sampling rate provided'}), 400
        
        target_sampling_rate = int(target_sampling_rate)
        
        # Create temporary file
        file_descriptor, temporary_file_path = tempfile.mkstemp(suffix='.wav')
        os.close(file_descriptor)
        audio_file.save(temporary_file_path)
        
        # Load and resample audio
        audio_data, original_sample_rate = sf.read(temporary_file_path)
        
        # Convert to mono if stereo
        if audio_data.ndim > 1:
            audio_data = np.mean(audio_data, axis=1)
        
        # Resample to target sampling rate
        if target_sampling_rate != original_sample_rate:
            resampling_factor = target_sampling_rate / original_sample_rate
            new_length = int(len(audio_data) * resampling_factor)
            audio_data = signal.resample(audio_data, new_length)
            sample_rate = target_sampling_rate
            was_resampled = True
        else:
            sample_rate = original_sample_rate
            was_resampled = False
        
        # CRITICAL: For DOWNLOAD mode, use exact sampling rate (no upsampling)
        # For PLAYBACK mode, ensure browser compatibility (min 8000Hz)
        if mode == 'download':
            # Download mode: Use exact sampling rate to preserve aliasing characteristics
            playback_sampling_rate = sample_rate
            audio_data_playback = audio_data.copy()
            was_upsampled = False
        else:
            # Playback mode: Ensure browser compatibility
            playback_sampling_rate = max(8000, int(sample_rate))
            
            if playback_sampling_rate > sample_rate:
                # Upsample for browser playback while preserving aliasing effect
                upsampling_factor = playback_sampling_rate / sample_rate
                upsampled_length = int(len(audio_data) * upsampling_factor)
                audio_data_playback = signal.resample(audio_data, upsampled_length)
                was_upsampled = True
            else:
                audio_data_playback = audio_data.copy()
                was_upsampled = False
        
        # Normalize for playback
        audio_data_playback = np.clip(audio_data_playback, -1.0, 1.0)
        
        # RMS-based normalization
        rms = np.sqrt(np.mean(audio_data_playback**2))
        if rms > 0:
            target_rms = 0.3
            audio_data_playback = audio_data_playback * (target_rms / rms)
        
        # Soft clipping
        def soft_clip(x, threshold=0.8):
            return np.where(np.abs(x) < threshold, x, np.sign(x) * (threshold + (1-threshold) * (1 - np.exp(-(np.abs(x)-threshold)))))
        
        audio_data_playback = soft_clip(audio_data_playback)
        audio_data_playback = np.clip(audio_data_playback, -0.95, 0.95)
        audio_data_playback = np.nan_to_num(audio_data_playback, nan=0.0, posinf=0.0, neginf=0.0)
        
        # Encode for response
        audio_buffer = io.BytesIO()
        audio_int16 = (audio_data_playback * 32767).astype(np.int16)
        
        sf.write(
            audio_buffer, 
            audio_int16, 
            int(playback_sampling_rate),
            format='WAV',
            subtype='PCM_16'
        )
        audio_buffer.seek(0)
        
        wav_data = audio_buffer.getvalue()
        audio_base64 = base64.b64encode(wav_data).decode('utf-8')
        
        # Clean up
        if temporary_file_path and os.path.exists(temporary_file_path):
            os.unlink(temporary_file_path)
        
        return jsonify({
            'success': True,
            'audio_data': f'data:audio/wav;base64,{audio_base64}',
            'original_sampling_rate': original_sample_rate,
            'target_sampling_rate': target_sampling_rate,
            'playback_sampling_rate': playback_sampling_rate,
            'was_upsampled': was_upsampled,
            'was_resampled': was_resampled,
            'mode': mode
        })
        
    except Exception as error:
        logger.error(f"Resampled voice generation error: {str(error)}")
        if temporary_file_path and os.path.exists(temporary_file_path):
            try:
                os.unlink(temporary_file_path)
            except:
                pass
        return jsonify({'success': False, 'error': str(error)}), 500

@voice_bp.route('/api/voice/health', methods=['GET'])
def voice_health_check():
    """Health check endpoint for voice analyzer"""
    return jsonify({
        'status': 'healthy',
        'message': 'Voice Analyzer API is running!',
        'endpoints': {
            'analyze_voice': 'POST /api/analyze-voice',
            'get_resampled_voice': 'POST /api/get-resampled-voice'
        }
    })