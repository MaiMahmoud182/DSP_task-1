from flask import Blueprint, request, jsonify
import os
import numpy as np
import pandas as pd
import io
import traceback
import base64
import logging
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.fft import fft, fftfreq
import json

# Configure logging
logger = logging.getLogger(__name__)

# Create EEG blueprint
eeg_bp = Blueprint('eeg', __name__, url_prefix='/api/eeg')

# EEG global variables
eeg_data_global = None
eeg_sampling_rate_global = 256

# EEG frequency bands
EEG_BANDS = {
    'Delta': (0.5, 4),
    'Theta': (4, 8),
    'Alpha': (8, 13),
    'Beta': (13, 30),
    'Gamma': (30, 100)
}

# Allowed file extensions
ALLOWED_EXTENSIONS = {'csv', 'txt'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def fig_to_base64(fig):
    """Convert matplotlib fig to base64 PNG."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=100)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")

def parse_eeg_csv(file_content, sampling_rate=250):
    """Parse EEG CSV file with multiple channels and headers"""
    global eeg_data_global, eeg_sampling_rate_global
    
    try:
        logger.info("📊 Parsing EEG CSV file...")
        
        # Read CSV with headers
        df = pd.read_csv(io.StringIO(file_content))
        
        logger.info(f"✅ CSV loaded successfully")
        logger.info(f"📏 Shape: {df.shape}")
        logger.info(f"📋 Columns: {df.columns.tolist()}")
        
        # First column should be time
        if df.shape[1] < 2:
            logger.error("❌ CSV file must have at least 2 columns (time + at least 1 channel)")
            return None
        
        time_column = df.columns[0]
        channel_columns = df.columns[1:]
        
        logger.info(f"⏰ Time column: {time_column}")
        logger.info(f"📡 Channel columns: {channel_columns.tolist()}")
        
        # Extract time and channel data
        time_data = df[time_column].values
        
        # Convert to list format for frontend
        channels = []
        for channel_name in channel_columns:
            channel_data = df[channel_name].dropna().values.tolist()
            channels.append(channel_data)
            logger.info(f"📈 Channel {channel_name}: {len(channel_data)} samples")
        
        # Ensure all channels have the same length
        max_length = max(len(channel) for channel in channels)
        logger.info(f"📏 Max channel length: {max_length}")
        
        for i in range(len(channels)):
            if len(channels[i]) < max_length:
                padding_needed = max_length - len(channels[i])
                channels[i].extend([0] * padding_needed)
        
        # Store globally for later use
        eeg_data_global = {
            'channels': channels,
            'channel_names': channel_columns.tolist(),
            'time_data': time_data.tolist(),
            'max_length': max_length
        }
        eeg_sampling_rate_global = sampling_rate
        
        # Convert DataFrame to JSON-serializable format
        df_dict = {
            'columns': df.columns.tolist(),
            'data': df.values.tolist(),
            'shape': list(df.shape)
        }
        
        return {
            'channels': channels,
            'channel_names': channel_columns.tolist(),
            'sampling_rate': sampling_rate,
            'duration': max_length / sampling_rate,
            'samples_per_channel': max_length,
            'dataframe': df_dict,
            'time_data': time_data.tolist()
        }
        
    except Exception as e:
        logger.error(f"❌ Error parsing EEG CSV: {e}")
        traceback.print_exc()
        return None

def compute_bandpower(signal_data, low_freq, high_freq, sampling_rate):
    """Compute band power for a specific frequency range using FFT"""
    try:
        signal_array = np.array(signal_data)
        
        # Compute FFT
        fft_vals = np.fft.rfft(signal_array)
        fft_freq = np.fft.rfftfreq(len(signal_array), 1.0/sampling_rate)
        
        # Find indices corresponding to the frequency band
        idx_band = np.logical_and(fft_freq >= low_freq, fft_freq <= high_freq)
        
        # Calculate power spectral density
        psd = np.abs(fft_vals) ** 2
        band_power = np.sum(psd[idx_band])
        
        return float(band_power)
    except Exception as e:
        logger.error(f"❌ Error computing band power: {e}")
        return 0.0

def calculate_band_powers(eeg_data, sampling_rate=250):
    """Calculate EEG frequency band powers for each channel"""
    if not eeg_data or 'channels' not in eeg_data:
        return {}
    
    band_powers = {}
    
    for band_name, (low_freq, high_freq) in EEG_BANDS.items():
        channel_powers = {}
        for i, channel_name in enumerate(eeg_data['channel_names']):
            channel_data = eeg_data['channels'][i]
            power = compute_bandpower(channel_data, low_freq, high_freq, sampling_rate)
            channel_powers[channel_name] = power
        
        band_powers[band_name] = channel_powers

    return band_powers

def calculate_recurrence_metrics(data1, data2, threshold):
    """Calculate basic recurrence plot metrics"""
    try:
        data1 = np.array(data1)
        data2 = np.array(data2)
        
        # Normalize data
        data1 = (data1 - np.mean(data1)) / (np.std(data1) or 1)
        data2 = (data2 - np.mean(data2)) / (np.std(data2) or 1)
        
        # Calculate cross-correlation as a simple metric
        cross_corr = np.correlate(data1, data2, mode='valid') / len(data1)
        
        # Simple recurrence metrics
        recurrence_rate = float(np.mean(cross_corr))
        determinism = float(np.max(cross_corr))
        
        return {
            'recurrenceRate': recurrence_rate,
            'determinism': determinism,
            'crossCorrelation': float(np.mean(cross_corr)),
            'correlation': float(np.corrcoef(data1, data2)[0, 1] if len(data1) == len(data2) else 0)
        }
    except Exception as e:
        logger.error(f"Error calculating recurrence metrics: {e}")
        return {
            'recurrenceRate': 0,
            'determinism': 0,
            'crossCorrelation': 0,
            'correlation': 0
        }

def assess_eeg_signal_quality(channels):
    """Assess signal quality based on variance and dynamics"""
    if not channels:
        return 0
    
    qualities = []
    for channel in channels:
        if channel and len(channel) > 10:
            channel_array = np.array(channel)
            # Calculate signal-to-noise ratio (simplified)
            signal_range = np.max(channel_array) - np.min(channel_array)
            noise = np.std(np.diff(channel_array))
            
            if noise > 0:
                snr = signal_range / noise
                quality = min(100, 50 + (snr * 5))
            else:
                quality = 30
                
            qualities.append(quality)
    
    return int(np.mean(qualities)) if qualities else 50

def generate_eeg_plots(eeg_data):
    """Generate visualization plots for EEG data"""
    try:
        plots = {}
        
        # Time series plot for first few channels
        fig1, ax1 = plt.subplots(figsize=(12, 8))
        time = np.arange(len(eeg_data['channels'][0])) / eeg_sampling_rate_global
        
        # Plot first 4 channels or all if less than 4
        num_channels_to_plot = min(4, len(eeg_data['channels']))
        for i in range(num_channels_to_plot):
            channel_data = eeg_data['channels'][i]
            channel_name = eeg_data['channel_names'][i]
            ax1.plot(time[:len(channel_data)], channel_data, label=channel_name, alpha=0.7)
        
        ax1.set_title("EEG Time Series")
        ax1.set_xlabel("Time (s)")
        ax1.set_ylabel("Amplitude (μV)")
        ax1.legend()
        ax1.grid(True, alpha=0.3)
        plt.tight_layout()
        plots['time_series'] = fig_to_base64(fig1)
        plt.close(fig1)
        
        # Power spectrum for first channel
        if eeg_data['channels']:
            channel_data = eeg_data['channels'][0]
            fig2, ax2 = plt.subplots(figsize=(10, 6))
            
            # Compute FFT
            fft_vals = np.fft.rfft(channel_data)
            fft_freq = np.fft.rfftfreq(len(channel_data), 1.0/eeg_sampling_rate_global)
            psd = np.abs(fft_vals) ** 2
            
            ax2.plot(fft_freq, psd)
            ax2.set_title("Power Spectral Density")
            ax2.set_xlabel("Frequency (Hz)")
            ax2.set_ylabel("Power")
            ax2.grid(True, alpha=0.3)
            
            # Add frequency band annotations
            colors = {'Delta': 'red', 'Theta': 'orange', 'Alpha': 'green', 'Beta': 'blue', 'Gamma': 'purple'}
            for band, (low, high) in EEG_BANDS.items():
                ax2.axvspan(low, high, alpha=0.2, color=colors.get(band, 'gray'), label=band)
            
            ax2.legend()
            ax2.set_xlim(0, 50)  # Focus on relevant frequencies
            plt.tight_layout()
            plots['power_spectrum'] = fig_to_base64(fig2)
            plt.close(fig2)
        
        return plots
        
    except Exception as e:
        logger.error(f"Error generating EEG plots: {e}")
        return {}

@eeg_bp.route('/health', methods=['GET'])
def eeg_health_check():
    """Health check endpoint for EEG analyzer"""
    return jsonify({
        'status': 'healthy',
        'message': 'EEG Analyzer API is running!',
        'endpoints': {
            'upload_eeg': 'POST /api/eeg/upload',
            'classify_eeg': 'POST /api/eeg/classify',
            'get_polar_data': 'GET /api/eeg/get_polar_data/<mode>',
            'get_recurrence_data': 'POST /api/eeg/get_recurrence_data'
        }
    })

@eeg_bp.route('/upload', methods=['POST'])
def upload_eeg():
    logger.info("\n" + "="*50)
    logger.info("📁 EEG UPLOAD ENDPOINT CALLED")
    logger.info("="*50)
    
    try:
        if 'eeg_file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['eeg_file']
        logger.info(f"📄 File received: {file.filename}")
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type'}), 400

        # Read file content
        file_content = file.read().decode('utf-8')
        
        logger.info(f"📊 File size: {len(file_content)} characters")
        
        sampling_rate = int(request.form.get('sampling_rate', 250))
        logger.info(f"🎯 Sampling rate: {sampling_rate} Hz")

        eeg_data = parse_eeg_csv(file_content, sampling_rate)
        
        if eeg_data is None:
            return jsonify({'error': 'Failed to parse EEG file'}), 400
        
        # Calculate band powers
        band_powers = calculate_band_powers(eeg_data, sampling_rate)
        
        # Calculate signal quality
        signal_quality = assess_eeg_signal_quality(eeg_data['channels'])
        
        # Generate plots
        plots = generate_eeg_plots(eeg_data)
        
        # Create basic analysis results
        basic_analysis = {
            'signal_quality': signal_quality,
            'band_powers': band_powers,
            'channels_count': len(eeg_data['channels']),
            'duration': eeg_data['duration'],
            'sampling_rate': sampling_rate
        }
        
        response_data = {
            'message': 'EEG file processed successfully!',
            'data': eeg_data,
            'analysis': basic_analysis,
            'plots': plots
        }
        
        logger.info("✅ File parsed successfully!")
        logger.info(f"📡 Channels: {len(eeg_data['channels'])}")
        logger.info(f"⏱️ Duration: {eeg_data['duration']:.2f}s")
        logger.info(f"📊 Signal Quality: {signal_quality}%")
        logger.info("="*50)
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"💥 Upload error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@eeg_bp.route('/classify', methods=['POST'])
def classify_eeg():
    """Classify EEG data and provide analysis"""
    logger.info("\n🧠 EEG CLASSIFICATION ENDPOINT CALLED")
    
    try:
        if eeg_data_global is None:
            return jsonify({'error': 'No EEG data loaded. Please upload a file first.'}), 400
        
        # Get classification parameters from request
        data = request.get_json() or {}
        analysis_type = data.get('analysis_type', 'basic')
        
        # Prepare EEG data for response
        eeg_data = {
            'channels': eeg_data_global['channels'],
            'channel_names': eeg_data_global['channel_names'],
            'sampling_rate': eeg_sampling_rate_global,
            'duration': eeg_data_global['max_length'] / eeg_sampling_rate_global
        }
        
        # Calculate comprehensive analysis
        band_powers = calculate_band_powers(eeg_data, eeg_sampling_rate_global)
        signal_quality = assess_eeg_signal_quality(eeg_data_global['channels'])
        
        # Calculate dominant frequency for each channel
        dominant_frequencies = {}
        for i, channel_name in enumerate(eeg_data_global['channel_names']):
            channel_data = eeg_data_global['channels'][i]
            if len(channel_data) > 10:
                fft_vals = np.fft.rfft(channel_data)
                fft_freq = np.fft.rfftfreq(len(channel_data), 1.0/eeg_sampling_rate_global)
                psd = np.abs(fft_vals) ** 2
                dominant_freq = fft_freq[np.argmax(psd)]
                dominant_frequencies[channel_name] = float(dominant_freq)
        
        # Generate classification results
        classification_results = {
            'signal_quality': {
                'score': signal_quality,
                'assessment': 'Excellent' if signal_quality >= 80 else 
                            'Good' if signal_quality >= 60 else 
                            'Fair' if signal_quality >= 40 else 'Poor'
            },
            'band_powers': band_powers,
            'dominant_frequencies': dominant_frequencies,
            'channel_count': len(eeg_data_global['channels']),
            'total_duration': eeg_data_global['max_length'] / eeg_sampling_rate_global,
            'analysis_type': analysis_type
        }
        
        # Add specific insights based on band powers
        insights = []
        for channel_name in eeg_data_global['channel_names']:
            channel_bands = {}
            for band_name in EEG_BANDS.keys():
                if band_name in band_powers and channel_name in band_powers[band_name]:
                    channel_bands[band_name] = band_powers[band_name][channel_name]
            
            # Simple insights based on relative band powers
            if channel_bands:
                max_band = max(channel_bands, key=channel_bands.get)
                insights.append(f"Channel {channel_name}: Dominant {max_band} activity")
        
        classification_results['insights'] = insights
        
        logger.info("✅ EEG classification completed successfully!")
        
        return jsonify({
            'success': True,
            'classification': classification_results,
            'message': 'EEG analysis completed successfully'
        })
        
    except Exception as e:
        logger.error(f"💥 EEG classification error: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@eeg_bp.route('/get_polar_data/<mode>', methods=['GET'])
def get_eeg_polar_data(mode):
    """Get polar plot data with fixed or dynamic mode"""
    try:
        logger.info(f"\n🎯 EEG POLAR DATA REQUEST - Mode: {mode}")
        
        if eeg_data_global is None:
            logger.error("❌ No EEG data loaded globally")
            return jsonify({'error': 'No EEG data loaded. Please upload a file first.'}), 400
        
        # Get current time from query parameters
        current_time = request.args.get('current_time', '0')
        try:
            current_time = float(current_time)
        except ValueError:
            current_time = 0.0
            
        logger.info(f"📊 Current time: {current_time}s")
        logger.info(f"🎯 Sampling rate: {eeg_sampling_rate_global} Hz")
        
        window_samples = eeg_sampling_rate_global * 2  # 2-second window
        current_sample = int(current_time * eeg_sampling_rate_global)
        
        # Channels to include
        channel_list = request.args.get('channels', '')
        selected_channels = channel_list.split(',') if channel_list else eeg_data_global['channel_names']
        
        if mode == "dynamic":
            # Dynamic mode - use current position for animation
            start = max(0, current_sample - int(window_samples/4))
            # Ensure we don't go beyond data length
            if start + window_samples > eeg_data_global['max_length']:
                start = max(0, eeg_data_global['max_length'] - window_samples)
            end = min(eeg_data_global['max_length'], start + window_samples)
            logger.info(f"🔧 Dynamic mode - Start: {start}, End: {end}")
        else:
            # Fixed window mode - get a larger sample for better visualization
            start = 0
            end = min(eeg_data_global['max_length'], eeg_sampling_rate_global * 10)  # 10 seconds of data
            logger.info(f"🔧 Fixed mode - Start: {start}, End: {end}")

        data = {}
        for channel_name in selected_channels:
            if channel_name not in eeg_data_global['channel_names']:
                continue
                
            channel_idx = eeg_data_global['channel_names'].index(channel_name)
            channel_data = eeg_data_global['channels'][channel_idx]
            
            # Get the appropriate slice
            end_idx = min(end, len(channel_data))
            samples = channel_data[start:end_idx]
            
            # Convert to polar coordinates
            r_values = samples  # amplitude becomes radius
            
            # Calculate theta - distribute evenly in a circle
            theta_values = np.linspace(0, 360, len(samples)).tolist()
            
            data[channel_name] = {
                "r": r_values,
                "theta": theta_values
            }
            
            logger.info(f"📈 Channel {channel_name}: {len(r_values)} samples")

        logger.info("✅ Polar data prepared successfully")
        return jsonify(data)
        
    except Exception as e:
        logger.error(f"❌ Error in get_eeg_polar_data: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@eeg_bp.route('/get_recurrence_data', methods=['POST'])
def get_recurrence_data():
    """Get data for recurrence plot based on selected channels"""
    try:
        logger.info(f"\n🔄 EEG RECURRENCE DATA REQUEST")
        
        if eeg_data_global is None:
            logger.error("❌ No EEG data loaded globally")
            return jsonify({'error': 'No EEG data loaded. Please upload a file first.'}), 400
        
        # Get selection parameters from request body
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No selection data provided'}), 400
            
        # Extract selected regions information
        region1 = data.get('region1', {})
        region2 = data.get('region2', {})
        
        if not region1 or not region2:
            return jsonify({'error': 'Two regions must be selected'}), 400
        
        channel1_name = region1.get('channelName')
        channel2_name = region2.get('channelName')
        start_idx1 = region1.get('startIndex', 0)
        end_idx1 = region1.get('endIndex', 0)
        start_idx2 = region2.get('startIndex', 0)
        end_idx2 = region2.get('endIndex', 0)
        
        logger.info(f"📊 Selection - Channel 1: {channel1_name} [{start_idx1}:{end_idx1}]")
        logger.info(f"📊 Selection - Channel 2: {channel2_name} [{start_idx2}:{end_idx2}]")
        
        # Validate channel names
        if (channel1_name not in eeg_data_global['channel_names'] or 
            channel2_name not in eeg_data_global['channel_names']):
            return jsonify({'error': 'Invalid channel name selected'}), 400
        
        # Get channel indices
        channel1_idx = eeg_data_global['channel_names'].index(channel1_name)
        channel2_idx = eeg_data_global['channel_names'].index(channel2_name)
        
        # Get data for selected regions
        channel1_data = eeg_data_global['channels'][channel1_idx][start_idx1:end_idx1]
        channel2_data = eeg_data_global['channels'][channel2_idx][start_idx2:end_idx2]
        
        # Check if this is a self-comparison (same channel)
        is_self_comparison = channel1_name == channel2_name
        if is_self_comparison:
            logger.info("📊 Self-comparison detected (same channel)")
        
        # If selections are too large, sample them down
        max_points = 1000
        if len(channel1_data) > max_points:
            step = len(channel1_data) // max_points
            channel1_data = channel1_data[::step]
        
        if len(channel2_data) > max_points:
            step = len(channel2_data) // max_points
            channel2_data = channel2_data[::step]
        
        # Get time data if available
        time1 = None
        time2 = None
        if 'time_data' in eeg_data_global:
            time_data = eeg_data_global['time_data']
            if start_idx1 < len(time_data) and end_idx1 <= len(time_data):
                time1 = time_data[start_idx1:end_idx1]
                if len(time1) > max_points:
                    time1 = time1[::len(time1) // max_points]
            
            if start_idx2 < len(time_data) and end_idx2 <= len(time_data):
                time2 = time_data[start_idx2:end_idx2]
                if len(time2) > max_points:
                    time2 = time2[::len(time2) // max_points]
        
        # Calculate recurrence metrics
        threshold = data.get('threshold', 0.1)
        metrics = calculate_recurrence_metrics(channel1_data, channel2_data, threshold)
        
        # For self-comparison, some metrics will be different
        if is_self_comparison:
            metrics['isSelfComparison'] = True
            metrics['autocorrelation'] = float(np.mean(np.correlate(channel1_data, channel1_data, mode='full')))
        
        response_data = {
            'channel1': {
                'name': channel1_name,
                'data': channel1_data,
                'time': time1
            },
            'channel2': {
                'name': channel2_name,
                'data': channel2_data,
                'time': time2
            },
            'metrics': metrics,
            'isSelfComparison': is_self_comparison
        }
        
        logger.info(f"✅ Recurrence data prepared - {len(channel1_data)} x {len(channel2_data)} points")
        logger.info(f"📊 Metrics: RR={metrics['recurrenceRate']:.2f}, DET={metrics['determinism']:.2f}")
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"❌ Error in get_recurrence_data: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@eeg_bp.route('/channels', methods=['GET'])
def get_available_channels():
    """Get list of available EEG channels"""
    if eeg_data_global is None:
        return jsonify({'error': 'No EEG data loaded'}), 400
    
    return jsonify({
        'channels': eeg_data_global['channel_names'],
        'count': len(eeg_data_global['channel_names'])
    })

@eeg_bp.route('/reset', methods=['POST'])
def reset_eeg_data():
    """Reset EEG global data"""
    global eeg_data_global, eeg_sampling_rate_global
    eeg_data_global = None
    eeg_sampling_rate_global = 256
    
    return jsonify({'message': 'EEG data reset successfully'})

# Error handlers for EEG blueprint
@eeg_bp.errorhandler(404)
def eeg_not_found(error):
    return jsonify({'error': 'EEG endpoint not found'}), 404

@eeg_bp.errorhandler(500)
def eeg_internal_error(error):
    return jsonify({'error': 'EEG internal server error'}), 500