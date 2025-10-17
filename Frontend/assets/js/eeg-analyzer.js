// eeg-analyzer.js - Modified for Blueprint Structure
// Global variables
let eegData = null;
let channelNames = [];
let timePoints = [];
let animationInterval = null;
let currentTimeIdx = 0;
let isAnimating = false;
let selectedChannels = [];
let selectedWaveBand = 'all';
let samplingRate = 250; // Default sampling rate

// Animation control properties
let animationSpeed = 50; // ms between frames
let animationFrameCount = 0;
let maxFramesToRender = 1000; // Safety limit

// Polar Graph properties - SEPARATE FROM MAIN CHANNELS
let polarMode = 'dynamic'; // Changed default from 'fixed' to 'dynamic'
let selectedPolarChannels = []; // Separate selection for polar only
let polarColors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'];

// Recurrence Plot properties
let recurrenceChannelX = null;
let recurrenceChannelY = null;
let recurrenceChannel1 = null;
let recurrenceChannel2 = null;
let recurrenceThreshold = 0.1;
let recurrenceMode = 'scatter'; // 'scatter' or 'heatmap'
let recurrenceColormap = 'Viridis';

// Drag selection variables
let isDragging = false;
let dragStartPoint = { x: 0, y: 0 };
let dragEndPoint = { x: 0, y: 0 };
let selectedAreaChannel1 = null;
let selectedAreaChannel2 = null;

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // DOM elements with null checks
    const fileInput = document.getElementById('fileInput');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const filterBtn = document.getElementById('filterBtn');
    const classifyBtn = document.getElementById('classifyBtn');
    const resetBtn = document.getElementById('resetBtn');
    const visualizationMode = document.getElementById('visualizationMode');
    const timelineSlider = document.getElementById('timelineSlider');
    const currentTimeDisplay = document.getElementById('currentTime');
    const totalTimeDisplay = document.getElementById('totalTime');
    const progressBar = document.getElementById('progressBar');
    const timelineControl = document.getElementById('timelineControl');
    const loading = document.getElementById('loading');
    
    // Initialize wave filter buttons
    document.querySelectorAll('.wave-filter').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('.wave-filter').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            selectedWaveBand = this.dataset.wave;
            if (eegData) updateVisualizations();
        });
    });
    
    // File input change handler
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            if (this.files.length > 0) {
                if (analyzeBtn) analyzeBtn.disabled = false;
                resetVisualization();
            }
        });
    }
    
    // Analyze button click handler - UPDATED FOR SERVER UPLOAD
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', function() {
            if (!fileInput || fileInput.files.length === 0) {
                alert('Please select a file first');
                return;
            }
            
            if (loading) loading.style.display = 'block';
            if (analyzeBtn) analyzeBtn.disabled = true;
            
            loadEEGData(fileInput.files[0])
                .then(() => {
                    if (timelineControl) timelineControl.style.display = 'block';
                    if (playPauseBtn) playPauseBtn.disabled = false;
                    if (classifyBtn) classifyBtn.disabled = false;
                    showMessage('EEG data loaded successfully!', 'success');
                })
                .catch(err => {
                    console.error('Error loading EEG data:', err);
                    showMessage('Failed to load EEG data: ' + err.message, 'error');
                })
                .finally(() => {
                    if (loading) loading.style.display = 'none';
                    if (analyzeBtn) analyzeBtn.disabled = false;
                });
        });
    }
    
    // Classify button click handler - NEW
    if (classifyBtn) {
        classifyBtn.addEventListener('click', function() {
            classifyEEG();
        });
    }
    
    // Set polar mode to dynamic by default in the UI
    const polarModeSelect = document.getElementById('polarMode');
    if (polarModeSelect) {
        polarModeSelect.value = 'dynamic';
    }
    
    // Add visualization mode change handler with controls toggle
    if (visualizationMode) {
        visualizationMode.addEventListener('change', function() {
            const mode = this.value;
            
            // Hide all control sections first
            const polarControls = document.getElementById('polarControlsSection');
            const recurrenceControls = document.getElementById('recurrenceControlsSection');
            
            if (polarControls) polarControls.style.display = 'none';
            if (recurrenceControls) recurrenceControls.style.display = 'none';
            
            // Show appropriate controls based on mode
            if (mode === 'polar' && polarControls) {
                polarControls.style.display = 'block';
            } else if (mode === 'recurrence' && recurrenceControls) {
                recurrenceControls.style.display = 'block';
                // Initialize drag selection for recurrence when switching to this mode
                setupRecurrenceDragSelection();
            }
            
            if (eegData) updateVisualizations();
        });
    }
    
    // Play/Pause button click handler
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', function() {
            if (!eegData) return;
            
            if (isAnimating) {
                stopAnimation();
                this.innerHTML = '<i class="bi bi-play-fill me-1"></i>Play Animation';
            } else {
                startAnimation();
                this.innerHTML = '<i class="bi bi-pause-fill me-1"></i>Pause Animation';
            }
        });
    }
    
    // Reset button click handler
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            resetVisualization();
            if (fileInput) fileInput.value = '';
            if (analyzeBtn) analyzeBtn.disabled = true;
            if (playPauseBtn) playPauseBtn.disabled = true;
            if (timelineControl) timelineControl.style.display = 'none';
        });
    }
    
    // Timeline slider input handler
    if (timelineSlider) {
        timelineSlider.addEventListener('input', function() {
            if (!eegData) return;
            
            const progress = parseFloat(this.value);
            currentTimeIdx = Math.floor((progress / 100) * (timePoints.length - 1));
            updateTimeDisplay();
            if (progressBar) progressBar.style.width = `${progress}%`;
            updateVisualizations(true);
        });
    }
});

