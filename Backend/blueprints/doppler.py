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
        def generate_vehicle_sound(self, base_freq=120, velocity=30, sampling_rate=3000):
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
        sampling_rate = request_data.get('sampling_rate', 3000)  # NEW: Added sampling rate parameter
        
        # Parameter validation
        if not isinstance(base_frequency, (int, float)) or base_frequency < 80 or base_frequency > 1000:
            return jsonify({'success': False, 'error': 'Base frequency must be between 80 and 1000 Hz'}), 400
            
        if not isinstance(vehicle_velocity, (int, float)) or vehicle_velocity < 0 or vehicle_velocity > 500:
            return jsonify({'success': False, 'error': 'Vehicle velocity must be between 0 and 500 km/h'}), 400
        
        # NEW: Extended sampling rate validation
        if not isinstance(sampling_rate, (int, float)) or sampling_rate < 50 or sampling_rate > 4000:
            return jsonify({'success': False, 'error': 'Sampling rate must be between 50 and 4000 Hz'}), 400
        
        # Check processor availability
        if not DOPPLER_AVAILABLE:
            return jsonify({
                'success': False, 
                'error': 'Doppler sound generator not available'
            }), 500
        
        # Generate vehicle sound with specified sampling rate
        sound_generator = DopplerSoundGenerator(duration=sound_duration)  # UPDATED: Remove fixed sample_rate
        time_array, audio_waveform = sound_generator.generate_vehicle_sound(
            base_frequency=base_frequency, 
            velocity=vehicle_velocity/3.6,
            sampling_rate=int(sampling_rate)  # NEW: Pass sampling rate
        )
        
        # CRITICAL FIX: Handle very low sampling rates for browser compatibility
        playback_sampling_rate = max(8000, int(sampling_rate))  # Minimum 8000 Hz for browser compatibility
        
        if playback_sampling_rate > sampling_rate:
            # Upsample for browser playback while preserving the aliasing effect
            import scipy.signal
            upsampling_factor = playback_sampling_rate / sampling_rate
            upsampled_length = int(len(audio_waveform) * upsampling_factor)
            audio_waveform_playback = scipy.signal.resample(audio_waveform, upsampled_length)
        else:
            audio_waveform_playback = audio_waveform.copy()
        
        # IMPROVED NORMALIZATION: Better distortion prevention
        audio_waveform = np.clip(audio_waveform, -1.0, 1.0)
        audio_waveform_playback = np.clip(audio_waveform_playback, -1.0, 1.0)

        # Use RMS-based normalization for more consistent levels
        rms = np.sqrt(np.mean(audio_waveform_playback**2))
        if rms > 0:
            target_rms = 0.3  # Conservative target RMS
            audio_waveform_playback = audio_waveform_playback * (target_rms / rms)

        # Apply soft clipping to prevent hard distortion
        def soft_clip(x, threshold=0.8):
            """Soft clipping to prevent hard distortion"""
            return np.where(np.abs(x) < threshold, x, np.sign(x) * (threshold + (1-threshold) * (1 - np.exp(-(np.abs(x)-threshold)))))
        
        audio_waveform_playback = soft_clip(audio_waveform_playback)

        # Final safety check with tighter bounds
        audio_waveform_playback = np.clip(audio_waveform_playback, -0.95, 0.95)
        audio_waveform_playback = np.nan_to_num(audio_waveform_playback, nan=0.0, posinf=0.0, neginf=0.0)
        
        # Encode audio for response - USE PLAYBACK SAMPLING RATE FOR AUDIO
        audio_buffer = io.BytesIO()
        
        # Use proper WAV format settings for browser compatibility
        # Convert to 16-bit PCM for maximum compatibility
        audio_int16 = (audio_waveform_playback * 32767).astype(np.int16)
        
        sf.write(
            audio_buffer, 
            audio_int16, 
            int(playback_sampling_rate),  # Use playback sampling rate, not original
            format='WAV',
            subtype='PCM_16'
        )
        audio_buffer.seek(0)
        
        # Read the WAV data and encode to base64
        wav_data = audio_buffer.getvalue()
        audio_base64 = base64.b64encode(wav_data).decode('utf-8')
        
        # Prepare visualization data (use original sampling rate for accurate visualization)
        downsample_factor = max(1, len(time_array) // 1000)
        display_time = time_array[::downsample_factor].tolist()
        display_amplitude = audio_waveform[::downsample_factor].tolist()
        
        # NEW: Calculate Nyquist information for frontend display
        nyquist_frequency = sampling_rate / 2
        highest_harmonic = base_frequency * 6
        absolute_max_freq = min(1000, highest_harmonic)
        is_aliasing = base_frequency > nyquist_frequency
        is_harmonic_aliasing = highest_harmonic > nyquist_frequency
        
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
                'sampling_rate': sampling_rate,  # UPDATED: Use actual sampling rate
                'playback_sampling_rate': playback_sampling_rate,
                'nyquist_frequency': nyquist_frequency,
                'highest_harmonic': highest_harmonic,
                'absolute_max_freq': absolute_max_freq,
                'is_aliasing': is_aliasing,
                'is_harmonic_aliasing': is_harmonic_aliasing,
                'was_upsampled': playback_sampling_rate > sampling_rate
            }
        })
        
    except Exception as error:
        logger.error(f"Doppler sound generation error: {str(error)}")
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(error)}), 500

