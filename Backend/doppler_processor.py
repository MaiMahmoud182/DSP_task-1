
import numpy as np
import soundfile as sf
import scipy.signal
from scipy.signal import butter, lfilter, resample
import os
import librosa
import logging

logger = logging.getLogger(__name__)

class DopplerSoundGenerator:
    """Generates realistic vehicle sounds with Doppler effect simulation"""
    
    def __init__(self, sample_rate=48000, duration=8, downsample_factor=8):
        self.sample_rate = sample_rate
        self.duration = duration
        self.sound_speed = 343.0  # Speed of sound in m/s
        self.initial_distance = 80.0  # Starting distance in meters
        self.min_distance = 3.0  # Closest approach distance
        self.downsample_factor = downsample_factor

    def generate_vehicle_sound(self, base_frequency=120, velocity=30):
        """
        Generate vehicle sound with Doppler effect
        
        Args:
            base_frequency: Fundamental frequency of the engine sound (Hz)
            velocity: Vehicle speed in m/s
            
        Returns:
            tuple: (time_array, audio_waveform)
        """
        try:
            # Calculate downsampled parameters
            downsampled_rate = self.sample_rate // self.downsample_factor
            time_array = np.linspace(0, self.duration, int(self.duration * downsampled_rate))
            
            # Calculate vehicle position and radial velocity
            vehicle_position = -self.initial_distance + velocity * time_array
            distance_to_observer = np.sqrt(vehicle_position**2 + self.min_distance**2)
            radial_velocity = velocity * vehicle_position / distance_to_observer

            # Apply Doppler frequency shift
            doppler_frequency = base_frequency * (self.sound_speed / (self.sound_speed + radial_velocity))
            # Add slight frequency modulation for realism
            doppler_frequency *= 1 + 0.02 * np.sin(2 * np.pi * 8 * time_array)

            # Generate engine sound with harmonics
            phase = 2 * np.pi * np.cumsum(doppler_frequency) / downsampled_rate
            engine_sound = (
                0.5 * np.sin(phase) +
                0.25 * np.sin(2.1 * phase + 0.3) +
                0.15 * np.sin(3.2 * phase + 1.2) +
                0.1 * np.random.randn(len(time_array))
            )

            # Add broadband noise for realism
            broadband_noise = 0.2 * np.random.randn(len(time_array))
            broadband_noise = self._apply_bandpass_filter(broadband_noise, 100, min(2500, downsampled_rate // 2 - 1), downsampled_rate)

            # Apply distance-based amplitude attenuation
            amplitude_envelope = 2.0 / (distance_to_observer + 1e-3)
            combined_audio = (engine_sound + broadband_noise) * amplitude_envelope

            # Final filtering and normalization
            filtered_audio = self._apply_bandpass_filter(combined_audio, 30, min(4000, downsampled_rate // 2 - 1), downsampled_rate)
            
            # Safe normalization to prevent clipping
            audio_max = np.max(np.abs(filtered_audio))
            if audio_max > 0:
                filtered_audio = filtered_audio / audio_max

            # Upsample to original sample rate
            upsampled_audio = resample(filtered_audio, len(filtered_audio) * self.downsample_factor)
            upsampled_time = np.linspace(0, self.duration, len(upsampled_audio))
            
            return upsampled_time, upsampled_audio
            
        except Exception as error:
            logger.error(f"Sound generation error: {error}")
            # Fallback: simple sine wave
            fallback_time = np.linspace(0, self.duration, self.sample_rate * self.duration)
            fallback_audio = 0.5 * np.sin(2 * np.pi * base_frequency * fallback_time)
            return fallback_time, fallback_audio

    def _apply_bandpass_filter(self, audio_data, low_cutoff, high_cutoff, sample_rate, filter_order=4):
        """Apply bandpass filter to audio data"""
        try:
            nyquist_frequency = 0.5 * sample_rate
            normalized_low = max(low_cutoff / nyquist_frequency, 1e-5)
            normalized_high = min(high_cutoff / nyquist_frequency, 0.999)
            
            if normalized_low >= normalized_high:
                return audio_data
                
            filter_b, filter_a = butter(filter_order, [normalized_low, normalized_high], btype='band')
            return lfilter(filter_b, filter_a, audio_data)
            
        except Exception as error:
            logger.warning(f"Filter application error: {error}")
            return audio_data


class VehicleDopplerAnalyzer:
    """Analyzes audio signals to detect Doppler effect and estimate vehicle parameters"""
    
    def __init__(self):
        logger.info("Vehicle Doppler Analyzer initialized")

    def analyze_audio_signal(self, audio_file_path):
        """
        Comprehensive analysis of audio file for Doppler effect detection
        
        Args:
            audio_file_path: Path to the audio file to analyze
            
        Returns:
            dict: Analysis results including speed estimation and confidence
        """
        try:
            # Validate audio file existence and size
            if not os.path.exists(audio_file_path):
                return self._create_analysis_error("Audio file not found")
            
            file_size = os.path.getsize(audio_file_path)
            if file_size == 0:
                return self._create_analysis_error("Audio file is empty")
            
            # Load audio data
            try:
                audio_data, sample_rate = sf.read(audio_file_path)
            except Exception as load_error:
                logger.error(f"Audio file loading failed: {load_error}")
                return self._create_analysis_error(f"Failed to read audio file: {load_error}")
            
            # Validate loaded audio
            if audio_data is None or len(audio_data) == 0:
                return self._create_analysis_error("No audio data found in file")
                
            # Convert to mono if stereo
            if audio_data.ndim > 1:
                audio_data = np.mean(audio_data, axis=1)
            
            # Ensure proper data type and handle invalid values
            audio_data = audio_data.astype(np.float32)
            audio_data = np.nan_to_num(audio_data)
            
            signal_duration = len(audio_data) / sample_rate
            logger.info(f"Audio analysis started | Sample rate: {sample_rate} Hz | Duration: {signal_duration:.1f}s | Samples: {len(audio_data)}")

            # Generate waveform visualization data
            waveform_data = self._generate_waveform_visualization(audio_data, sample_rate)
            
            # Perform Doppler analysis
            try:
                doppler_analysis = self._perform_doppler_analysis(audio_data, sample_rate)
                doppler_analysis['waveform_data'] = waveform_data
                return doppler_analysis
            except Exception as analysis_error:
                logger.error(f"Doppler analysis failed: {analysis_error}")
                return self._fallback_analysis(audio_data, sample_rate, waveform_data, f"Doppler analysis failed: {analysis_error}")
            
        except Exception as error:
            logger.error(f"Complete analysis failure: {error}")
            return self._create_analysis_error(f"Analysis failed: {str(error)}")

    def _perform_doppler_analysis(self, audio_signal, sample_rate):
        """Core Doppler effect analysis using spectral processing"""
        try:
            logger.info("Starting Doppler effect analysis...")
            
            # Compute spectrogram for frequency analysis
            spectrogram = np.abs(librosa.stft(audio_signal, n_fft=2048, hop_length=256))
            frequency_bins = librosa.fft_frequencies(sr=sample_rate)
            time_frames = librosa.frames_to_time(np.arange(spectrogram.shape[1]), sr=sample_rate)
            
            # Track dominant frequency over time
            dominant_frequencies = frequency_bins[np.argmax(spectrogram, axis=0)]
            
            # Detect closest point of approach using RMS energy
            rms_energy = librosa.feature.rms(S=spectrogram)[0]
            closest_approach_time = time_frames[np.argmax(rms_energy)]
            closest_approach_index = np.argmin(np.abs(time_frames - closest_approach_time))
            
            # Split frequency tracks into approach and recede phases
            approach_frequencies = dominant_frequencies[:closest_approach_index]
            recede_frequencies = dominant_frequencies[closest_approach_index:]
            
            # Apply median filtering to reduce noise
            approach_frequencies = scipy.signal.medfilt(approach_frequencies, kernel_size=5)
            recede_frequencies = scipy.signal.medfilt(recede_frequencies, kernel_size=5)
            
            # Calculate frequency statistics
            mean_approach_freq = np.nanmean(approach_frequencies)
            mean_recede_freq = np.nanmean(recede_frequencies)
            estimated_source_freq = (mean_approach_freq + mean_recede_freq) / 2

            # Apply Doppler equations for velocity estimation
            sound_speed = 343  # m/s
            approach_velocity = sound_speed * (mean_approach_freq - estimated_source_freq) / mean_approach_freq
            recede_velocity = sound_speed * (estimated_source_freq - mean_recede_freq) / mean_recede_freq
            mean_velocity = (abs(approach_velocity) + abs(recede_velocity)) / 2
            
            # Validate frequency ranges
            if (mean_approach_freq < 50 or mean_recede_freq < 50 or 
                mean_approach_freq > 5000 or mean_recede_freq > 5000 or
                np.isnan(mean_approach_freq) or np.isnan(mean_recede_freq)):
                return self._basic_audio_analysis(audio_signal, sample_rate, "Frequency out of valid range")
            
            # Calculate analysis confidence
            frequency_shift = abs(mean_approach_freq - mean_recede_freq)
            frequency_shift_ratio = frequency_shift / estimated_source_freq if estimated_source_freq > 0 else 0
            
            confidence_factors = [
                min(1.0, frequency_shift_ratio * 20),  # Frequency shift strength
                min(1.0, (len(approach_frequencies) + len(recede_frequencies)) / 100),  # Data sufficiency
                1.0 - min(1.0, (np.nanstd(approach_frequencies) + np.nanstd(recede_frequencies)) / (estimated_source_freq + 1e-6)),  # Signal stability
                min(1.0, 1.0 - abs(approach_velocity - recede_velocity) / (mean_velocity + 1e-6) / 2),  # Velocity consistency
            ]
            
            analysis_confidence = np.mean(confidence_factors)
            analysis_confidence = max(0.1, min(0.98, analysis_confidence))
            
            # Determine if signal represents a vehicle
            is_vehicle_sound = bool(
                frequency_shift_ratio > 0.02 and  # Significant Doppler shift
                8 <= mean_velocity <= 200 and     # Realistic speed range
                analysis_confidence > 0.3 and     # Sufficient confidence
                len(approach_frequencies) > 5 and # Adequate approach data
                len(recede_frequencies) > 5       # Adequate recede data
            )
            
            # Compile analysis results
            analysis_result = {
                'is_vehicle': is_vehicle_sound,
                'estimated_speed': float(mean_velocity * 3.6),  # Convert to km/h
                'source_frequency': float(estimated_source_freq),
                'approach_frequency': float(mean_approach_freq),
                'recede_frequency': float(mean_recede_freq),
                'closest_point_time': float(closest_approach_time),
                'confidence': float(analysis_confidence),
                'sound_type': 'vehicle' if is_vehicle_sound else 'non-vehicle',
                'duration': len(audio_signal)/sample_rate,
                'analysis_method': 'spectral_doppler_analysis',
                'signal_processing_used': False,
                'message': 'Doppler analysis completed successfully',
                'analysis_details': {
                    'frequency_shift': float(frequency_shift),
                    'frequency_shift_ratio': float(frequency_shift_ratio),
                    'approach_samples': len(approach_frequencies),
                    'recede_samples': len(recede_frequencies),
                    'approach_velocity_ms': float(approach_velocity),
                    'recede_velocity_ms': float(recede_velocity),
                    'mean_velocity_ms': float(mean_velocity)
                }
            }
            
            logger.info(f"Analysis complete | Speed: {mean_velocity*3.6:.1f} km/h | Confidence: {analysis_confidence:.2f}")
            return analysis_result
            
        except Exception as error:
            logger.error(f"Doppler analysis error: {error}")
            return self._basic_audio_analysis(audio_signal, sample_rate, f"Doppler analysis error: {error}")

    def _basic_audio_analysis(self, audio_signal, sample_rate, reason=""):
        """Fallback analysis using basic audio characteristics"""
        try:
            signal_duration = len(audio_signal) / sample_rate
            rms_amplitude = np.sqrt(np.mean(audio_signal**2))
            
            try:
                spectral_center = np.mean(librosa.feature.spectral_centroid(y=audio_signal, sr=sample_rate))
            except:
                spectral_center = 1000  # Default value
            
            # Basic vehicle detection heuristics
            is_vehicle_sound = bool(
                rms_amplitude > 0.002 and 
                spectral_center > 150 and 
                spectral_center < 4000 and
                signal_duration > 2.0
            )
            
            return {
                'is_vehicle': is_vehicle_sound,
                'estimated_speed': 0,
                'source_frequency': 0,
                'approach_frequency': 0,
                'recede_frequency': 0,
                'closest_point_time': signal_duration / 2,
                'confidence': 0.3,
                'sound_type': 'basic_analysis',
                'duration': signal_duration,
                'analysis_method': 'basic_audio_analysis',
                'signal_processing_used': False,
                'message': f'{reason}. Using basic audio analysis.'
            }
        except Exception as error:
            return self._create_analysis_error(f"Basic analysis failed: {error}")

    def _fallback_analysis(self, audio_signal, sample_rate, waveform_data, reason=""):
        """Ultimate fallback analysis when other methods fail"""
        try:
            signal_duration = len(audio_signal) / sample_rate
            rms_amplitude = np.sqrt(np.mean(audio_signal**2))
            is_vehicle_sound = bool(rms_amplitude > 0.001)
            
            result = {
                'is_vehicle': is_vehicle_sound,
                'estimated_speed': 0,
                'source_frequency': 0,
                'approach_frequency': 0,
                'recede_frequency': 0,
                'closest_point_time': signal_duration / 2,
                'confidence': 0.2,
                'sound_type': 'fallback_analysis',
                'duration': signal_duration,
                'analysis_method': 'fallback_analysis',
                'signal_processing_used': False,
                'message': reason,
                'waveform_data': waveform_data
            }
            
            return result
        except Exception as error:
            return self._create_analysis_error(f"Complete analysis failure: {error}")

    def _generate_waveform_visualization(self, audio_signal, sample_rate):
        """Generate waveform data for frontend visualization"""
        try:
            signal_duration = len(audio_signal) / sample_rate
            
            if len(audio_signal) == 0:
                return {
                    'time': [0, 1],
                    'amplitude': [0, 0]
                }
            
            # Downsample for efficient visualization
            max_display_points = 1000
            sampling_step = max(1, len(audio_signal) // max_display_points)
            
            time_axis = np.linspace(0, signal_duration, len(audio_signal))[::sampling_step].tolist()
            amplitude_axis = audio_signal[::sampling_step].tolist()
            
            return {
                'time': time_axis,
                'amplitude': amplitude_axis
            }
        except Exception as error:
            logger.error(f"Waveform generation error: {error}")
            return {
                'time': [0, 1, 2, 3, 4, 5],
                'amplitude': [0, 0.5, 0.8, 0.5, 0, -0.5]
            }

    def _create_analysis_error(self, message):
        """Create standardized error response"""
        return {
            'error': message,
            'is_vehicle': False,
            'estimated_speed': 0,
            'source_frequency': 0,
            'approach_frequency': 0,
            'recede_frequency': 0,
            'closest_point_time': 0,
            'confidence': 0,
            'sound_type': 'error',
            'duration': 0,
            'analysis_method': 'error',
            'signal_processing_used': False,
            'message': message,
            'waveform_data': {
                'time': [0, 1],
                'amplitude': [0, 0]
            }
        }

# Create global analyzer instance
doppler_analyzer = VehicleDopplerAnalyzer()
logger.info("Vehicle Doppler Analysis System ready")