// ============== UPDATED LOAD EEG DATA FUNCTION ==============
async function loadEEGData(file) {
    try {
        const formData = new FormData();
        formData.append('eeg_file', file);
        formData.append('sampling_rate', samplingRate.toString());

        const response = await fetch('http://localhost:5000/api/eeg/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const result = await response.json();
        console.log('EEG upload successful:', result);
        
        if (result.data) {
            eegData = result.data.channels;
            channelNames = result.data.channel_names;
            timePoints = result.data.time_data || [];
            
            // Set sampling rate from server response
            samplingRate = result.data.sampling_rate || 250;
            
            addModeControlSections();
            initializeChannelSelection();
            initializeVisualizations();
            updateStatistics();
            
            // Initialize polar channels with first two channels by default
            if (channelNames.length > 0) {
                selectedPolarChannels = channelNames.slice(0, Math.min(2, channelNames.length));
                recurrenceChannel1 = channelNames[0];
                recurrenceChannel2 = channelNames.length > 1 ? channelNames[1] : channelNames[0];
            }
            
            // Reset selected areas for recurrence plot
            selectedAreaChannel1 = null;
            selectedAreaChannel2 = null;
            
            return result;
        } else {
            throw new Error('Invalid server response format: missing data');
        }
    } catch (error) {
        console.error('EEG data loading error:', error);
        throw error;
    }
}

// ============== ADD MODE CONTROL SECTIONS ==============
function addModeControlSections() {
    // Add polar controls section if it doesn't exist
    if (!document.getElementById('polarControlsSection')) {
        const polarControlsHTML = `
            <div class="row mb-4" id="polarControlsSection" style="display: none;" data-aos="fade-up" data-aos-delay="150">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title mb-3">Polar Graph Settings</h5>
                            <div class="row g-3">
                                <div class="col-md-4">
                                    <label class="form-label">Mode</label>
                                    <select id="polarMode" class="form-select">
                                        <option value="fixed">Fixed Window</option>
                                        <option value="dynamic" selected>Dynamic</option>
                                    </select>
                                </div>
                                <div class="col-md-8">
                                    <label class="form-label">Select Channels for Polar Plot:</label>
                                    <div class="d-flex flex-wrap gap-2 mt-2" id="polarChannelsSelection">
                                        <!-- Will be populated dynamically -->
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Insert after brain wave mode selection
        const waveFilterSection = document.querySelector('.wave-filter')?.closest('.row');
        if (waveFilterSection) {
            waveFilterSection.insertAdjacentHTML('afterend', polarControlsHTML);
        }
        
        // Add event listener for polar mode
        const polarModeSelect = document.getElementById('polarMode');
        if (polarModeSelect) {
            polarModeSelect.addEventListener('change', function() {
                polarMode = this.value;
                if (eegData) {
                    const visualizationMode = document.getElementById('visualizationMode');
                    if (visualizationMode && visualizationMode.value === 'polar') {
                        updatePolarPlotMain();
                    }
                }
            });
        }
    }
    
    // Add recurrence controls section if it doesn't exist
    if (!document.getElementById('recurrenceControlsSection')) {
        const recurrenceControlsHTML = `
            <div class="row mb-4" id="recurrenceControlsSection" style="display: none;" data-aos="fade-up" data-aos-delay="150">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title mb-3">Recurrence Plot Settings</h5>
                            <div class="row g-3">
                                <div class="col-md-3">
                                    <label class="form-label">Channel 1</label>
                                    <select id="recurrenceChannel1" class="form-select">
                                        <!-- Will be populated dynamically -->
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">Channel 2</label>
                                    <select id="recurrenceChannel2" class="form-select">
                                        <!-- Will be populated dynamically -->
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">Mode</label>
                                    <select id="recurrenceMode" class="form-select">
                                        <option value="scatter" selected>Scatter Plot</option>
                                        <option value="heatmap">Density Heatmap</option>
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">Colormap</label>
                                    <select id="recurrenceColormap" class="form-select">
                                        <option value="Viridis" selected>Viridis</option>
                                        <option value="Plasma">Plasma</option>
                                        <option value="Blues">Blues</option>
                                        <option value="Reds">Reds</option>
                                        <option value="YlOrRd">YlOrRd</option>
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">Update</label>
                                    <button id="updateRecurrenceBtn" class="btn btn-primary w-100">
                                        <i class="bi bi-arrow-clockwise"></i> Update
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Insert after polar controls
        const polarControlsSection = document.getElementById('polarControlsSection');
        if (polarControlsSection) {
            polarControlsSection.insertAdjacentHTML('afterend', recurrenceControlsHTML);
        } else {
            const waveFilterSection = document.querySelector('.wave-filter')?.closest('.row');
            if (waveFilterSection) {
                waveFilterSection.insertAdjacentHTML('afterend', recurrenceControlsHTML);
            }
        }
        
        // Add event listeners for recurrence controls
        setTimeout(() => {
            setupRecurrenceEventListeners();
        }, 100);
    }
}

// ============== INITIALIZE CHANNEL SELECTION ==============
function initializeChannelSelection() {
    // Remove any existing channel selection containers first
    const existingContainers = document.querySelectorAll('#channelSelectionContainer');
    existingContainers.forEach(container => container.remove());
    
    // Try to find a suitable parent container
    const mainContent = document.querySelector('.card-body') || 
                       document.querySelector('.container') || 
                       document.querySelector('main') ||
                       document.body;
    
    // Create the channel selection container
    const channelSelectionRow = document.createElement('div');
    channelSelectionRow.className = 'row mb-3';
    channelSelectionRow.id = 'channelSelectionContainer';
    
    // Add a title
    const titleCol = document.createElement('div');
    titleCol.className = 'col-12 mb-2';
    titleCol.innerHTML = '<h6>Select EEG Channels:</h6>';
    channelSelectionRow.appendChild(titleCol);
    
    // Add channel checkboxes
    channelNames.forEach((channel, index) => {
        const isChecked = selectedChannels.includes(channel);
        const col = document.createElement('div');
        col.className = 'col-md-2 col-4 mb-2';
        
        col.innerHTML = `
            <div class="form-check">
                <input class="form-check-input channel-checkbox" type="checkbox" id="channel${index}" 
                    data-channel="${channel}" ${isChecked ? 'checked' : ''}>
                <label class="form-check-label" for="channel${index}">${channel}</label>
            </div>
        `;
        
        channelSelectionRow.appendChild(col);
    });
    
    // Insert it at the beginning of the main content
    mainContent.insertBefore(channelSelectionRow, mainContent.firstChild);
    
    // Add event listeners to checkboxes
    document.querySelectorAll('.channel-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const channel = this.dataset.channel;
            
            if (this.checked) {
                if (!selectedChannels.includes(channel)) {
                    selectedChannels.push(channel);
                }
            } else {
                selectedChannels = selectedChannels.filter(ch => ch !== channel);
            }
            
            updateVisualizations();
        });
    });
    
    // Populate polar channels selection
    const polarChannelsSelection = document.getElementById('polarChannelsSelection');
    if (polarChannelsSelection) {
        polarChannelsSelection.innerHTML = '';
        
        channelNames.forEach((channel, index) => {
            const isChecked = selectedPolarChannels.includes(channel);
            const checkbox = document.createElement('div');
            checkbox.className = 'form-check form-check-inline';
            
            checkbox.innerHTML = `
                <input class="form-check-input polar-channel-checkbox" type="checkbox" id="polarChannel${index}" 
                    data-channel="${channel}" ${isChecked ? 'checked' : ''}>
                <label class="form-check-label" for="polarChannel${index}">${channel}</label>
            `;
            
            polarChannelsSelection.appendChild(checkbox);
        });
        
        // Add event listeners to polar checkboxes
        document.querySelectorAll('.polar-channel-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const channel = this.dataset.channel;
                
                if (this.checked) {
                    if (!selectedPolarChannels.includes(channel)) {
                        selectedPolarChannels.push(channel);
                    }
                } else {
                    selectedPolarChannels = selectedPolarChannels.filter(ch => ch !== channel);
                }
                
                const visualizationMode = document.getElementById('visualizationMode');
                if (visualizationMode && visualizationMode.value === 'polar') {
                    updatePolarPlotMain();
                }
                createPolarPlot(); // Update the small polar plot as well
            });
        });
    }
    
    // Populate recurrence channel dropdowns
    const recChannel1Select = document.getElementById('recurrenceChannel1');
    const recChannel2Select = document.getElementById('recurrenceChannel2');

    if (recChannel1Select && recChannel2Select) {
        recChannel1Select.innerHTML = '';
        recChannel2Select.innerHTML = '';
        
        channelNames.forEach(channel => {
            const option1 = document.createElement('option');
            option1.value = channel;
            option1.textContent = channel;
            recChannel1Select.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = channel;
            option2.textContent = channel;
            recChannel2Select.appendChild(option2);
        });
        
        // Set default selections
        recChannel1Select.value = recurrenceChannel1 || channelNames[0];
        recChannel2Select.value = recurrenceChannel2 || (channelNames.length > 1 ? channelNames[1] : channelNames[0]);
        
        recurrenceChannel1 = recChannel1Select.value;
        recurrenceChannel2 = recChannel2Select.value;
    }
}