@doppler_bp.route('/api/analyze-vehicle-sound', methods=['POST'])
def analyze_vehicle_sound():
    """Analyze uploaded audio for vehicle Doppler effect characteristics with optional resampling"""
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
        
        # NEW: Get target sampling rate if provided - EXTENDED RANGE FOR ALIASING DEMONSTRATION
        target_sampling_rate = request.form.get('target_sampling_rate')
        if target_sampling_rate:
            target_sampling_rate = int(target_sampling_rate)
            # Allow very low sampling rates for aliasing demonstration (100-48000 Hz)
            if target_sampling_rate < 100 or target_sampling_rate > 48000:
                return jsonify({'success': False, 'error': 'Target sampling rate must be between 100 and 48000 Hz'}), 400
        
        # Create temporary file for processing
        file_descriptor, temporary_file_path = tempfile.mkstemp(suffix='.wav')
        os.close(file_descriptor)
        audio_file.save(temporary_file_path)
        
        logger.info(f"Processing audio file: {audio_file.filename} with target SR: {target_sampling_rate}")
        
        # Load and optionally resample audio
        audio_data, original_sample_rate = sf.read(temporary_file_path)
        
        # Resample if target sampling rate is specified and different from original
        if target_sampling_rate and target_sampling_rate != original_sample_rate:
            logger.info(f"Resampling from {original_sample_rate}Hz to {target_sampling_rate}Hz")
            
            # Calculate resampling factor
            resampling_factor = target_sampling_rate / original_sample_rate
            new_length = int(len(audio_data) * resampling_factor)
            
            # Resample using scipy
            from scipy import signal
            audio_data = signal.resample(audio_data, new_length)
            sample_rate = target_sampling_rate
            
            # Save resampled version to temporary file for analysis
            resampled_temp_path = temporary_file_path + "_resampled.wav"
            sf.write(resampled_temp_path, audio_data, sample_rate)
            analysis_file_path = resampled_temp_path
        else:
            sample_rate = original_sample_rate
            analysis_file_path = temporary_file_path
        
        # Check analyzer availability
        if not DOPPLER_AVAILABLE or doppler_analyzer is None:
            return jsonify({
                'success': False, 
                'error': 'Doppler analyzer not available'
            }), 500
        
        # Perform vehicle sound analysis
        analysis_results = doppler_analyzer.analyze_audio_signal(analysis_file_path)
        
        # NEW: Add sampling rate information to results
        analysis_results['sampling_info'] = {
            'original_sample_rate': original_sample_rate,
            'analysis_sample_rate': sample_rate,
            'was_resampled': target_sampling_rate and target_sampling_rate != original_sample_rate,
            'nyquist_frequency': sample_rate / 2
        }
        
        # NEW: Add aliasing detection based on sampling info
        if 'sampling_info' in analysis_results:
            nyquist_freq = analysis_results['sampling_info']['nyquist_frequency']
            source_freq = analysis_results.get('source_frequency', 0)
            analysis_results['has_aliasing'] = source_freq > nyquist_freq
        
        # Clean up temporary files
        if temporary_file_path and os.path.exists(temporary_file_path):
            os.unlink(temporary_file_path)
        if 'resampled_temp_path' in locals() and os.path.exists(resampled_temp_path):
            os.unlink(resampled_temp_path)
        
        if 'error' in analysis_results:
            return jsonify({'success': False, 'error': analysis_results['error']}), 400
        
        return jsonify({
            'success': True,
            'analysis': analysis_results,
            'message': f'Vehicle sound analysis completed (SR: {sample_rate}Hz)'
        })
        
    except Exception as error:
        logger.error(f"Vehicle sound analysis error: {str(error)}")
        # Clean up temporary files
        if temporary_file_path and os.path.exists(temporary_file_path):
            try:
                os.unlink(temporary_file_path)
            except:
                pass
        if 'resampled_temp_path' in locals() and os.path.exists(resampled_temp_path):
            try:
                os.unlink(resampled_temp_path)
            except:
                pass
        return jsonify({'success': False, 'error': str(error)}), 500

