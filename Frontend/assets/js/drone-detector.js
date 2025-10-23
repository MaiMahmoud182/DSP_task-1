// assets/js/drone-detector.js - Drone Detection Analyzer
class DroneDetectionAnalyzer {
    constructor() {
        this.currentAudioFile = null;
        this.uploadedAudioUrl = null;
        this.resampledAudioData = null;
        this.analysisResults = null;
        this.apiBaseUrl = 'http://localhost:5000';
        this.initializeEventHandlers();
        this.initializeControlElements();
        
        // Test connection on startup
        setTimeout(() => {
            this.testBackendConnection();
        }, 1000);
    }

    initializeEventHandlers() {
        // Audio analysis controls
        document.getElementById('audioFile').addEventListener('change', (event) => this.handleAudioFileUpload(event));
        document.getElementById('analyzeBtn').addEventListener('click', () => this.analyzeDroneAudio());
        document.getElementById('playUploadedBtn').addEventListener('click', () => this.playUploadedAudio());
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadResampledAudio());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetAnalysisSession());

        // Sampling rate control
        document.getElementById('analysisSamplingRate').addEventListener('input', (event) => this.updateAnalysisSamplingRateDisplay(event));
    }

    initializeControlElements() {
        this.updateAnalysisSamplingRateDisplay({ target: document.getElementById('analysisSamplingRate') });
    }

    async testBackendConnection() {
        try {
            console.log('Testing backend connection...');
            const response = await fetch(`${this.apiBaseUrl}/api/health`);
            if (response.ok) {
                const health = await response.json();
                console.log('Backend health:', health);
                this.showUserNotification('✅ Backend connected successfully', 'success');
                return true;
            } else {
                this.showUserNotification('❌ Backend is not responding properly', 'error');
                return false;
            }
        } catch (error) {
            console.error('Backend connection test failed:', error);
            this.showUserNotification('❌ Cannot connect to backend server. Make sure it\'s running on http://localhost:5000', 'error');
            return false;
        }
    }

    updateAnalysisSamplingRateDisplay(event) {
        const samplingRate = parseInt(event.target.value);
        document.getElementById('analysisSamplingRateValue').textContent = `${samplingRate} Hz`;
        
        const nyquistStatus = document.getElementById('analysisNyquistStatus');
        const nyquistFrequency = samplingRate / 2;
        
        // Drone audio typically has frequencies up to 2000 Hz
        const droneMaxFreq = 2000;
        
        if (samplingRate >= 2 * droneMaxFreq) {
            nyquistStatus.textContent = `✅ Perfect: ${samplingRate}Hz ≥ 4kHz Nyquist`;
            nyquistStatus.className = 'badge bg-success';
        } else if (samplingRate >= 8000) {
            nyquistStatus.textContent = `✅ Good: ${samplingRate}Hz sampling`;
            nyquistStatus.className = 'badge bg-success';
        } else if (samplingRate >= 4000) {
            nyquistStatus.textContent = `⚠️ Fair: ${samplingRate}Hz sampling`;
            nyquistStatus.className = 'badge bg-warning';
        } else if (samplingRate >= 2000) {
            nyquistStatus.textContent = `⚠️ Poor: ${samplingRate}Hz (drone frequencies may alias)`;
            nyquistStatus.className = 'badge bg-warning';
        } else if (samplingRate >= 1000) {
            nyquistStatus.textContent = `❌ High Aliasing Risk: ${samplingRate}Hz`;
            nyquistStatus.className = 'badge bg-danger';
        } else {
            nyquistStatus.textContent = `❌ Extreme Aliasing: ${samplingRate}Hz`;
            nyquistStatus.className = 'badge bg-danger';
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
            
            this.showUserNotification('✅ Drone audio file uploaded successfully!', 'success');
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

    async analyzeDroneAudio() {
        if (!this.currentAudioFile) return;

        this.showProcessingIndicator(true);
        this.setAnalysisControlsState(true);

        const formData = new FormData();
        formData.append('file', this.currentAudioFile);
        
        const analysisSamplingRate = document.getElementById('analysisSamplingRate').value;
        formData.append('target_sampling_rate', analysisSamplingRate);

        try {
            console.log('Sending drone analysis request...');
            
            const apiResponse = await fetch(`${this.apiBaseUrl}/api/drone/resample-audio`, {
                method: 'POST',
                body: formData
            });

            console.log('Response status:', apiResponse.status);

            if (!apiResponse.ok) {
                throw new Error(`Server error: ${apiResponse.status}`);
            }

            const responseData = await apiResponse.json();

            if (responseData.success) {
                this.analysisResults = responseData;
                
                // Pre-load resampled audio for playback
                this.resampledAudioData = responseData.audio_data;
                
                // Display waveform visualization
                if (responseData.waveform_data) {
                    this.displayAnalyzedWaveform(responseData.waveform_data, responseData.sampling_info);
                }
                
                this.displayAnalysisResults(responseData.sampling_info);
                
                // Perform drone detection
                await this.performDroneDetection();
                
                this.showUserNotification('✅ Drone analysis completed!', 'success');
            } else {
                this.showUserNotification('❌ Analysis failed: ' + (responseData.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Analysis error:', error);
            
            if (error.message.includes('Failed to fetch')) {
                this.showUserNotification('❌ Cannot connect to server. Make sure backend is running on http://localhost:5000', 'error');
            } else {
                this.showUserNotification('❌ ' + error.message, 'error');
            }
        } finally {
            this.showProcessingIndicator(false);
            this.setAnalysisControlsState(false);
        }
    }

    async performDroneDetection() {
        if (!this.currentAudioFile) return;

        try {
            const formData = new FormData();
            formData.append('file', this.currentAudioFile);

            const apiResponse = await fetch(`${this.apiBaseUrl}/api/drone/detect`, {
                method: 'POST',
                body: formData
            });

            if (!apiResponse.ok) {
                throw new Error(`Detection server error: ${apiResponse.status}`);
            }

            const responseData = await apiResponse.json();

            if (responseData.success) {
                this.displayDetectionResults(responseData);
            } else {
                this.showUserNotification('❌ Drone detection failed: ' + (responseData.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Detection error:', error);
            this.showUserNotification('❌ Drone detection error: ' + error.message, 'error');
        }
    }

    displayAnalyzedWaveform(waveformData, samplingInfo = null) {
        try {
            const hasAliasing = waveformData.is_aliasing;
            const waveformColor = hasAliasing ? '#dc3545' : '#28a745';
            const waveformName = hasAliasing ? 'Aliased Drone Audio' : 'Drone Audio';
            
            const waveformTrace = {
                x: waveformData.time,
                y: waveformData.amplitude,
                type: 'scatter',
                mode: 'lines',
                line: { 
                    color: waveformColor, 
                    width: 1.5,
                    shape: 'spline'
                },
                name: waveformName,
                hovertemplate: 'Time: %{x:.2f}s<br>Amplitude: %{y:.3f}<extra></extra>'
            };

            let titleText = 'Drone Audio Waveform';
            if (hasAliasing && samplingInfo) {
                const nyquist = samplingInfo.nyquist_frequency;
                titleText = `ALIASING DETECTED: Nyquist limit ${nyquist.toFixed(0)}Hz`;
            }

            const plotLayout = {
                title: {
                    text: titleText,
                    font: { 
                        size: 16, 
                        color: hasAliasing ? '#dc3545' : '#333' 
                    }
                },
                xaxis: { 
                    title: 'Time (s)', 
                    gridcolor: '#f0f0f0',
                    showgrid: true,
                    tickformat: '.1f'
                },
                yaxis: { 
                    title: 'Amplitude', 
                    gridcolor: '#f0f0f0',
                    showgrid: true,
                    range: [-1, 1]
                },
                plot_bgcolor: 'rgba(0,0,0,0)',
                paper_bgcolor: 'rgba(0,0,0,0)',
                margin: { t: 50, r: 30, b: 50, l: 60 },
                showlegend: false
            };

            const plotConfig = {
                responsive: true,
                displayModeBar: true,
                displaylogo: false
            };

            const container = document.getElementById('uploadedWaveform');
            container.innerHTML = '';
            Plotly.newPlot('uploadedWaveform', [waveformTrace], plotLayout, plotConfig);
        } catch (error) {
            console.error('Waveform display error:', error);
            this.showUserNotification('❌ Error displaying waveform', 'error');
        }
    }

    displayAnalysisResults(samplingInfo) {
        // Update stats
        document.getElementById('analysisSampling').textContent = `${samplingInfo.analysis_sample_rate || 0} Hz`;
        document.getElementById('nyquistFrequency').textContent = samplingInfo.nyquist_frequency ? 
            `${samplingInfo.nyquist_frequency.toFixed(0)} Hz` : '-- Hz';
        document.getElementById('duration').textContent = '-- s'; // You can calculate this from waveform data

        const resultContainer = document.getElementById('analysisResult');
        const isAliasingRisk = samplingInfo.has_aliasing;

        resultContainer.innerHTML = `
            <div class="classification-result ${isAliasingRisk ? 'sampling-warning' : 'sampling-safe'}">
                <div class="row align-items-center">
                    <div class="col-md-8">
                        <h4>🚁 Drone Audio Analysis</h4>
                        <div class="row mt-3">
                            <div class="col-6">
                                <p class="mb-2"><strong>Analysis Sampling Rate:</strong></p>
                                <p class="mb-2"><strong>Nyquist Frequency:</strong></p>
                                <p class="mb-2"><strong>Resampled:</strong></p>
                                <p class="mb-2"><strong>Aliasing Status:</strong></p>
                            </div>
                            <div class="col-6">
                                <p class="mb-2"><strong>${samplingInfo.analysis_sample_rate || 0} Hz</strong></p>
                                <p class="mb-2"><strong class="${isAliasingRisk ? 'text-danger' : 'text-success'}">${samplingInfo.nyquist_frequency ? samplingInfo.nyquist_frequency.toFixed(0) : '--'} Hz</strong></p>
                                <p class="mb-2"><strong>${samplingInfo.was_resampled ? 'Yes' : 'No'}</strong></p>
                                <p class="mb-2"><strong class="${isAliasingRisk ? 'text-danger' : 'text-success'}">${isAliasingRisk ? 'ALIASING DETECTED' : 'No Aliasing'}</strong></p>
                            </div>
                        </div>
                        ${isAliasingRisk ? `
                        <div class="alert alert-danger mt-2">
                            <i class="bi bi-exclamation-triangle"></i>
                            <strong>Aliasing Detected:</strong> Sampling rate (${samplingInfo.analysis_sample_rate}Hz) may affect drone detection accuracy
                        </div>
                        ` : `
                        <div class="alert alert-success mt-2">
                            <i class="bi bi-check-circle"></i>
                            <strong>No Aliasing:</strong> Sampling rate sufficient for drone audio frequencies
                        </div>
                        `}
                    </div>
                    <div class="col-md-4 text-center">
                        <div class="display-4 ${isAliasingRisk ? 'text-danger' : 'text-success'}">
                            ${isAliasingRisk ? '⚠️' : '✅'}
                        </div>
                        <small class="text-muted">${isAliasingRisk ? 'Aliasing Detected' : 'No Aliasing'}</small>
                    </div>
                </div>
            </div>
        `;
    }

    displayDetectionResults(detectionData) {
        const resultsSection = document.getElementById('detectionResults');
        const topPrediction = detectionData.top_prediction;
        const isDrone = detectionData.is_drone;
        
        let resultHtml = `
            <div class="row mt-4">
                <div class="col-12">
                    <div class="card result-card ${isDrone ? 'drone-detected' : 'noise-detected'}">
                        <div class="card-body">
                            <h4 class="card-title">
                                <i class="bi ${isDrone ? 'bi-drone' : 'bi-volume-mute'} me-2"></i>
                                ${isDrone ? 'DRONE DETECTED' : 'NO DRONE DETECTED'}
                            </h4>
                            <div class="row mt-4">
                                <div class="col-md-6">
                                    <h5>Detection Result</h5>
                                    <div class="d-flex align-items-center mb-3">
                                        <span class="badge ${isDrone ? 'bg-success' : 'bg-secondary'} me-2">
                                            ${isDrone ? 'DRONE' : 'NO DRONE'}
                                        </span>
                                        <span class="fw-bold">${topPrediction.confidence_percentage}% Confidence</span>
                                    </div>
                                    <div class="confidence-bar">
                                        <div class="confidence-fill ${isDrone ? 'bg-success' : 'bg-secondary'}" 
                                             style="width: ${topPrediction.confidence_percentage}%"></div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <h5>All Predictions</h5>
        `;

        // Add all predictions
        detectionData.predictions.forEach((pred, index) => {
            resultHtml += `
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="text-capitalize">${pred.label.replace('_', ' ')}</span>
                    <span class="fw-bold">${pred.confidence_percentage}%</span>
                </div>
            `;
        });

        resultHtml += `
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        resultsSection.innerHTML = resultHtml;
        resultsSection.style.display = 'block';
    }

    playUploadedAudio() {
        const audioElement = document.getElementById('uploadedAudio');
        
        if (this.currentAudioFile) {
            audioElement.pause();
            audioElement.currentTime = 0;
            
            if (this.resampledAudioData) {
                // Use the pre-loaded resampled audio (browser-compatible)
                audioElement.src = this.resampledAudioData;
                
                const analysisSamplingRate = document.getElementById('analysisSamplingRate').value;
                if (analysisSamplingRate < 8000) {
                    this.showUserNotification('🔊 Playing upsampled drone audio (aliasing preserved)...', 'info');
                } else {
                    this.showUserNotification('🔊 Playing drone audio...', 'info');
                }
            } else {
                // Fallback to original audio
                if (!this.uploadedAudioUrl) {
                    this.uploadedAudioUrl = URL.createObjectURL(this.currentAudioFile);
                }
                audioElement.src = this.uploadedAudioUrl;
                this.showUserNotification('🔊 Playing original drone audio...', 'info');
            }
            
            audioElement.style.display = 'block';
            
            audioElement.play().catch(() => {
                audioElement.style.display = 'block';
            });
        }
    }

    async downloadResampledAudio() {
        if (!this.currentAudioFile) return;

        const formData = new FormData();
        formData.append('file', this.currentAudioFile);
        
        const analysisSamplingRate = document.getElementById('analysisSamplingRate').value;
        formData.append('target_sampling_rate', analysisSamplingRate);
        formData.append('mode', 'download'); // Exact sampling rate for download

        try {
            const apiResponse = await fetch(`${this.apiBaseUrl}/api/drone/resample-audio`, {
                method: 'POST',
                body: formData
            });

            if (!apiResponse.ok) {
                throw new Error('Failed to get downloadable audio');
            }

            const responseData = await apiResponse.json();
            
            if (responseData.success) {
                const downloadLink = document.createElement('a');
                downloadLink.href = responseData.audio_data;
                downloadLink.download = `drone_audio_${analysisSamplingRate}Hz.wav`;
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                
                this.showUserNotification('💾 Drone audio downloaded with selected sampling rate!', 'success');
            } else {
                throw new Error(responseData.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Download error:', error);
            this.showUserNotification('❌ Download failed: ' + error.message, 'error');
        }
    }

    resetAnalysisSession() {
        document.getElementById('audioFile').value = '';
        document.getElementById('analyzeBtn').disabled = true;
        document.getElementById('playUploadedBtn').disabled = true;
        document.getElementById('downloadBtn').disabled = true;
        document.getElementById('analysisResult').innerHTML = '<p class="text-muted">Upload a drone audio file and click "Analyze Audio" to see results</p>';
        document.getElementById('uploadedWaveform').innerHTML = '';
        document.getElementById('uploadedAudio').src = '';
        document.getElementById('uploadedAudio').style.display = 'none';
        document.getElementById('detectionResults').innerHTML = '';
        document.getElementById('detectionResults').style.display = 'none';
        
        document.getElementById('analysisSamplingRate').value = 8000;
        this.updateAnalysisSamplingRateDisplay({ target: document.getElementById('analysisSamplingRate') });
        
        document.getElementById('analysisSampling').textContent = '-- Hz';
        document.getElementById('nyquistFrequency').textContent = '-- Hz';
        document.getElementById('duration').textContent = '-- s';
        
        if (this.uploadedAudioUrl) {
            URL.revokeObjectURL(this.uploadedAudioUrl);
            this.uploadedAudioUrl = null;
        }
        
        this.resampledAudioData = null;
        this.currentAudioFile = null;
        this.analysisResults = null;
        
        this.showUserNotification('🔄 Analysis session reset', 'info');
    }

    setAnalysisControlsState(disabled) {
        document.getElementById('analyzeBtn').disabled = disabled;
        document.getElementById('playUploadedBtn').disabled = disabled;
        document.getElementById('downloadBtn').disabled = disabled || this.resampledAudioData === null;
    }

    showProcessingIndicator(show) {
        document.getElementById('loading').style.display = show ? 'block' : 'none';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const kilobyte = 1024;
        const sizeUnits = ['Bytes', 'KB', 'MB', 'GB'];
        const unitIndex = Math.floor(Math.log(bytes) / Math.log(kilobyte));
        return parseFloat((bytes / Math.pow(kilobyte, unitIndex)).toFixed(2)) + ' ' + sizeUnits[unitIndex];
    }

    showUserNotification(message, type = 'info') {
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
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            borderRadius: '8px'
        });

        document.body.appendChild(notificationElement);

        setTimeout(() => {
            if (notificationElement.parentNode) {
                notificationElement.remove();
            }
        }, 5000);
    }
}

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    window.droneDetectionAnalyzer = new DroneDetectionAnalyzer();
    console.log('Drone Detection Analyzer initialized');
});