// ============== INITIALIZE VISUALIZATIONS ==============
function initializeVisualizations() {
    updateVisualizations();
    createPolarPlot();
    createRecurrencePlot();
    
    // Setup controls for small recurrence plot
    setTimeout(() => {
        setupSmallRecurrencePlotControls();
    }, 100);
}

// ============== UPDATE VISUALIZATIONS ==============
function updateVisualizations(fromSlider = false) {
    const visualizationMode = document.getElementById('visualizationMode');
    const mode = visualizationMode ? visualizationMode.value : 'multichannel';
    const visualizationTitle = document.getElementById('visualizationTitle');
    
    // Update title if element exists
    if (visualizationTitle) {
        switch (mode) {
            case 'multichannel':
                visualizationTitle.textContent = 'Multi-Channel EEG Signal';
                break;
            case 'topographic':
                visualizationTitle.textContent = 'EEG Topographic Map';
                break;
            case 'polar':
                visualizationTitle.textContent = 'EEG Polar Analysis';
                break;
            case 'recurrence':
                visualizationTitle.textContent = 'EEG Recurrence Analysis';
                break;
            case 'spectrogram':
                visualizationTitle.textContent = 'EEG Spectrogram';
                break;
            default:
                visualizationTitle.textContent = 'Multi-Channel EEG Signal';
        }
    }
    
    switch (mode) {
        case 'multichannel':
            createMultichannelPlot(fromSlider);
            break;
        case 'topographic':
            createTopographicMap(fromSlider);
            break;
        case 'polar':
            updatePolarPlotMain(fromSlider);
            break;
        case 'recurrence':
            updateRecurrencePlotMain(fromSlider);
            break;
        case 'spectrogram':
            createSpectrogram(fromSlider);
            break;
        default:
            createMultichannelPlot(fromSlider);
    }
}