@doppler_bp.route('/api/get-resampled-audio', methods=['POST'])
def get_resampled_audio():
    """Generate resampled audio for playback with the same sampling rate used in analysis"""
    temporary_file_path = None
    try:
        if 'audio_file' not in request.files:
            return jsonify({'success': False, 'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio_file']
        if audio_file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        # Get target sampling rate from analysis
        target_sampling_rate = request.form.get('target_sampling_rate')
        if not target_sampling_rate:
            return jsonify({'success': False, 'error': 'No target sampling rate provided'}), 400
        
        target_sampling_rate = int(target_sampling_rate)
        
        # Create temporary file for processing
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
            from scipy import signal
            resampling_factor = target_sampling_rate / original_sample_rate
            new_length = int(len(audio_data) * resampling_factor)
            audio_data = signal.resample(audio_data, new_length)
            sample_rate = target_sampling_rate
        else:
            sample_rate = original_sample_rate
        
        # CRITICAL FIX: Handle very low sampling rates for browser compatibility
        playback_sampling_rate = max(8000, int(sample_rate))  # Minimum 8000 Hz for browser compatibility
        
        if playback_sampling_rate > sample_rate:
            # Upsample for browser playback while preserving the aliasing effect
            from scipy import signal
            upsampling_factor = playback_sampling_rate / sample_rate
            upsampled_length = int(len(audio_data) * upsampling_factor)
            audio_data_playback = signal.resample(audio_data, upsampled_length)
            was_upsampled = True
        else:
            audio_data_playback = audio_data.copy()
            was_upsampled = False
        
        # Normalize and prepare audio for playback
        audio_data_playback = np.clip(audio_data_playback, -1.0, 1.0)
        
        # Use RMS-based normalization for consistent levels
        rms = np.sqrt(np.mean(audio_data_playback**2))
        if rms > 0:
            target_rms = 0.3  # Conservative target RMS
            audio_data_playback = audio_data_playback * (target_rms / rms)
        
        # Apply soft clipping to prevent hard distortion
        def soft_clip(x, threshold=0.8):
            return np.where(np.abs(x) < threshold, x, np.sign(x) * (threshold + (1-threshold) * (1 - np.exp(-(np.abs(x)-threshold)))))
        
        audio_data_playback = soft_clip(audio_data_playback)
        audio_data_playback = np.clip(audio_data_playback, -0.95, 0.95)
        audio_data_playback = np.nan_to_num(audio_data_playback, nan=0.0, posinf=0.0, neginf=0.0)
        
        # Encode audio for response - USE PLAYBACK SAMPLING RATE FOR AUDIO
        audio_buffer = io.BytesIO()
        
        # Convert to 16-bit PCM for browser compatibility
        audio_int16 = (audio_data_playback * 32767).astype(np.int16)
        
        sf.write(
            audio_buffer, 
            audio_int16, 
            int(playback_sampling_rate),  # Use playback sampling rate, not original
            format='WAV',
            subtype='PCM_16'
        )
        audio_buffer.seek(0)
        
        # Read the WAV data and encode to base64
        wav_data = audio_buffer.getvalue()
        audio_base64 = base64.b64encode(wav_data).decode('utf-8')
        
        # Clean up temporary file
        if temporary_file_path and os.path.exists(temporary_file_path):
            os.unlink(temporary_file_path)
        
        return jsonify({
            'success': True,
            'audio_data': f'data:audio/wav;base64,{audio_base64}',
            'original_sampling_rate': sample_rate,
            'playback_sampling_rate': playback_sampling_rate,
            'was_upsampled': was_upsampled,
            'was_resampled': target_sampling_rate != original_sample_rate
        })
        
    except Exception as error:
        logger.error(f"Resampled audio generation error: {str(error)}")
        # Clean up temporary file if it exists
        if temporary_file_path and os.path.exists(temporary_file_path):
            try:
                os.unlink(temporary_file_path)
            except:
                pass
        return jsonify({'success': False, 'error': str(error)}), 500

@doppler_bp.route('/api/get-spectrogram', methods=['POST'])
def get_spectrogram():
    """Generate spectrogram data for audio visualization with proper sampling rate"""
    temporary_file_path = None
    try:
        if 'audio_file' not in request.files:
            return jsonify({'success': False, 'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio_file']
        if audio_file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        # NEW: Get target sampling rate from analysis if provided
        target_sampling_rate = request.form.get('target_sampling_rate')
        
        # Create temporary file for processing
        file_descriptor, temporary_file_path = tempfile.mkstemp(suffix='.wav')
        os.close(file_descriptor)
        audio_file.save(temporary_file_path)
        
        # Load and optionally resample audio to match analysis sampling rate
        audio_data, original_sample_rate = sf.read(temporary_file_path)
        
        # Use target sampling rate if provided, otherwise use original
        if target_sampling_rate:
            target_sampling_rate = int(target_sampling_rate)
            if target_sampling_rate != original_sample_rate:
                from scipy import signal
                resampling_factor = target_sampling_rate / original_sample_rate
                new_length = int(len(audio_data) * resampling_factor)
                audio_data = signal.resample(audio_data, new_length)
                sample_rate = target_sampling_rate
            else:
                sample_rate = original_sample_rate
        else:
            sample_rate = original_sample_rate
        
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
            
            # NEW: Limit frequency range to Nyquist for proper visualization
            nyquist_frequency = sample_rate / 2
            valid_freq_mask = frequency_bins <= nyquist_frequency
            
            # Downsample for efficient display
            time_sampling_step = max(1, len(time_points) // 150)
            frequency_sampling_step = max(1, len(frequency_bins[valid_freq_mask]) // 80)
            
            spectrogram_data = {
                'intensity': spectrogram_db[valid_freq_mask, :][::frequency_sampling_step, ::time_sampling_step].tolist(),
                'time': time_points[::time_sampling_step].tolist(),
                'frequency': frequency_bins[valid_freq_mask][::frequency_sampling_step].tolist(),
                'sample_rate': sample_rate,
                'nyquist_frequency': nyquist_frequency  # NEW: Include Nyquist frequency
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
            'get_spectrogram': 'POST /api/get-spectrogram',
            'get_resampled_audio': 'POST /api/get-resampled-audio'  # NEW: Added endpoint
        }
    })