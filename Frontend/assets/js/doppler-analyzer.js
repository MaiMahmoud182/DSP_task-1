// assets/js/doppler-analyzer.js - Professional Vehicle Doppler Effect Analyzer
class DopplerEffectAnalyzer {
    constructor() {
        this.currentAudioFile = null;
        this.generatedAudioData = null;
        this.uploadedAudioUrl = null;
        this.analysisResults = null;
        this.resampledAudioData = null; // NEW: Store resampled audio for analysis playback
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
        document.getElementById('baseFreq').addEventListener('input', (event) => {
            this.updateParameterDisplay('baseFreqValue', 'Hz', event);
            this.updateSamplingRateBasedOnFrequency();
        });
        document.getElementById('velocity').addEventListener('input', (event) => this.updateParameterDisplay('velocityValue', 'km/h', event));
        
        // NEW: Nyquist sampling rate controls
        document.getElementById('samplingRate').addEventListener('input', (event) => this.updateSamplingRateDisplay(event));
        document.getElementById('analysisSamplingRate').addEventListener('input', (event) => this.updateAnalysisSamplingRateDisplay(event));
        
        // Audio element event listeners for better user experience
        document.getElementById('generatedAudio').addEventListener('play', () => {
            this.showUserNotification('🔊 Playing generated sound...', 'info');
        });
    }