// ============== POLAR PLOT FUNCTIONS ==============
async function updatePolarPlotMain(fromSlider = false) {
    if (!eegData || !selectedPolarChannels.length) return;
    
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'block';
    
    try {
        // Get polar data from server
        const polarData = await fetchPolarData();
        
        if (!polarData) {
            console.error("Failed to get polar data");
            return;
        }
        
        const traces = [];
        
        // Create a trace for each selected channel
        selectedPolarChannels.forEach((channelName, idx) => {
            if (!polarData[channelName]) return;
            
            traces.push({
                type: 'scatterpolar',
                r: polarData[channelName].r,
                theta: polarData[channelName].theta,
                mode: 'lines',
                name: channelName,
                line: {
                    color: polarColors[idx % polarColors.length],
                    width: 1.5
                }
            });
        });
        
        const layout = {
            title: `EEG Polar Viewer - ${polarMode === 'fixed' ? 'Fixed Window' : 'Dynamic'} Mode`,
            polar: {
                radialaxis: { visible: false },
                angularaxis: { 
                    direction: "clockwise", 
                    rotation: 90,
                    tickmode: "array",
                    tickvals: [0, 45, 90, 135, 180, 225, 270, 315],
                    ticktext: ['0°', '45°', '90°', '135°', '180°', '225°', '270°', '315°']
                }
            },
            showlegend: true,
            height: 500,
            margin: { l: 40, r: 40, t: 60, b: 40 },
            template: "plotly_white"
        };
        
        Plotly.newPlot('mainChart', traces, layout);
    } catch (error) {
        console.error("Error updating polar plot:", error);
        showMessage('Error loading polar data: ' + error.message, 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

async function fetchPolarData() {
    if (!eegData) return null;
    
    try {
        const selectedChannelsParam = selectedPolarChannels.join(',');
        const url = `/api/eeg/get_polar_data/${polarMode}?channels=${selectedChannelsParam}&current_time=${currentTimeIdx / samplingRate}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json();
            console.error("Error fetching polar data:", errorData.error);
            return null;
        }
        
        return await response.json();
    } catch (error) {
        console.error("Failed to fetch polar data:", error);
        return null;
    }
}

// ============== RECURRENCE PLOT FUNCTIONS ==============
async function updateRecurrencePlotMain(fromSlider = false) {
    if (!eegData || !channelNames || channelNames.length === 0) {
        console.error("Cannot update recurrence plot: no data available");
        return;
    }
    
    // Get the selected channels from dropdowns
    const recChannel1Select = document.getElementById('recurrenceChannel1');
    const recChannel2Select = document.getElementById('recurrenceChannel2');
    
    const channel1Name = recChannel1Select ? recChannel1Select.value : (recurrenceChannel1 || channelNames[0]);
    const channel2Name = recChannel2Select ? recChannel2Select.value : (recurrenceChannel2 || (channelNames.length > 1 ? channelNames[1] : channelNames[0]));
    
    if (!channel1Name || !channel2Name) {
        console.error("No channels selected for recurrence plot");
        return;
    }
    
    // Find channel indices
    const channel1Idx = channelNames.indexOf(channel1Name);
    const channel2Idx = channelNames.indexOf(channel2Name);
    
    if (channel1Idx === -1 || channel2Idx === -1) {
        console.error("Selected channels not found in data:", channel1Name, channel2Name);
        return;
    }
    
    // Get channel data
    const channel1Data = eegData[channel1Idx];
    const channel2Data = eegData[channel2Idx];
    
    // Determine data range
    let startIdx = 0;
    let endIdx = Math.min(channel1Data.length, channel2Data.length);
    
    if (isAnimating && timePoints && currentTimeIdx > 0) {
        const windowSize = Math.min(2000, Math.floor(samplingRate * 8));
        startIdx = Math.max(0, currentTimeIdx - Math.floor(windowSize / 2));
        endIdx = Math.min(endIdx, startIdx + windowSize);
        
        if (endIdx >= Math.min(channel1Data.length, channel2Data.length)) {
            startIdx = Math.max(0, Math.min(channel1Data.length, channel2Data.length) - windowSize);
            endIdx = Math.min(channel1Data.length, channel2Data.length);
        }
    }
    
    // Sample data for performance
    const maxPoints = 500;
    const totalPoints = endIdx - startIdx;
    const step = Math.max(1, Math.floor(totalPoints / maxPoints));
    
    const xValues = [];
    const yValues = [];
    const timeValues = [];
    
    for (let i = startIdx; i < endIdx; i += step) {
        xValues.push(channel1Data[i]);
        yValues.push(channel2Data[i]);
        if (timePoints && timePoints[i] !== undefined) {
            timeValues.push(timePoints[i]);
        } else {
            timeValues.push(i / samplingRate);
        }
    }
    
    // Get visualization mode and settings
    const modeSelect = document.getElementById('recurrenceMode');
    const colormapSelect = document.getElementById('recurrenceColormap');
    
    const mode = modeSelect ? modeSelect.value : recurrenceMode;
    const colormap = colormapSelect ? colormapSelect.value : recurrenceColormap;
    
    let traces = [];
    
    if (mode === 'heatmap') {
        traces.push({
            x: xValues,
            y: yValues,
            type: 'histogram2d',
            colorscale: colormap,
            showscale: true,
            name: 'Density',
            hovertemplate: `${channel1Name}: %{x:.2f} μV<br>${channel2Name}: %{y:.2f} μV<br>Count: %{z}<extra></extra>`,
            nbinsx: 50,
            nbinsy: 50
        });
    } else {
        traces.push({
            x: xValues,
            y: yValues,
            type: 'scatter',
            mode: 'markers',
            name: 'Data Points',
            marker: {
                size: 4,
                color: timeValues,
                colorscale: colormap,
                showscale: true,
                colorbar: { 
                    title: 'Time (s)',
                    titleside: 'right',
                    len: 0.7
                },
                opacity: 0.6,
                line: {
                    color: 'white',
                    width: 0.5
                }
            },
            hovertemplate: `${channel1Name}: %{x:.2f} μV<br>${channel2Name}: %{y:.2f} μV<br>Time: %{marker.color:.2f}s<extra></extra>`
        });
    }
    
    // Add current point if animating
    if (isAnimating && currentTimeIdx < Math.min(channel1Data.length, channel2Data.length)) {
        const currentValue1 = channel1Data[currentTimeIdx];
        const currentValue2 = channel2Data[currentTimeIdx];
        const currentTime = timePoints && timePoints[currentTimeIdx] ? timePoints[currentTimeIdx] : currentTimeIdx / samplingRate;
        
        traces.push({
            x: [currentValue1],
            y: [currentValue2],
            type: 'scatter',
            mode: 'markers',
            name: 'Current Point',
            marker: {
                size: 15,
                color: 'red',
                symbol: 'x',
                line: { 
                    width: 3, 
                    color: 'darkred' 
                }
            },
            showlegend: false,
            hovertemplate: `<b>Current Point</b><br>${channel1Name}: %{x:.2f} μV<br>${channel2Name}: %{y:.2f} μV<br>Time: ${currentTime.toFixed(2)}s<extra></extra>`
        });
    }
    
    // Calculate statistics
    const correlation = calculateCorrelation(xValues, yValues);
    const mutualInfo = calculateMutualInformation(xValues, yValues);
    
    const layout = {
        title: {
            text: `Recurrence Analysis: ${channel1Name} vs ${channel2Name}<br>` +
                  `<sub style="font-size: 11px;">Correlation: ${correlation.toFixed(3)} | Mutual Info: ${mutualInfo.toFixed(3)} | Points: ${xValues.length}</sub>`,
            font: { size: 14 }
        },
        xaxis: { 
            title: `${channel1Name} Amplitude (μV)`,
            gridcolor: 'rgba(128, 128, 128, 0.2)',
            zeroline: true,
            zerolinecolor: 'rgba(0, 0, 0, 0.3)'
        },
        yaxis: { 
            title: `${channel2Name} Amplitude (μV)`,
            gridcolor: 'rgba(128, 128, 128, 0.2)',
            zeroline: true,
            zerolinecolor: 'rgba(0, 0, 0, 0.3)'
        },
        showlegend: mode === 'scatter' && isAnimating,
        height: 500,
        margin: { l: 70, r: 80, t: 80, b: 70 },
        plot_bgcolor: 'rgba(248, 249, 250, 0.8)',
        paper_bgcolor: 'white',
        hovermode: 'closest'
    };
    
    const config = {
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['pan2d', 'select2d', 'lasso2d', 'autoScale2d'],
        displaylogo: false
    };
    
    const mainChart = document.getElementById('mainChart');
    if (mainChart) {
        Plotly.newPlot('mainChart', traces, layout, config);
    }
}

// ============== CLASSIFICATION FUNCTION ==============
async function classifyEEG() {
    if (!eegData) {
        showMessage('Please load EEG data first', 'error');
        return;
    }
    
    const classifyBtn = document.getElementById('classifyBtn');
    const loading = document.getElementById('loading');
    
    if (classifyBtn) classifyBtn.disabled = true;
    if (loading) loading.style.display = 'block';
    
    try {
        const response = await fetch('/api/eeg/classify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Classification failed: ${response.status}`);
        }
        
        const result = await response.json();
        displayClassificationResults(result);
        showMessage('EEG analysis completed!', 'success');
        
    } catch (error) {
        console.error('Classification error:', error);
        showMessage('Error during analysis: ' + error.message, 'error');
    } finally {
        if (classifyBtn) classifyBtn.disabled = false;
        if (loading) loading.style.display = 'none';
    }
}

function displayClassificationResults(result) {
    let resultsContainer = document.getElementById('classificationResults');
    if (!resultsContainer) {
        resultsContainer = document.createElement('div');
        resultsContainer.id = 'classificationResults';
        resultsContainer.className = 'mt-4';
        
        const mainChart = document.getElementById('mainChart');
        if (mainChart) {
            mainChart.parentNode.insertBefore(resultsContainer, mainChart.nextSibling);
        }
    }
    
    let html = '<div class="card"><div class="card-body"><h5 class="card-title">EEG Analysis Results</h5>';
    
    if (result.classification) {
        const classification = result.classification;
        
        // Signal Quality
        html += `
            <div class="row mb-3">
                <div class="col-12">
                    <h6>Signal Quality</h6>
                    <div class="progress mb-2" style="height: 20px;">
                        <div class="progress-bar ${classification.signal_quality.score >= 80 ? 'bg-success' : classification.signal_quality.score >= 60 ? 'bg-warning' : 'bg-danger'}" 
                             style="width: ${classification.signal_quality.score}%">
                            ${classification.signal_quality.score}% - ${classification.signal_quality.assessment}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Band Powers
        if (classification.band_powers) {
            html += '<div class="row mb-3"><div class="col-12"><h6>Frequency Band Powers</h6><div class="table-responsive"><table class="table table-sm table-bordered"><thead><tr><th>Band</th>';
            
            // Table headers (channels)
            if (classification.channel_count > 0) {
                html += '<th>Average Power</th>';
            }
            html += '</tr></thead><tbody>';
            
            // Band power rows
            for (const [bandName, channelPowers] of Object.entries(classification.band_powers)) {
                html += `<tr><td><strong>${bandName}</strong></td>`;
                
                if (classification.channel_count > 0) {
                    const totalPower = Object.values(channelPowers).reduce((sum, power) => sum + power, 0);
                    const avgPower = totalPower / Object.keys(channelPowers).length;
                    html += `<td>${avgPower.toExponential(2)}</td>`;
                }
                
                html += '</tr>';
            }
            
            html += '</tbody></table></div></div></div>';
        }
        
        // Dominant Frequencies
        if (classification.dominant_frequencies) {
            html += '<div class="row mb-3"><div class="col-12"><h6>Dominant Frequencies</h6><div class="table-responsive"><table class="table table-sm table-bordered"><thead><tr><th>Channel</th><th>Dominant Freq (Hz)</th></tr></thead><tbody>';
            
            for (const [channel, freq] of Object.entries(classification.dominant_frequencies)) {
                html += `<tr><td>${channel}</td><td>${freq.toFixed(2)} Hz</td></tr>`;
            }
            
            html += '</tbody></table></div></div></div>';
        }
        
        // Insights
        if (classification.insights && classification.insights.length > 0) {
            html += '<div class="row"><div class="col-12"><h6>Key Insights</h6><ul class="list-group">';
            
            classification.insights.forEach(insight => {
                html += `<li class="list-group-item">${insight}</li>`;
            });
            
            html += '</ul></div></div>';
        }
        
        // Summary
        html += `
            <div class="row mt-3">
                <div class="col-12">
                    <div class="alert alert-info">
                        <strong>Analysis Summary:</strong><br>
                        • Channels: ${classification.channel_count}<br>
                        • Duration: ${classification.total_duration.toFixed(2)}s<br>
                        • Analysis Type: ${classification.analysis_type}
                    </div>
                </div>
            </div>
        `;
    } else {
        html += '<div class="alert alert-warning">No classification data available</div>';
    }
    
    html += '</div></div>';
    resultsContainer.innerHTML = html;
}

// ============== HELPER FUNCTIONS ==============
function calculateCorrelation(x, y) {
    if (!x || !y || x.length !== y.length || x.length === 0) return 0;
    
    const n = x.length;
    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;
    
    let numerator = 0;
    let denomX = 0;
    let denomY = 0;
    
    for (let i = 0; i < n; i++) {
        const dx = x[i] - meanX;
        const dy = y[i] - meanY;
        numerator += dx * dy;
        denomX += dx * dx;
        denomY += dy * dy;
    }
    
    const denominator = Math.sqrt(denomX * denomY);
    return denominator === 0 ? 0 : numerator / denominator;
}

function calculateMutualInformation(x, y) {
    if (!x || !y || x.length !== y.length || x.length === 0) return 0;
    
    const bins = 10;
    const minX = Math.min(...x);
    const maxX = Math.max(...x);
    const minY = Math.min(...y);
    const maxY = Math.max(...y);
    
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    
    if (rangeX === 0 || rangeY === 0) return 0;
    
    const binSizeX = rangeX / bins;
    const binSizeY = rangeY / bins;
    
    const jointHist = Array(bins).fill().map(() => Array(bins).fill(0));
    const marginalX = Array(bins).fill(0);
    const marginalY = Array(bins).fill(0);
    
    for (let i = 0; i < x.length; i++) {
        const binX = Math.min(bins - 1, Math.max(0, Math.floor((x[i] - minX) / binSizeX)));
        const binY = Math.min(bins - 1, Math.max(0, Math.floor((y[i] - minY) / binSizeY)));
        
        jointHist[binX][binY]++;
        marginalX[binX]++;
        marginalY[binY]++;
    }
    
    let mi = 0;
    const n = x.length;
    
    for (let i = 0; i < bins; i++) {
        for (let j = 0; j < bins; j++) {
            if (jointHist[i][j] > 0 && marginalX[i] > 0 && marginalY[j] > 0) {
                const pxy = jointHist[i][j] / n;
                const px = marginalX[i] / n;
                const py = marginalY[j] / n;
                
                if (pxy > 0 && px > 0 && py > 0) {
                    mi += pxy * Math.log2(pxy / (px * py));
                }
            }
        }
    }
    
    return Math.max(0, mi);
}

// ============== EVENT LISTENERS SETUP ==============
function setupRecurrenceEventListeners() {
    const recChannel1Select = document.getElementById('recurrenceChannel1');
    const recChannel2Select = document.getElementById('recurrenceChannel2');
    const recurrenceModeSelect = document.getElementById('recurrenceMode');
    const recurrenceColormapSelect = document.getElementById('recurrenceColormap');
    const updateRecurrenceBtn = document.getElementById('updateRecurrenceBtn');
    
    if (recChannel1Select) {
        recChannel1Select.addEventListener('change', function() {
            recurrenceChannel1 = this.value;
            const visualizationMode = document.getElementById('visualizationMode');
            if (eegData && visualizationMode && visualizationMode.value === 'recurrence') {
                updateRecurrencePlotMain();
            }
        });
    }
    
    if (recChannel2Select) {
        recChannel2Select.addEventListener('change', function() {
            recurrenceChannel2 = this.value;
            const visualizationMode = document.getElementById('visualizationMode');
            if (eegData && visualizationMode && visualizationMode.value === 'recurrence') {
                updateRecurrencePlotMain();
            }
        });
    }
    
    if (recurrenceModeSelect) {
        recurrenceModeSelect.addEventListener('change', function() {
            recurrenceMode = this.value;
            const visualizationMode = document.getElementById('visualizationMode');
            if (eegData && visualizationMode && visualizationMode.value === 'recurrence') {
                updateRecurrencePlotMain();
            }
        });
    }
    
    if (recurrenceColormapSelect) {
        recurrenceColormapSelect.addEventListener('change', function() {
            recurrenceColormap = this.value;
            const visualizationMode = document.getElementById('visualizationMode');
            if (eegData && visualizationMode && visualizationMode.value === 'recurrence') {
                updateRecurrencePlotMain();
            }
        });
    }
    
    if (updateRecurrenceBtn) {
        updateRecurrenceBtn.addEventListener('click', function() {
            if (eegData) {
                updateRecurrencePlotMain();
            }
        });
    }
}

// ============== BASIC VISUALIZATION FUNCTIONS ==============
function createMultichannelPlot(fromSlider = false) {
    if (!eegData || !selectedChannels.length) return;
    
    const traces = [];
    const spacing = 100;
    const windowSize = 10 * samplingRate;
    
    let startIdx, endIdx;
    
    if (fromSlider || isAnimating) {
        startIdx = Math.max(0, currentTimeIdx - windowSize/2);
        endIdx = Math.min(timePoints.length, currentTimeIdx + windowSize/2);
    } else {
        startIdx = 0;
        endIdx = Math.min(timePoints.length, windowSize);
    }
    
    const visibleTimePoints = timePoints.slice(startIdx, endIdx);
    
    selectedChannels.forEach((channelName, i) => {
        const channelIdx = channelNames.indexOf(channelName);
        if (channelIdx === -1) return;
        
        const channelData = eegData[channelIdx].slice(startIdx, endIdx);
        
        traces.push({
            x: visibleTimePoints,
            y: channelData.map(val => val + (spacing * i)),
            name: channelName,
            mode: 'lines',
            line: { width: 1 }
        });
    });
    
    const layout = {
        title: 'EEG Channels',
        xaxis: { title: 'Time (s)' },
        yaxis: { 
            showticklabels: false,
            zeroline: false
        },
        showlegend: true,
        legend: { orientation: 'h' },
        margin: { l: 40, r: 40, t: 40, b: 40 }
    };
    
    Plotly.newPlot('mainChart', traces, layout);
}

function createPolarPlot() {
    if (!eegData) return;
    
    const channelsToShow = selectedPolarChannels.slice(0, 3);
    const traces = [];
    
    channelsToShow.forEach((channelName, idx) => {
        const channelIdx = channelNames.indexOf(channelName);
        if (channelIdx === -1) return;
        
        const channelData = eegData[channelIdx];
        const step = Math.max(1, Math.floor(channelData.length / 100));
        const rValues = [];
        const thetaValues = [];
        
        for (let i = 0; i < channelData.length; i += step) {
            const value = channelData[i];
            const normalizedPos = i / channelData.length;
            const theta = normalizedPos * 360;
            const r = Math.abs(value);
            
            rValues.push(r);
            thetaValues.push(theta);
        }
        
        traces.push({
            type: 'scatterpolar',
            r: rValues,
            theta: thetaValues,
            mode: 'lines',
            name: channelName,
            line: {
                color: polarColors[idx % polarColors.length],
                width: 1.5
            }
        });
    });
    
    const layout = {
        title: {
            text: 'Polar Coordinate Analysis',
            font: { size: 12 }
        },
        polar: {
            radialaxis: { 
                visible: true,
                tickfont: { size: 8 }
            },
            angularaxis: { 
                direction: "clockwise", 
                rotation: 90,
                tickfont: { size: 8 }
            }
        },
        showlegend: true,
        legend: {
            font: { size: 8 },
            orientation: 'h'
        },
        height: 300,
        margin: { l: 20, r: 20, t: 40, b: 20 }
    };
    
    Plotly.newPlot('polarChart', traces, layout);
}

function createRecurrencePlot() {
    if (!eegData || !channelNames || channelNames.length === 0) return;
    
    const channelXSelect = document.getElementById('recurrenceChannelX');
    const channelYSelect = document.getElementById('recurrenceChannelY');
    
    const channel1Name = channelXSelect ? channelXSelect.value : (recurrenceChannelX || channelNames[0]);
    const channel2Name = channelYSelect ? channelYSelect.value : (recurrenceChannelY || (channelNames.length > 1 ? channelNames[1] : channelNames[0]));
    
    const channel1Idx = channelNames.indexOf(channel1Name);
    const channel2Idx = channelNames.indexOf(channel2Name);
    
    if (channel1Idx === -1 || channel2Idx === -1) return;
    
    const maxPoints = 200;
    const totalPoints = Math.min(eegData[channel1Idx].length, eegData[channel2Idx].length);
    const step = Math.max(1, Math.floor(totalPoints / maxPoints));
    
    const xValues = [];
    const yValues = [];
    
    for (let i = 0; i < totalPoints; i += step) {
        xValues.push(eegData[channel1Idx][i]);
        yValues.push(eegData[channel2Idx][i]);
    }
    
    const trace = {
        x: xValues,
        y: yValues,
        type: 'scatter',
        mode: 'markers',
        marker: {
            size: 3,
            color: '#1f77b4',
            opacity: 0.6
        },
        name: `${channel1Name} vs ${channel2Name}`,
        hovertemplate: `${channel1Name}: %{x:.2f}<br>${channel2Name}: %{y:.2f}<extra></extra>`
    };
    
    const layout = {
        title: {
            text: `${channel1Name} vs ${channel2Name}`,
            font: { size: 12 }
        },
        xaxis: { 
            title: { 
                text: `${channel1Name} (μV)`,
                font: { size: 10 }
            },
            gridcolor: 'rgba(128, 128, 128, 0.2)'
        },
        yaxis: { 
            title: { 
                text: `${channel2Name} (μV)`,
                font: { size: 10 }
            },
            gridcolor: 'rgba(128, 128, 128, 0.2)'
        },
        showlegend: false,
        height: 280,
        margin: { l: 50, r: 20, t: 40, b: 40 },
        plot_bgcolor: 'rgba(250, 250, 250, 1)'
    };
    
    const config = {
        displayModeBar: false,
        responsive: true
    };
    
    const recurrenceChart = document.getElementById('recurrenceChart');
    if (recurrenceChart) {
        Plotly.newPlot('recurrenceChart', [trace], layout, config);
    }
}

function createTopographicMap(fromSlider = false) {
    const layout = {
        title: 'EEG Topographic Map - Not Implemented',
        annotations: [{
            text: 'Topographic map requires electrode position data',
            showarrow: false,
            font: { size: 16 },
            xref: 'paper',
            yref: 'paper',
            x: 0.5,
            y: 0.5
        }]
    };
    
    Plotly.newPlot('mainChart', [], layout);
}

function createSpectrogram(fromSlider = false) {
    const layout = {
        title: 'EEG Spectrogram - Not Implemented',
        annotations: [{
            text: 'Spectrogram requires FFT implementation',
            showarrow: false,
            font: { size: 16 },
            xref: 'paper',
            yref: 'paper',
            x: 0.5,
            y: 0.5
        }]
    };
    
    Plotly.newPlot('mainChart', [], layout);
}

// ============== ANIMATION FUNCTIONS ==============
function startAnimation() {
    if (isAnimating || !eegData) return;
    
    isAnimating = true;
    animationFrameCount = 0;
    
    if (currentTimeIdx >= timePoints.length - 1) {
        currentTimeIdx = 0;
    }
    
    const timelineSlider = document.getElementById('timelineSlider');
    const progressBar = document.getElementById('progressBar');
    const playPauseBtn = document.getElementById('playPauseBtn');
    
    animationInterval = setInterval(() => {
        animationFrameCount++;
        if (animationFrameCount > maxFramesToRender) {
            console.warn('Animation frame limit reached, stopping animation');
            stopAnimation();
            if (playPauseBtn) playPauseBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Play Animation';
            return;
        }
        
        const adaptiveStep = Math.max(1, Math.floor(timePoints.length / 5000));
        
        if (currentTimeIdx < timePoints.length - adaptiveStep * 10) {
            currentTimeIdx += adaptiveStep;
            
            updateTimeDisplay();
            const progress = (currentTimeIdx / (timePoints.length - 1)) * 100;
            if (timelineSlider) timelineSlider.value = progress;
            if (progressBar) progressBar.style.width = `${progress}%`;
            
            const visualizationMode = document.getElementById('visualizationMode');
            const currentMode = visualizationMode ? visualizationMode.value : 'multichannel';
            
            if (currentMode === 'polar') {
                updatePolarPlotMain(true);
            } else if (currentMode === 'recurrence') {
                updateRecurrencePlotMain(true);
            } else {
                updateVisualizations(true);
            }
            
            if (animationFrameCount % 5 === 0) {
                createPolarPlot();
            }
            
        } else {
            stopAnimation();
            if (playPauseBtn) playPauseBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Play Animation';
        }
    }, animationSpeed);
}

function stopAnimation() {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
    isAnimating = false;
    animationFrameCount = 0;
    
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn) {
        playPauseBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Play Animation';
    }
}

// ============== UTILITY FUNCTIONS ==============
function updateTimeDisplay() {
    const currentTimeDisplay = document.getElementById('currentTime');
    const totalTimeDisplay = document.getElementById('totalTime');
    
    if (currentTimeDisplay && timePoints && timePoints.length > 0) {
        if (currentTimeIdx < timePoints.length) {
            const currentTime = timePoints[currentTimeIdx];
            currentTimeDisplay.textContent = `${currentTime.toFixed(2)}s`;
        } else {
            currentTimeDisplay.textContent = '0.00s';
        }
    }
    
    if (totalTimeDisplay && timePoints && timePoints.length > 0) {
        const totalTime = timePoints[timePoints.length - 1];
        totalTimeDisplay.textContent = `${totalTime.toFixed(2)}s`;
    }
}

function updateStatistics() {
    if (!eegData || !channelNames || channelNames.length === 0) return;
    
    let statsContainer = document.getElementById('statisticsContainer');
    
    if (!statsContainer) {
        statsContainer = document.createElement('div');
        statsContainer.id = 'statisticsContainer';
        statsContainer.className = 'row mb-3';
        
        const mainContent = document.querySelector('.card-body') || 
                           document.querySelector('.container') || 
                           document.body;
        
        const channelSelection = document.getElementById('channelSelectionContainer');
        if (channelSelection) {
            channelSelection.insertAdjacentElement('afterend', statsContainer);
        } else {
            mainContent.appendChild(statsContainer);
        }
    }
    
    const stats = calculateChannelStatistics();
    
    statsContainer.innerHTML = `
        <div class="col-12">
            <div class="card">
                <div class="card-body">
                    <h6 class="card-title">EEG Statistics</h6>
                    <div class="row mt-3 g-3">
                        <div class="col-md-3">
                            <div class="stat-box">
                                <small class="text-muted">Avg Amplitude</small>
                                <h5 class="mb-0">${stats.avgAmplitude.toFixed(2)} μV</h5>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="stat-box">
                                <small class="text-muted">Max Amplitude</small>
                                <h5 class="mb-0">${stats.maxAmplitude.toFixed(2)} μV</h5>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="stat-box">
                                <small class="text-muted">Min Amplitude</small>
                                <h5 class="mb-0">${stats.minAmplitude.toFixed(2)} μV</h5>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="stat-box">
                                <small class="text-muted">Std Deviation</small>
                                <h5 class="mb-0">${stats.stdDeviation.toFixed(2)} μV</h5>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function calculateChannelStatistics() {
    if (!eegData || eegData.length === 0) {
        return {
            samplingRate: 0,
            avgAmplitude: 0,
            maxAmplitude: 0,
            minAmplitude: 0,
            stdDeviation: 0
        };
    }
    
    let samplingRate = 250;
    if (timePoints.length > 1) {
        const timeDiff = timePoints[1] - timePoints[0];
        samplingRate = timeDiff > 0 ? Math.round(1 / timeDiff) : 250;
    }
    
    let allValues = [];
    let sumAmplitude = 0;
    let maxAmplitude = -Infinity;
    let minAmplitude = Infinity;
    
    eegData.forEach(channelData => {
        channelData.forEach(value => {
            allValues.push(Math.abs(value));
            sumAmplitude += Math.abs(value);
            maxAmplitude = Math.max(maxAmplitude, Math.abs(value));
            minAmplitude = Math.min(minAmplitude, Math.abs(value));
        });
    });
    
    const totalValues = allValues.length;
    const avgAmplitude = totalValues > 0 ? sumAmplitude / totalValues : 0;
    
    let sumSquaredDiff = 0;
    allValues.forEach(value => {
        sumSquaredDiff += Math.pow(value - avgAmplitude, 2);
    });
    const stdDeviation = totalValues > 0 ? Math.sqrt(sumSquaredDiff / totalValues) : 0;
    
    return {
        samplingRate,
        avgAmplitude,
        maxAmplitude: maxAmplitude !== -Infinity ? maxAmplitude : 0,
        minAmplitude: minAmplitude !== Infinity ? minAmplitude : 0,
        stdDeviation
    };
}

function resetVisualization() {
    currentTimeIdx = 0;
    
    if (isAnimating) {
        stopAnimation();
    }
    
    const charts = ['mainChart', 'polarChart', 'recurrenceChart'];
    charts.forEach(chartId => {
        try {
            const chartElement = document.getElementById(chartId);
            if (chartElement) {
                Plotly.purge(chartElement);
            }
        } catch (e) {
            console.warn(`Could not purge ${chartId}:`, e);
        }
    });
    
    const timelineSlider = document.getElementById('timelineSlider');
    if (timelineSlider) {
        timelineSlider.value = 0;
    }
    
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        progressBar.style.width = '0%';
    }
    
    updateTimeDisplay();
}

function setupSmallRecurrencePlotControls() {
    const recurrenceChartContainer = document.getElementById('recurrenceChart')?.parentElement;
    if (!recurrenceChartContainer) return;
    
    if (document.getElementById('smallRecurrenceControls')) return;
    
    const controlsDiv = document.createElement('div');
    controlsDiv.id = 'smallRecurrenceControls';
    controlsDiv.className = 'mt-2';
    controlsDiv.innerHTML = `
        <div class="row g-2">
            <div class="col-6">
                <label class="form-label" style="font-size: 0.85rem;">Channel X</label>
                <select id="recurrenceChannelX" class="form-select form-select-sm">
                </select>
            </div>
            <div class="col-6">
                <label class="form-label" style="font-size: 0.85rem;">Channel Y</label>
                <select id="recurrenceChannelY" class="form-select form-select-sm">
                </select>
            </div>
        </div>
    `;
    
    recurrenceChartContainer.appendChild(controlsDiv);
    populateSmallRecurrenceDropdowns();
    
    const channelXSelect = document.getElementById('recurrenceChannelX');
    const channelYSelect = document.getElementById('recurrenceChannelY');
    
    if (channelXSelect) {
        channelXSelect.addEventListener('change', function() {
            recurrenceChannelX = this.value;
            createRecurrencePlot();
        });
    }
    
    if (channelYSelect) {
        channelYSelect.addEventListener('change', function() {
            recurrenceChannelY = this.value;
            createRecurrencePlot();
        });
    }
}

function populateSmallRecurrenceDropdowns() {
    const channelXSelect = document.getElementById('recurrenceChannelX');
    const channelYSelect = document.getElementById('recurrenceChannelY');
    
    if (!channelXSelect || !channelYSelect) return;
    if (!channelNames || channelNames.length === 0) return;
    
    channelXSelect.innerHTML = '';
    channelYSelect.innerHTML = '';
    
    channelNames.forEach(channel => {
        const optionX = document.createElement('option');
        optionX.value = channel;
        optionX.textContent = channel;
        channelXSelect.appendChild(optionX);
        
        const optionY = document.createElement('option');
        optionY.value = channel;
        optionY.textContent = channel;
        channelYSelect.appendChild(optionY);
    });
    
    if (channelNames.length > 0) {
        channelXSelect.value = recurrenceChannelX || channelNames[0];
        recurrenceChannelX = channelXSelect.value;
    }
    
    if (channelNames.length > 1) {
        channelYSelect.value = recurrenceChannelY || channelNames[1];
        recurrenceChannelY = channelYSelect.value;
    } else if (channelNames.length === 1) {
        channelYSelect.value = recurrenceChannelY || channelNames[0];
        recurrenceChannelY = channelYSelect.value;
    }
}

function setupRecurrenceDragSelection() {
    // Implementation for drag selection (optional)
    console.log('Recurrence drag selection setup');
}

function showMessage(message, type) {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'} alert-dismissible fade show position-fixed`;
    toast.style.top = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '9999';
    toast.style.minWidth = '300px';

    toast.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 5000);
}