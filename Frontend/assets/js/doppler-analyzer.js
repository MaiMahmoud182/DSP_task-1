// assets/js/doppler-analyzer.js - Professional Vehicle Doppler Effect Analyzer
class DopplerEffectAnalyzer {
    constructor() {
        this.currentAudioFile = null;
        this.generatedAudioData = null;
        this.uploadedAudioUrl = null;
        this.analysisResults = null;
        this.apiBaseUrl = 'http://localhost:5000';
        this.initializeEventHandlers();
        this.initializeControlElements();
    }

    initializeEventHandlers() {
        // Analysis mode selection
        document.querySelectorAll('.mode-tab').forEach(tab => {
            tab.addEventListener('click', (event) => {
                this.switchAnalysisMode(event.target.dataset.mode);
            });
        });

        // Sound generation controls
        document.getElementById('generateBtn').addEventListener('click', () => this.generateDopplerSound());
        document.getElementById('playGeneratedBtn').addEventListener('click', () => this.playGeneratedSound());
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadGeneratedSound());

        // Audio analysis controls
        document.getElementById('audioFile').addEventListener('change', (event) => this.handleAudioFileUpload(event));
        document.getElementById('analyzeBtn').addEventListener('click', () => this.analyzeVehicleSound());
        document.getElementById('playUploadedBtn').addEventListener('click', () => this.playUploadedAudio());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetAnalysisSession());

        // Real-time parameter updates
        document.getElementById('baseFreq').addEventListener('input', (event) => this.updateParameterDisplay('baseFreqValue', 'Hz', event));
        document.getElementById('velocity').addEventListener('input', (event) => this.updateParameterDisplay('velocityValue', 'km/h', event));
    }

    initializeControlElements() {
        this.updateParameterDisplay('baseFreqValue', 'Hz', { target: document.getElementById('baseFreq') });
        this.updateParameterDisplay('velocityValue', 'km/h', { target: document.getElementById('velocity') });
    }

    switchAnalysisMode(mode) {
        // Update tab states
        document.querySelectorAll('.mode-tab').forEach(tab => {
            const isActiveMode = tab.dataset.mode === mode;
            tab.classList.toggle('active', isActiveMode);
            tab.classList.toggle('btn-primary', isActiveMode);
            tab.classList.toggle('btn-outline-primary', !isActiveMode);
        });

        // Show/hide appropriate panels
        document.getElementById('generate-panel').style.display = mode === 'generate' ? 'block' : 'none';
        document.getElementById('analyze-panel').style.display = mode === 'analyze' ? 'block' : 'none';

        // Reset generate panel when switching to generation mode
        if (mode === 'generate') {
            this.resetGenerationPanel();
        }
    }

    updateParameterDisplay(valueElementId, unit, event) {
        document.getElementById(valueElementId).textContent = `${event.target.value} ${unit}`;
    }

    async generateDopplerSound() {
        const baseFrequency = document.getElementById('baseFreq').value;
        const vehicleVelocity = document.getElementById('velocity').value;
        const soundDuration = document.getElementById('duration').value;

        this.showProcessingIndicator(true);
        this.setGenerationControlsState(true);

        try {
            const apiResponse = await fetch(`${this.apiBaseUrl}/api/generate-doppler-sound`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    base_freq: parseInt(baseFrequency),
                    velocity: parseInt(vehicleVelocity),
                    duration: parseInt(soundDuration)
                })
            });

            if (!apiResponse.ok) {
                const errorDetails = await this.extractErrorMessageFromResponse(apiResponse);
                throw new Error(errorDetails);
            }

            const responseText = await apiResponse.text();
            if (!responseText) {
                throw new Error('Empty response from server');
            }

            const responseData = JSON.parse(responseText);

            if (responseData.success) {
                this.displayGeneratedWaveform(responseData.waveform_visualization);
                this.generatedAudioData = responseData.audio_data;
                this.setGenerationControlsState(false);
                this.showUserNotification('🚗 Doppler sound generated successfully!', 'success');
                
                // Auto-play generated sound after short delay
                setTimeout(() => this.playGeneratedSound(), 500);
            } else {
                this.showUserNotification('❌ Error generating sound: ' + (responseData.error || 'Unknown error'), 'error');
                this.setGenerationControlsState(false);
            }
        } catch (error) {
            console.error('Sound generation error:', error);
            const userMessage = this.formatErrorMessageForUser(error.message);
            this.showUserNotification('❌ ' + userMessage, 'error');
            this.setGenerationControlsState(false);
        } finally {
            this.showProcessingIndicator(false);
        }
    }

    displayGeneratedWaveform(waveformData) {
        try {
            const waveformTrace = {
                x: waveformData.time,
                y: waveformData.amplitude,
                type: 'scatter',
                mode: 'lines',
                line: { 
                    color: '#007bff', 
                    width: 1.5,
                    shape: 'spline'
                },
                name: 'Doppler Sound Waveform',
                hovertemplate: 'Time: %{x:.2f}s<br>Amplitude: %{y:.3f}<extra></extra>'
            };

            const plotLayout = {
                title: {
                    text: 'Generated Doppler Sound Waveform',
                    font: { size: 16, color: '#333' }
                },
                xaxis: { 
                    title: 'Time (s)', 
                    gridcolor: '#f0f0f0',
                    zerolinecolor: '#f0f0f0',
                    showgrid: true,
                    tickformat: '.1f',
                    tick0: 0,
                    dtick: 1,
                    range: [0, Math.max(...waveformData.time)]
                },
                yaxis: { 
                    title: 'Amplitude', 
                    gridcolor: '#f0f0f0',
                    zerolinecolor: '#f0f0f0',
                    showgrid: true,
                    range: [-1, 1]
                },
                plot_bgcolor: 'rgba(0,0,0,0)',
                paper_bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#333', family: 'Arial' },
                margin: { t: 50, r: 30, b: 50, l: 60 },
                hovermode: 'closest',
                showlegend: false
            };

            const plotConfig = {
                responsive: true,
                displayModeBar: true,
                displaylogo: false,
                modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
                scrollZoom: true
            };

            Plotly.newPlot('generatedWaveform', [waveformTrace], plotLayout, plotConfig);
        } catch (error) {
            console.error('Waveform display error:', error);
            this.showUserNotification('❌ Error displaying waveform visualization', 'error');
        }
    }

    playGeneratedSound() {
        if (this.generatedAudioData) {
            const audioElement = document.getElementById('generatedAudio');
            audioElement.src = this.generatedAudioData;
            audioElement.style.display = 'block';
            
            audioElement.play().catch(playbackError => {
                console.log('Audio playback failed:', playbackError);
                this.showUserNotification('🔇 Click the play button in the audio player to start playback', 'info');
            });
            
            this.showUserNotification('🔊 Playing generated Doppler sound...', 'info');
        }
    }

    downloadGeneratedSound() {
        if (this.generatedAudioData) {
            const baseFrequency = document.getElementById('baseFreq').value;
            const vehicleVelocity = document.getElementById('velocity').value;
            
            const downloadLink = document.createElement('a');
            downloadLink.href = this.generatedAudioData;
            downloadLink.download = `doppler_sound_${baseFrequency}Hz_${vehicleVelocity}kmh.wav`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
            this.showUserNotification('💾 Sound file downloaded successfully!', 'success');
        }
    }

    handleAudioFileUpload(event) {
        const selectedFile = event.target.files[0];
        if (selectedFile) {
            const allowedAudioTypes = ['audio/wav', 'audio/mp3', 'audio/flac', 'audio/aac', 'audio/ogg', 'audio/x-wav'];
            if (!allowedAudioTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(wav|mp3|flac|aac|ogg)$/i)) {
                this.showUserNotification('❌ Please upload a valid audio file (WAV, MP3, FLAC, AAC, OGG)', 'error');
                event.target.value = '';
                return;
            }

            if (selectedFile.size > 50 * 1024 * 1024) {
                this.showUserNotification('❌ File too large. Please upload files smaller than 50MB', 'error');
                event.target.value = '';
                return;
            }

            this.currentAudioFile = selectedFile;
            document.getElementById('analyzeBtn').disabled = false;
            document.getElementById('playUploadedBtn').disabled = false;
            
            this.displayUploadedFileInformation(selectedFile);
            
            this.showUserNotification('✅ Audio file uploaded successfully!', 'success');
        }
    }

    displayUploadedFileInformation(file) {
        document.getElementById('uploadedWaveform').innerHTML = `
            <div class="uploaded-file-info text-center p-3">
                <i class="bi bi-file-earmark-music text-primary fs-1 mb-2"></i>
                <h6 class="mb-1">${file.name}</h6>
                <p class="mb-1 text-muted small">${this.formatFileSize(file.size)} • Ready for analysis</p>
            </div>
        `;
    }

    async analyzeVehicleSound() {
        if (!this.currentAudioFile) return;

        this.showProcessingIndicator(true);
        this.setAnalysisControlsState(true);

        const formData = new FormData();
        formData.append('audio_file', this.currentAudioFile);

        try {
            const apiResponse = await fetch(`${this.apiBaseUrl}/api/analyze-vehicle-sound`, {
                method: 'POST',
                body: formData
            });

            if (!apiResponse.ok) {
                const errorDetails = await this.extractErrorMessageFromResponse(apiResponse);
                throw new Error(errorDetails);
            }

            const responseText = await apiResponse.text();
            if (!responseText) {
                throw new Error('Empty response from server');
            }

            const responseData = JSON.parse(responseText);

            if (responseData.success) {
                this.analysisResults = responseData.analysis;
                
                // Display waveform visualization if available
                if (responseData.analysis.waveform_data) {
                    this.displayAnalyzedWaveform(responseData.analysis.waveform_data);
                }
                
                this.displayAnalysisResults(responseData.analysis);
                await this.displaySpectrogramVisualization(responseData.analysis);
                
                this.showUserNotification('✅ Vehicle sound analysis completed!', 'success');
            } else {
                this.showUserNotification('❌ Analysis failed: ' + (responseData.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Analysis error:', error);
            const userMessage = this.formatErrorMessageForUser(error.message);
            this.showUserNotification('❌ ' + userMessage, 'error');
        } finally {
            this.showProcessingIndicator(false);
            this.setAnalysisControlsState(false);
        }
    }

    displayAnalyzedWaveform(waveformData) {
        try {
            const waveformTrace = {
                x: waveformData.time,
                y: waveformData.amplitude,
                type: 'scatter',
                mode: 'lines',
                line: { 
                    color: '#28a745', 
                    width: 1.5,
                    shape: 'spline'
                },
                name: 'Analyzed Audio Waveform',
                hovertemplate: 'Time: %{x:.2f}s<br>Amplitude: %{y:.3f}<extra></extra>'
            };

            const plotLayout = {
                title: {
                    text: 'Analyzed Audio Waveform',
                    font: { size: 16, color: '#333' }
                },
                xaxis: { 
                    title: 'Time (s)', 
                    gridcolor: '#f0f0f0',
                    zerolinecolor: '#f0f0f0',
                    showgrid: true,
                    tickformat: '.1f',
                    tick0: 0,
                    dtick: 1,
                    range: [0, Math.max(...waveformData.time)]
                },
                yaxis: { 
                    title: 'Amplitude', 
                    gridcolor: '#f0f0f0',
                    zerolinecolor: '#f0f0f0',
                    showgrid: true,
                    range: [-1, 1]
                },
                plot_bgcolor: 'rgba(0,0,0,0)',
                paper_bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#333', family: 'Arial' },
                margin: { t: 50, r: 30, b: 50, l: 60 },
                hovermode: 'closest',
                showlegend: false
            };

            const plotConfig = {
                responsive: true,
                displayModeBar: true,
                displaylogo: false,
                modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
                scrollZoom: true
            };

            // Clear placeholder and display waveform
            const container = document.getElementById('uploadedWaveform');
            container.innerHTML = '';
            Plotly.newPlot('uploadedWaveform', [waveformTrace], plotLayout, plotConfig);
        } catch (error) {
            console.error('Analyzed waveform display error:', error);
            this.showUserNotification('❌ Error displaying analyzed waveform', 'error');
        }
    }

    displayAnalysisResults(analysis) {
        // Update statistics dashboard
        document.getElementById('estimatedSpeed').textContent = analysis.estimated_speed > 0 ? 
            `${analysis.estimated_speed.toFixed(1)} km/h` : '-- km/h';
        document.getElementById('sourceFreq').textContent = analysis.source_frequency > 0 ? 
            `${analysis.source_frequency.toFixed(1)} Hz` : '-- Hz';
        document.getElementById('approachFreq').textContent = analysis.approach_frequency > 0 ? 
            `${analysis.approach_frequency.toFixed(1)} Hz` : '-- Hz';
        document.getElementById('recedeFreq').textContent = analysis.recede_frequency > 0 ? 
            `${analysis.recede_frequency.toFixed(1)} Hz` : '-- Hz';

        const resultContainer = document.getElementById('analysisResult');
        const confidencePercentage = ((analysis.confidence || 0) * 100).toFixed(1);

        if (analysis.is_vehicle && analysis.estimated_speed > 0) {
            resultContainer.innerHTML = `
                <div class="classification-result vehicle">
                    <div class="row">
                        <div class="col-md-8">
                            <h4>🚗 Vehicle Sound Detected</h4>
                            <div class="row mt-3">
                                <div class="col-6">
                                    <p class="mb-2"><strong>Estimated Speed:</strong></p>
                                    <p class="mb-2"><strong>Source Frequency:</strong></p>
                                    <p class="mb-2"><strong>Closest Point:</strong></p>
                                    <p class="mb-2"><strong>Analysis Confidence:</strong></p>
                                    <p class="mb-0"><strong>Method:</strong></p>
                                </div>
                                <div class="col-6">
                                    <p class="mb-2"><strong>${analysis.estimated_speed.toFixed(1)} km/h</strong></p>
                                    <p class="mb-2"><strong>${analysis.source_frequency.toFixed(1)} Hz</strong></p>
                                    <p class="mb-2"><strong>${analysis.closest_point_time.toFixed(1)} s</strong></p>
                                    <p class="mb-2"><span class="badge bg-${confidencePercentage > 70 ? 'success' : confidencePercentage > 40 ? 'warning' : 'danger'}">${confidencePercentage}%</span></p>
                                    <p class="mb-0"><strong>${analysis.analysis_method}</strong></p>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="text-center">
                                <div class="display-4 text-primary">${analysis.estimated_speed.toFixed(0)}</div>
                                <small class="text-muted">km/h</small>
                                <div class="mt-2">
                                    <small class="text-muted">Approach: ${analysis.approach_frequency.toFixed(0)} Hz</small><br>
                                    <small class="text-muted">Recede: ${analysis.recede_frequency.toFixed(0)} Hz</small>
                                </div>
                            </div>
                        </div>
                    </div>
                    ${analysis.message ? `<div class="mt-2 p-2 bg-info bg-opacity-10 rounded"><small>${analysis.message}</small></div>` : ''}
                </div>
            `;
        } else {
            resultContainer.innerHTML = `
                <div class="classification-result non-vehicle">
                    <h4>❌ ${analysis.sound_type === 'vehicle' ? 'Insufficient Data' : 'Non-Vehicle Sound'}</h4>
                    <p class="mb-2">Analysis Method: <strong>${analysis.analysis_method}</strong></p>
                    <p class="mb-2">Confidence: <strong>${confidencePercentage}%</strong></p>
                    <p class="mb-0 text-muted">${analysis.message || 'Unable to detect clear Doppler effect for speed estimation.'}</p>
                </div>
            `;
        }
    }

    async displaySpectrogramVisualization(analysis) {
        if (!this.currentAudioFile) return;

        const formData = new FormData();
        formData.append('audio_file', this.currentAudioFile);

        try {
            const apiResponse = await fetch(`${this.apiBaseUrl}/api/get-spectrogram`, {
                method: 'POST',
                body: formData
            });

            if (!apiResponse.ok) throw new Error('Spectrogram request failed');

            const responseText = await apiResponse.text();
            const responseData = JSON.parse(responseText);

            if (responseData.success) {
                const spectrogramData = responseData.spectrogram;
                
                const spectrogramTrace = {
                    z: spectrogramData.intensity,
                    x: spectrogramData.time,
                    y: spectrogramData.frequency,
                    type: 'heatmap',
                    colorscale: 'Viridis',
                    showscale: true,
                    hoverinfo: 'x+y+z',
                    hovertemplate: 'Time: %{x:.2f}s<br>Frequency: %{y:.0f}Hz<br>Intensity: %{z:.1f}dB<extra></extra>'
                };

                const plotLayout = {
                    title: {
                        text: 'Spectrogram Analysis',
                        font: { size: 16, color: '#333' }
                    },
                    xaxis: { 
                        title: 'Time (s)',
                        gridcolor: '#f0f0f0',
                        tickformat: '.1f'
                    },
                    yaxis: { 
                        title: 'Frequency (Hz)',
                        gridcolor: '#f0f0f0'
                    },
                    margin: { t: 50, r: 30, b: 50, l: 60 },
                    height: 400,
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    paper_bgcolor: 'rgba(0,0,0,0)'
                };

                const plotConfig = {
                    responsive: true,
                    displayModeBar: true,
                    displaylogo: false,
                    modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d']
                };

                Plotly.newPlot('spectrogramChart', [spectrogramTrace], plotLayout, plotConfig);
            }
        } catch (error) {
            console.error('Spectrogram visualization error:', error);
            this.displaySpectrogramPlaceholder();
        }
    }

    displaySpectrogramPlaceholder() {
        const placeholderContainer = document.getElementById('spectrogramChart');
        placeholderContainer.innerHTML = `
            <div class="text-center p-5">
                <i class="bi bi-graph-up display-4 text-muted mb-3"></i>
                <p class="text-muted">Spectrogram visualization unavailable</p>
                <small class="text-muted">Audio analysis was still performed successfully</small>
            </div>
        `;
    }

    playUploadedAudio() {
        const audioElement = document.getElementById('uploadedAudio');
        if (this.currentAudioFile) {
            if (!this.uploadedAudioUrl) {
                this.uploadedAudioUrl = URL.createObjectURL(this.currentAudioFile);
            }
            audioElement.src = this.uploadedAudioUrl;
            audioElement.style.display = 'block';
            
            audioElement.play().catch(playbackError => {
                console.log('Audio playback failed:', playbackError);
                this.showUserNotification('🔇 Click the play button in the audio player to start playback', 'info');
            });
        }
    }

    resetAnalysisSession() {
        document.getElementById('audioFile').value = '';
        document.getElementById('analyzeBtn').disabled = true;
        document.getElementById('playUploadedBtn').disabled = true;
        document.getElementById('analysisResult').innerHTML = '<p class="text-muted">Upload a vehicle sound file and click "Analyze Sound" to see results</p>';
        document.getElementById('uploadedWaveform').innerHTML = '';
        document.getElementById('uploadedAudio').src = '';
        document.getElementById('uploadedAudio').style.display = 'none';
        document.getElementById('spectrogramChart').innerHTML = '';
        
        document.getElementById('estimatedSpeed').textContent = '-- km/h';
        document.getElementById('sourceFreq').textContent = '-- Hz';
        document.getElementById('approachFreq').textContent = '-- Hz';
        document.getElementById('recedeFreq').textContent = '-- Hz';
        
        if (this.uploadedAudioUrl) {
            URL.revokeObjectURL(this.uploadedAudioUrl);
            this.uploadedAudioUrl = null;
        }
        
        this.currentAudioFile = null;
        this.analysisResults = null;
        
        this.showUserNotification('🔄 Analysis session reset', 'info');
    }

    resetGenerationPanel() {
        document.getElementById('generatedWaveform').innerHTML = '';
        document.getElementById('generatedAudio').src = '';
        document.getElementById('generatedAudio').style.display = 'none';
        this.generatedAudioData = null;
        this.setGenerationControlsState(true);
    }

    setGenerationControlsState(disabled) {
        document.getElementById('playGeneratedBtn').disabled = disabled;
        document.getElementById('downloadBtn').disabled = disabled;
    }

    setAnalysisControlsState(disabled) {
        document.getElementById('analyzeBtn').disabled = disabled;
        document.getElementById('playUploadedBtn').disabled = disabled;
    }

    showProcessingIndicator(show) {
        document.getElementById('loading').style.display = show ? 'block' : 'none';
    }

    async extractErrorMessageFromResponse(response) {
        try {
            const errorData = await response.json();
            return errorData.error || `Server error: ${response.status}`;
        } catch (error) {
            return response.statusText || `Server error: ${response.status}`;
        }
    }

    formatErrorMessageForUser(errorMessage) {
        if (errorMessage.includes('500')) {
            return 'Server error during processing.';
        } else if (errorMessage.includes('Network Error')) {
            return 'Network error. Please check if the server is running.';
        } else if (errorMessage.includes('404')) {
            return 'Service endpoint not found.';
        }
        return errorMessage;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const kilobyte = 1024;
        const sizeUnits = ['Bytes', 'KB', 'MB', 'GB'];
        const unitIndex = Math.floor(Math.log(bytes) / Math.log(kilobyte));
        return parseFloat((bytes / Math.pow(kilobyte, unitIndex)).toFixed(2)) + ' ' + sizeUnits[unitIndex];
    }

    showUserNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.custom-toast');
        existingNotifications.forEach(notification => notification.remove());

        const notificationElement = document.createElement('div');
        const alertClass = type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info';
        notificationElement.className = `custom-toast alert alert-${alertClass} alert-dismissible fade show`;
        notificationElement.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        Object.assign(notificationElement.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: '9999',
            minWidth: '300px',
            maxWidth: '500px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            borderRadius: '8px'
        });

        document.body.appendChild(notificationElement);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notificationElement.parentNode) {
                notificationElement.remove();
            }
        }, 5000);
    }
}

// Initialize application when DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize animation system if available
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 800,
            easing: 'ease-in-out',
            once: true
        });
    }

    window.dopplerEffectAnalyzer = new DopplerEffectAnalyzer();
    console.log('Vehicle Doppler Effect Analyzer initialized - Professional Version');
});

// Handle page visibility changes for audio management
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        const audioElements = document.querySelectorAll('audio');
        audioElements.forEach(audio => {
            if (!audio.paused) {
                audio.pause();
            }
        });
    }
});