    initializeControlElements() {
        this.updateParameterDisplay('baseFreqValue', 'Hz', { target: document.getElementById('baseFreq') });
        this.updateParameterDisplay('velocityValue', 'km/h', { target: document.getElementById('velocity') });
        this.updateSamplingRateBasedOnFrequency();
        this.updateAnalysisSamplingRateDisplay({ target: document.getElementById('analysisSamplingRate') });
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

    // NEW: Update sampling rate based on frequency for Nyquist demonstration
    updateSamplingRateBasedOnFrequency() {
        const baseFrequency = parseInt(document.getElementById('baseFreq').value);
        
        // Calculate realistic sampling rates based on maximum expected frequency
        const highestHarmonic = baseFrequency * 6; // 6th harmonic for engine sound
        const absoluteMaxFreq = Math.min(1000, highestHarmonic); // Cap at 1000Hz
        
        const nyquistMinimum = Math.ceil(absoluteMaxFreq * 2 / 100) * 100; // 2×fmax
        const safeSamplingRate = Math.ceil(absoluteMaxFreq * 2.5 / 100) * 100; // 2.5×fmax (safety margin)
        const maxSamplingRate = 4000; // Realistic maximum
        
        // Extended range from 50 to 4000 Hz with step 100
        const samplingRateSlider = document.getElementById('samplingRate');
        samplingRateSlider.min = 50; // Lowered from 500 to 50 for extreme aliasing demonstration
        samplingRateSlider.max = maxSamplingRate;
        samplingRateSlider.value = safeSamplingRate;
        samplingRateSlider.step = 100;
        
        // Update display
        this.updateSamplingRateDisplay({ target: samplingRateSlider });
    }

    // NEW: Update sampling rate display with Nyquist status
    updateSamplingRateDisplay(event) {
        const samplingRate = parseInt(event.target.value);
        document.getElementById('samplingRateValue').textContent = `${samplingRate} Hz`;
        
        // Get current base frequency for Nyquist calculation
        const baseFrequency = parseInt(document.getElementById('baseFreq').value);
        const highestHarmonic = baseFrequency * 6;
        const absoluteMaxFreq = Math.min(1000, highestHarmonic);
        const nyquistFrequency = samplingRate / 2;
        
        const nyquistStatus = document.getElementById('nyquistStatus');
        
        // Enhanced status messages for wider range
        if (samplingRate >= 2 * absoluteMaxFreq) {
            nyquistStatus.textContent = `✅ Perfect: ${samplingRate}Hz ≥ 2×${absoluteMaxFreq}Hz`;
            nyquistStatus.className = 'badge bg-success';
        } else if (samplingRate >= 2 * baseFrequency) {
            nyquistStatus.textContent = `⚠️ Partial Aliasing: ${samplingRate}Hz < 2×${absoluteMaxFreq}Hz (harmonics will alias)`;
            nyquistStatus.className = 'badge bg-warning';
        } else if (samplingRate >= baseFrequency) {
            nyquistStatus.textContent = `❌ Severe Aliasing: ${samplingRate}Hz < 2×${baseFrequency}Hz`;
            nyquistStatus.className = 'badge bg-danger';
        } else {
            nyquistStatus.textContent = `❌ Extreme Aliasing: ${samplingRate}Hz < ${baseFrequency}Hz`;
            nyquistStatus.className = 'badge bg-danger';
        }
    }

    // NEW: Update analysis sampling rate display with extended range
    updateAnalysisSamplingRateDisplay(event) {
        const samplingRate = parseInt(event.target.value);
        document.getElementById('analysisSamplingRateValue').textContent = `${samplingRate} Hz`;
        
        // Update Nyquist status for analysis
        const nyquistStatus = document.getElementById('analysisNyquistStatus');
        const nyquistFrequency = samplingRate / 2;
        
        // Typical vehicle frequencies are 80-1000Hz
        const typicalVehicleMaxFreq = 1000;
        
        if (samplingRate >= 2 * typicalVehicleMaxFreq) {
            nyquistStatus.textContent = `✅ Perfect: ${samplingRate}Hz ≥ 2kHz Nyquist`;
            nyquistStatus.className = 'badge bg-success';
        } else if (samplingRate >= 8000) {
            nyquistStatus.textContent = `✅ Good: ${samplingRate}Hz sampling`;
            nyquistStatus.className = 'badge bg-success';
        } else if (samplingRate >= 4000) {
            nyquistStatus.textContent = `⚠️ Fair: ${samplingRate}Hz sampling`;
            nyquistStatus.className = 'badge bg-warning';
        } else if (samplingRate >= 2000) {
            nyquistStatus.textContent = `⚠️ Poor: ${samplingRate}Hz (risk of aliasing)`;
            nyquistStatus.className = 'badge bg-warning';
        } else if (samplingRate >= 1000) {
            nyquistStatus.textContent = `❌ High Aliasing Risk: ${samplingRate}Hz`;
            nyquistStatus.className = 'badge bg-danger';
        } else if (samplingRate >= 500) {
            nyquistStatus.textContent = `❌ Severe Aliasing: ${samplingRate}Hz`;
            nyquistStatus.className = 'badge bg-danger';
        } else {
            nyquistStatus.textContent = `❌ Extreme Aliasing: ${samplingRate}Hz`;
            nyquistStatus.className = 'badge bg-danger';
        }
    }

    async generateDopplerSound() {
        const baseFrequency = document.getElementById('baseFreq').value;
        const vehicleVelocity = document.getElementById('velocity').value;
        const soundDuration = document.getElementById('duration').value;
        const samplingRate = document.getElementById('samplingRate').value; // NEW: Get sampling rate

        // Reset audio element before generating new sound
        const audioElement = document.getElementById('generatedAudio');
        audioElement.src = '';
        audioElement.style.display = 'none';

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
                    duration: parseInt(soundDuration),
                    sampling_rate: parseInt(samplingRate) // NEW: Send sampling rate
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
                this.displayGeneratedWaveform(responseData.waveform_visualization, responseData.generation_parameters);
                this.generatedAudioData = responseData.audio_data;
                this.setGenerationControlsState(false);
                
                // Enhanced message with sampling rate info
                const message = `🚗 Doppler sound generated at ${responseData.generation_parameters.sampling_rate}Hz`;
                this.showUserNotification(message, 'success');
                
                // Auto-play generated sound
                setTimeout(() => this.playGeneratedSound(), 1000);
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

    // UPDATED: Enhanced waveform display with aliasing visualization
    displayGeneratedWaveform(waveformData, generationParameters) {
        try {
            const waveformTrace = {
                x: waveformData.time,
                y: waveformData.amplitude,
                type: 'scatter',
                mode: 'lines',
                line: { 
                    color: generationParameters.is_aliasing ? '#dc3545' : '#007bff',
                    width: 1.5,
                    shape: 'spline'
                },
                name: generationParameters.is_aliasing ? 'Aliased Doppler Sound' : 'Doppler Sound Waveform',
                hovertemplate: 'Time: %{x:.2f}s<br>Amplitude: %{y:.3f}<extra></extra>'
            };

            // Enhanced title with aliasing info
            let titleText;
            if (generationParameters.is_aliasing) {
                titleText = `ALIASING: Car Sound at ${generationParameters.sampling_rate}Hz`;
            } else {
                titleText = `Clean Car Sound (${generationParameters.sampling_rate}Hz sampling)`;
            }

            const plotLayout = {
                title: {
                    text: titleText,
                    font: { size: 16, color: generationParameters.is_aliasing ? '#dc3545' : '#333' }
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
                showlegend: false,
                annotations: generationParameters.is_aliasing ? [{
                    x: 0.5,
                    y: 0.9,
                    xref: 'paper',
                    yref: 'paper',
                    text: `ALIASING: ${generationParameters.base_frequency}Hz > Nyquist (${generationParameters.nyquist_frequency}Hz)`,
                    showarrow: false,
                    font: { size: 14, color: '#dc3545' },
                    bgcolor: 'rgba(255,255,255,0.8)',
                    bordercolor: '#dc3545',
                    borderwidth: 1,
                    borderpad: 4
                }] : []
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
            
            // Reset the audio element
            audioElement.pause();
            audioElement.currentTime = 0;
            
            // Set the source
            audioElement.src = this.generatedAudioData;
            audioElement.style.display = 'block';
            
            // Try to play with minimal error handling
            const playPromise = audioElement.play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    this.showUserNotification('🔊 Playing generated Doppler sound...', 'info');
                }).catch(playbackError => {
                    console.log('Audio playback requires user interaction');
                    // Simply show the controls, no error message
                    audioElement.style.display = 'block';
                });
            }
        } else {
            this.showUserNotification('❌ No audio data available. Please generate a sound first.', 'error');
        }
    }

    downloadGeneratedSound() {
        if (this.generatedAudioData) {
            const baseFrequency = document.getElementById('baseFreq').value;
            const vehicleVelocity = document.getElementById('velocity').value;
            const samplingRate = document.getElementById('samplingRate').value; // NEW: Include sampling rate
            
            const downloadLink = document.createElement('a');
            downloadLink.href = this.generatedAudioData;
            downloadLink.download = `doppler_${baseFrequency}Hz_${vehicleVelocity}kmh_${samplingRate}Hz.wav`; // UPDATED: Include sampling rate
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
        
        // NEW: Add sampling rate parameter with extended range
        const analysisSamplingRate = document.getElementById('analysisSamplingRate').value;
        formData.append('target_sampling_rate', analysisSamplingRate);

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
                
                // NEW: Pre-load resampled audio for immediate playback
                this.resampledAudioData = await this.getResampledAudioForPlayback();
                
                // Display waveform visualization if available
                if (responseData.analysis.waveform_data) {
                    this.displayAnalyzedWaveform(responseData.analysis.waveform_data, responseData.analysis);
                }
                
                this.displayAnalysisResults(responseData.analysis);
                await this.displaySpectrogramVisualization(responseData.analysis);
                
                // Enhanced notification
                const analysisSamplingRate = document.getElementById('analysisSamplingRate').value;
                let message = '✅ Vehicle sound analysis completed!';
                if (analysisSamplingRate < 8000) {
                    message += ' (Audio will be upsampled for browser playback)';
                }
                this.showUserNotification(message, 'success');
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

    // NEW: Method to get resampled audio for playback
    async getResampledAudioForPlayback() {
        if (!this.currentAudioFile) return null;

        const formData = new FormData();
        formData.append('audio_file', this.currentAudioFile);
        
        const analysisSamplingRate = document.getElementById('analysisSamplingRate').value;
        formData.append('target_sampling_rate', analysisSamplingRate);

        try {
            const apiResponse = await fetch(`${this.apiBaseUrl}/api/get-resampled-audio`, {
                method: 'POST',
                body: formData
            });

            if (!apiResponse.ok) {
                throw new Error('Failed to get resampled audio');
            }

            const responseData = await apiResponse.json();
            
            if (responseData.success) {
                return responseData.audio_data;
            } else {
                throw new Error(responseData.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Resampled audio generation error:', error);
            // Fallback to original audio if resampling fails
            return null;
        }
    }

    // UPDATED: Enhanced waveform display with aliasing detection
    displayAnalyzedWaveform(waveformData, analysis = null) {
        try {
            // Determine if aliasing is present
            const hasAliasing = waveformData.is_aliasing || 
                               (analysis && analysis.has_aliasing) ||
                               (analysis && analysis.sampling_info && analysis.source_frequency > analysis.sampling_info.nyquist_frequency);
            
            const waveformColor = hasAliasing ? '#dc3545' : '#28a745';
            const waveformName = hasAliasing ? 'Aliased Audio Waveform' : 'Analyzed Audio Waveform';
            
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

            // Enhanced title with aliasing info
            let titleText = 'Analyzed Audio Waveform';
            if (hasAliasing && analysis && analysis.sampling_info) {
                const nyquist = analysis.sampling_info.nyquist_frequency;
                const sourceFreq = analysis.source_frequency || waveformData.nyquist_frequency * 0.8;
                titleText = `ALIASING DETECTED: ${sourceFreq.toFixed(0)}Hz > Nyquist (${nyquist.toFixed(0)}Hz)`;
            } else if (hasAliasing && waveformData.nyquist_frequency) {
                titleText = `ALIASING DETECTED: Nyquist limit ${waveformData.nyquist_frequency.toFixed(0)}Hz`;
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
                showlegend: false,
                annotations: hasAliasing ? [{
                    x: 0.5,
                    y: 0.9,
                    xref: 'paper',
                    yref: 'paper',
                    text: `ALIASING DETECTED: Sampling rate too low`,
                    showarrow: false,
                    font: { size: 14, color: '#dc3545' },
                    bgcolor: 'rgba(255,255,255,0.8)',
                    bordercolor: '#dc3545',
                    borderwidth: 1,
                    borderpad: 4
                }] : []
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

    // UPDATED: Enhanced analysis results with aliasing detection
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
        
        // Enhanced aliasing detection
        const samplingInfo = analysis.sampling_info || {};
        const nyquistFrequency = samplingInfo.nyquist_frequency || 0;
        const analysisSampleRate = samplingInfo.analysis_sample_rate || 0;
        
        // Check for aliasing - if source frequency exceeds Nyquist
        const isAliasingRisk = analysis.has_aliasing || 
                              (analysis.source_frequency > nyquistFrequency && nyquistFrequency > 0);
        const isHarmonicAliasing = analysis.source_frequency * 3 > nyquistFrequency; // Check 3rd harmonic
        
        // Update waveform color based on aliasing
        if (analysis.waveform_data) {
            this.displayAnalyzedWaveform(analysis.waveform_data, analysis);
        }

        if (analysis.is_vehicle && analysis.estimated_speed > 0) {
            resultContainer.innerHTML = `
                <div class="classification-result vehicle ${isAliasingRisk ? 'sampling-warning' : 'sampling-safe'}">
                    <div class="row">
                        <div class="col-md-8">
                            <h4>🚗 Vehicle Sound Detected</h4>
                            <div class="row mt-3">
                                <div class="col-6">
                                    <p class="mb-2"><strong>Estimated Speed:</strong></p>
                                    <p class="mb-2"><strong>Source Frequency:</strong></p>
                                    <p class="mb-2"><strong>Analysis Sampling:</strong></p>
                                    <p class="mb-2"><strong>Nyquist Frequency:</strong></p>
                                    <p class="mb-2"><strong>Closest Point:</strong></p>
                                    <p class="mb-2"><strong>Analysis Confidence:</strong></p>
                                </div>
                                <div class="col-6">
                                    <p class="mb-2"><strong>${analysis.estimated_speed.toFixed(1)} km/h</strong></p>
                                    <p class="mb-2"><strong>${analysis.source_frequency.toFixed(1)} Hz</strong></p>
                                    <p class="mb-2"><strong>${analysisSampleRate} Hz</strong></p>
                                    <p class="mb-2"><strong class="${isAliasingRisk ? 'text-danger' : 'text-success'}">${nyquistFrequency.toFixed(0)} Hz</strong></p>
                                    <p class="mb-2"><strong>${analysis.closest_point_time.toFixed(1)} s</strong></p>
                                    <p class="mb-2"><span class="badge bg-${confidencePercentage > 70 ? 'success' : confidencePercentage > 40 ? 'warning' : 'danger'}">${confidencePercentage}%</span></p>
                                </div>
                            </div>
                            ${isAliasingRisk ? `
                            <div class="alert alert-danger mt-2">
                                <i class="bi bi-exclamation-triangle"></i>
                                <strong>Aliasing Detected:</strong> Source frequency (${analysis.source_frequency.toFixed(0)}Hz) exceeds Nyquist limit (${nyquistFrequency.toFixed(0)}Hz)
                            </div>
                            ` : ''}
                            ${isHarmonicAliasing && !isAliasingRisk ? `
                            <div class="alert alert-warning mt-2">
                                <i class="bi bi-exclamation-triangle"></i>
                                <strong>Harmonic Aliasing Possible:</strong> Higher harmonics may be affected by Nyquist limit
                            </div>
                            ` : ''}
                        </div>
                        <div class="col-md-4">
                            <div class="text-center">
                                <div class="display-4 text-primary">${analysis.estimated_speed.toFixed(0)}</div>
                                <small class="text-muted">km/h</small>
                                <div class="mt-2">
                                    <small class="text-muted">Approach: ${analysis.approach_frequency.toFixed(0)} Hz</small><br>
                                    <small class="text-muted">Recede: ${analysis.recede_frequency.toFixed(0)} Hz</small>
                                </div>
                                ${isAliasingRisk ? `
                                <div class="mt-2">
                                    <span class="badge bg-danger">ALIASING DETECTED</span>
                                </div>
                                ` : ''}
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

    // UPDATED: Enhanced spectrogram visualization with sampling rate synchronization
    async displaySpectrogramVisualization(analysis) {
        if (!this.currentAudioFile) return;

        const formData = new FormData();
        formData.append('audio_file', this.currentAudioFile);
        
        // UPDATED: Pass the analysis sampling rate to spectrogram generation
        const analysisSamplingRate = document.getElementById('analysisSamplingRate').value;
        formData.append('target_sampling_rate', analysisSamplingRate);

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
                
                // Add Nyquist line to spectrogram if available
                const nyquistFrequency = spectrogramData.nyquist_frequency;
                
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
                        text: `Spectrogram Analysis (SR: ${spectrogramData.sample_rate}Hz)`,
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
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    // Add Nyquist frequency annotation if available
                    shapes: nyquistFrequency ? [{
                        type: 'line',
                        x0: 0,
                        x1: Math.max(...spectrogramData.time),
                        y0: nyquistFrequency,
                        y1: nyquistFrequency,
                        line: {
                            color: 'red',
                            width: 2,
                            dash: 'dash'
                        }
                    }] : [],
                    annotations: nyquistFrequency ? [{
                        x: Math.max(...spectrogramData.time) * 0.95,
                        y: nyquistFrequency,
                        text: `Nyquist: ${nyquistFrequency.toFixed(0)}Hz`,
                        showarrow: false,
                        bgcolor: 'rgba(255,255,255,0.8)',
                        bordercolor: 'red',
                        borderwidth: 1,
                        borderpad: 4
                    }] : []
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

    async playUploadedAudio() {
        const audioElement = document.getElementById('uploadedAudio');
        
        if (this.currentAudioFile) {
            // Reset the audio element
            audioElement.pause();
            audioElement.currentTime = 0;
            
            if (this.resampledAudioData) {
                // Use the pre-loaded resampled audio
                audioElement.src = this.resampledAudioData;
                
                // Show appropriate notification based on sampling rate
                const analysisSamplingRate = document.getElementById('analysisSamplingRate').value;
                if (analysisSamplingRate < 8000) {
                    this.showUserNotification('🔊 Playing upsampled audio (browser-compatible)...', 'info');
                } else {
                    this.showUserNotification('🔊 Playing resampled audio...', 'info');
                }
            } else {
                // Fallback to original audio
                if (!this.uploadedAudioUrl) {
                    this.uploadedAudioUrl = URL.createObjectURL(this.currentAudioFile);
                }
                audioElement.src = this.uploadedAudioUrl;
                this.showUserNotification('🔊 Playing original audio...', 'info');
            }
            
            audioElement.style.display = 'block';
            
            // Try to play the audio
            const playPromise = audioElement.play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    // Playback started successfully
                }).catch(playbackError => {
                    console.log('Audio playback requires user interaction');
                    // Show the controls even if autoplay is blocked
                    audioElement.style.display = 'block';
                    this.showUserNotification('⚠️ Click the play button to hear the audio', 'warning');
                });
            }
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
        
        // UPDATED: Reset sampling rate slider to default
        document.getElementById('analysisSamplingRate').value = 44100;
        this.updateAnalysisSamplingRateDisplay({ target: document.getElementById('analysisSamplingRate') });
        
        document.getElementById('estimatedSpeed').textContent = '-- km/h';
        document.getElementById('sourceFreq').textContent = '-- Hz';
        document.getElementById('approachFreq').textContent = '-- Hz';
        document.getElementById('recedeFreq').textContent = '-- Hz';
        
        if (this.uploadedAudioUrl) {
            URL.revokeObjectURL(this.uploadedAudioUrl);
            this.uploadedAudioUrl = null;
        }
        
        // NEW: Clear resampled audio data
        this.resampledAudioData = null;
        
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