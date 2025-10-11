// Global variables
let eegData = null;
let channelNames = [];
let timePoints = [];
let animationInterval = null;
let currentTimeIdx = 0;
let isAnimating = false;
let selectedChannels = [];
let selectedWaveBand = 'all';

// Animation control properties
let animationSpeed = 50; // ms between frames
let animationFrameCount = 0;
let maxFramesToRender = 1000; // Safety limit

// Polar Graph properties - SEPARATE FROM MAIN CHANNELS
let polarMode = 'dynamic'; // Changed default from 'fixed' to 'dynamic'
let selectedPolarChannels = []; // Separate selection for polar only
let polarColors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'];

// Recurrence Plot properties
let recurrenceChannel1 = null;
let recurrenceChannel2 = null;
let recurrenceThreshold = 0.1;
let recurrenceMode = 'scatter'; // 'scatter' or 'heatmap'
let recurrenceColormap = 'Viridis'; // 'Viridis', 'Plasma', 'Hot', 'Jet'

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
    
    // Analyze button click handler
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', function() {
            if (!fileInput || fileInput.files.length === 0) return;
            
            if (loading) loading.style.display = 'block';
            setTimeout(() => {
                loadEEGData(fileInput.files[0])
                    .then(() => {
                        initializeChannelSelection();
                        initializeVisualizations();
                        updateStatistics();
                        if (timelineControl) timelineControl.style.display = 'block';
                        if (playPauseBtn) playPauseBtn.disabled = false;
                        if (classifyBtn) classifyBtn.disabled = false;
                        if (loading) loading.style.display = 'none';
                        
                        // Initialize polar channels with first two channels by default
                        if (channelNames.length > 0) {
                            selectedPolarChannels = channelNames.slice(0, Math.min(2, channelNames.length));
                            recurrenceChannel1 = channelNames[0];
                            recurrenceChannel2 = channelNames.length > 1 ? channelNames[1] : channelNames[0];
                        }
                    })
                    .catch(err => {
                        console.error('Error loading EEG data:', err);
                        alert('Failed to load EEG data. Please check the file format.');
                        if (loading) loading.style.display = 'none';
                    });
            }, 500);
        });
    }
    
    // Set polar mode to dynamic by default in the UI
    const polarModeSelect = document.getElementById('polarMode');
    if (polarModeSelect) {
        polarModeSelect.value = 'dynamic';
    }
    
    // Add visualization mode change handler with controls toggle (only if element exists)
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

// Add this HTML to the page after loading data
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
                                        <option value="fixed" selected>Fixed Window</option>
                                        <option value="dynamic">Dynamic</option>
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
        const waveFilterSection = document.querySelector('.wave-filter').closest('.row');
        waveFilterSection.insertAdjacentHTML('afterend', polarControlsHTML);
        
        // Add event listener for polar mode
        document.getElementById('polarMode').addEventListener('change', function() {
            polarMode = this.value;
            if (eegData && visualizationMode.value === 'polar') {
                updatePolarPlotMain();
            }
        });
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
                                    <label class="form-label">Channel X</label>
                                    <select id="recurrenceChannel1" class="form-select">
                                        <!-- Will be populated dynamically -->
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">Channel Y</label>
                                    <select id="recurrenceChannel2" class="form-select">
                                        <!-- Will be populated dynamically -->
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">Threshold</label>
                                    <input type="number" id="recurrenceThreshold" class="form-control" min="0.01" max="1" step="0.01" value="0.1">
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">Plot Type</label>
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
                                        <option value="Hot">Hot</option>
                                        <option value="Jet">Jet</option>
                                    </select>
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
            const waveFilterSection = document.querySelector('.wave-filter').closest('.row');
            waveFilterSection.insertAdjacentHTML('afterend', recurrenceControlsHTML);
        }
        
        // Add event listeners
        document.getElementById('recurrenceChannel1')?.addEventListener('change', function() {
            recurrenceChannel1 = this.value;
            if (eegData && visualizationMode.value === 'recurrence') {
                updateRecurrencePlotMain();
            }
        });
        
        document.getElementById('recurrenceChannel2')?.addEventListener('change', function() {
            recurrenceChannel2 = this.value;
            if (eegData && visualizationMode.value === 'recurrence') {
                updateRecurrencePlotMain();
            }
        });
        
        document.getElementById('recurrenceThreshold')?.addEventListener('change', function() {
            recurrenceThreshold = parseFloat(this.value);
            if (eegData && visualizationMode.value === 'recurrence') {
                updateRecurrencePlotMain();
            }
        });
        
        document.getElementById('recurrenceMode')?.addEventListener('change', function() {
            recurrenceMode = this.value;
            if (eegData && visualizationMode.value === 'recurrence') {
                updateRecurrencePlotMain();
            }
        });
        
        document.getElementById('recurrenceColormap')?.addEventListener('change', function() {
            recurrenceColormap = this.value;
            if (eegData && visualizationMode.value === 'recurrence') {
                updateRecurrencePlotMain();
            }
        });
    }
}

// Load EEG data function
async function loadEEGData(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const content = e.target.result;
                parseEEGData(content);
                addModeControlSections(); // Add control sections after data is loaded
                
                // Reset selected areas for recurrence plot
                selectedAreaChannel1 = null;
                selectedAreaChannel2 = null;
                
                resolve();
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = function() {
            reject(new Error('File reading failed'));
        };
        
        reader.readAsText(file);
    });
}

// Parse EEG data from CSV
function parseEEGData(csvContent) {
    const lines = csvContent.split('\n');
    
    if (lines.length < 2) throw new Error('Invalid file format');
    
    // Parse header (first line)
    const header = lines[0].split(',');
    channelNames = header.slice(1); // First column is time
    
    // Initialize data arrays
    eegData = Array(channelNames.length).fill().map(() => []);
    timePoints = [];
    
    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split(',');
        if (values.length < 2) continue;
        
        // Parse time and channel values
        const time = parseFloat(values[0]);
        timePoints.push(time);
        
        for (let j = 0; j < channelNames.length; j++) {
            const value = parseFloat(values[j + 1]);
            eegData[j].push(isNaN(value) ? 0 : value);
        }
    }
    
    // Set initially selected channels (first 5 or all if less than 5)
    selectedChannels = channelNames.slice(0, Math.min(5, channelNames.length));
    
    // Set initial polar channels (first 2 channels)
    selectedPolarChannels = channelNames.slice(0, Math.min(2, channelNames.length));
    
    // Set initial recurrence channels
    recurrenceChannel1 = channelNames[0];
    recurrenceChannel2 = channelNames.length > 1 ? channelNames[1] : channelNames[0];
    
    console.log(`Loaded ${channelNames.length} channels with ${timePoints.length} time points`);
}

// Update the initializeChannelSelection function to handle duplicates properly
function initializeChannelSelection() {
    // Remove any existing channel selection containers first
    const existingContainers = document.querySelectorAll('#channelSelectionContainer');
    existingContainers.forEach(container => container.remove());
    
    // Also remove any containers with the old ID structure
    const oldContainers = document.querySelectorAll('[id*="noChannelsMessage"]');
    oldContainers.forEach(container => {
        if (container.parentElement) {
            container.parentElement.remove();
        } else {
            container.remove();
        }
    });
    
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
    
    // Populate polar channels selection (only if container exists)
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
    
    // Populate recurrence channel dropdowns (only if they exist)
    const recChannel1Select = document.getElementById('recurrenceChannel1');
    const recChannel2Select = document.getElementById('recurrenceChannel2');
    
    if (recChannel1Select && recChannel2Select) {
        recChannel1Select.innerHTML = '';
        recChannel2Select.innerHTML = '';
        
        channelNames.forEach(channel => {
            const option1 = document.createElement('option');
            option1.value = channel;
            option1.textContent = channel;
            
            const option2 = document.createElement('option');
            option2.value = channel;
            option2.textContent = channel;
            
            recChannel1Select.appendChild(option1);
            recChannel2Select.appendChild(option2);
        });
        
        // Set default selections
        if (recurrenceChannel1) recChannel1Select.value = recurrenceChannel1;
        if (recurrenceChannel2) recChannel2Select.value = recurrenceChannel2;
    }
}

// Initialize visualizations
function initializeVisualizations() {
    updateVisualizations();
    createPolarPlot();
    createRecurrencePlot();
}

// Update visualizations based on current mode
function updateVisualizations(fromSlider = false) {
    const visualizationMode = document.getElementById('visualizationMode');
    const mode = visualizationMode ? visualizationMode.value : 'multichannel'; // Default to multichannel
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
            // Default fallback - just show multichannel plot
            createMultichannelPlot(fromSlider);
    }
}

// Add a simple recurrence plot function that doesn't depend on dropdowns:
function updateRecurrencePlotMain(fromSlider = false) {
    if (!eegData) return;
    
    // Use default channels if dropdowns don't exist
    const recChannel1Select = document.getElementById('recurrenceChannel1');
    const recChannel2Select = document.getElementById('recurrenceChannel2');
    
    const channel1Name = recChannel1Select ? recChannel1Select.value : (recurrenceChannel1 || channelNames[0]);
    const channel2Name = recChannel2Select ? recChannel2Select.value : (recurrenceChannel2 || (channelNames.length > 1 ? channelNames[1] : channelNames[0]));
    
    if (!channel1Name || !channel2Name) {
        console.error("No channels available for recurrence plot");
        return;
    }
    
    // Find channel indices
    const channel1Idx = channelNames.indexOf(channel1Name);
    const channel2Idx = channelNames.indexOf(channel2Name);
    
    if (channel1Idx === -1 || channel2Idx === -1) {
        console.error("Selected channels not found in data");
        return;
    }
    
    // Create a basic recurrence plot
    const channel1Data = eegData[channel1Idx];
    const channel2Data = eegData[channel2Idx];
    
    // Sample data for better performance
    const step = Math.max(1, Math.floor(channel1Data.length / 500));
    const xValues = [];
    const yValues = [];
    
    for (let i = 0; i < Math.min(channel1Data.length, channel2Data.length); i += step) {
        xValues.push(channel1Data[i]);
        yValues.push(channel2Data[i]);
    }
    
    // Get selected mode and colormap (with fallbacks)
    const modeSelect = document.getElementById('recurrenceMode');
    const colormapSelect = document.getElementById('recurrenceColormap');
    
    const mode = modeSelect ? modeSelect.value : recurrenceMode;
    const colormap = colormapSelect ? colormapSelect.value : recurrenceColormap;
    
    let trace;
    
    if (mode === 'heatmap') {
        trace = {
            x: xValues,
            y: yValues,
            type: 'histogram2d',
            colorscale: colormap,
            showscale: true,
            name: 'Density'
        };
    } else { // scatter mode
        trace = {
            x: xValues,
            y: yValues,
            type: 'scatter',
            mode: 'markers',
            name: 'Scatter',
            marker: {
                size: 3,
                color: Array(xValues.length).fill(0).map((_, i) => i),
                colorscale: colormap,
                showscale: true,
                colorbar: { title: 'Point Order' },
                opacity: 0.6
            }
        };
    }
    
    const layout = {
        title: `Recurrence Plot: ${channel1Name} vs ${channel2Name}`,
        xaxis: { title: `${channel1Name} Amplitude (μV)` },
        yaxis: { title: `${channel2Name} Amplitude (μV)` },
        showlegend: false,
        height: 400,
        margin: { l: 50, r: 50, t: 50, b: 50 }
    };
    
    Plotly.newPlot('mainChart', [trace], layout);
}

// Create multichannel plot
function createMultichannelPlot(fromSlider = false) {
    if (!eegData || !selectedChannels.length) return;
    
    const traces = [];
    const spacing = 100; // Vertical spacing between channels
    const windowSize = parseInt(document.getElementById('windowSize').value) * parseInt(document.getElementById('samplingRate').value);
    
    // Determine time window to display
    let startIdx, endIdx;
    
    if (fromSlider || isAnimating) {
        startIdx = Math.max(0, currentTimeIdx - windowSize/2);
        endIdx = Math.min(timePoints.length, currentTimeIdx + windowSize/2);
    } else {
        startIdx = 0;
        endIdx = Math.min(timePoints.length, windowSize);
    }
    
    const visibleTimePoints = timePoints.slice(startIdx, endIdx);
    
    // Create a trace for each selected channel
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

// Create topographic map
function createTopographicMap(fromSlider = false) {
    // Placeholder for topographic map implementation
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

// Updated to match ECG-style polar plot
async function updatePolarPlotMain(fromSlider = false) {
    if (!eegData || !selectedPolarChannels.length) return;
    
    // Show loading indicator
    document.getElementById('loading').style.display = 'block';
    
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
            height: 400,
            margin: { l: 40, r: 40, t: 60, b: 40 },
            template: "plotly_white"
        };
        
        Plotly.newPlot('mainChart', traces, layout);
    } catch (error) {
        console.error("Error updating polar plot:", error);
    } finally {
        // Hide loading indicator
        document.getElementById('loading').style.display = 'none';
    }
}

// Function to fetch polar data from the server
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

// Update recurrence plot from selections to use backend
async function updateRecurrencePlotFromSelections() {
    if (!selectedAreaChannel1 || !selectedAreaChannel2) {
        return;
    }
    
    // Show loading indicator
    document.getElementById('loading').style.display = 'block';
    
    try {
        // Get recurrence data from server
        const recurrenceData = await fetchRecurrenceData(selectedAreaChannel1, selectedAreaChannel2);
        
        if (!recurrenceData) {
            console.error("Failed to get recurrence data");
            return;
        }
        
        const xValues = recurrenceData.channel1.data;
        const yValues = recurrenceData.channel2.data;
        const timeValues = recurrenceData.channel1.time || Array(xValues.length).fill(0).map((_, i) => i);
        
        // Get selected mode and colormap
        const mode = document.getElementById('recurrenceMode')?.value || 'scatter';
        const colormap = document.getElementById('recurrenceColormap')?.value || 'Viridis';
        
        let trace;
        
        if (mode === 'heatmap') {
            trace = {
                x: xValues,
                y: yValues,
                type: 'histogram2d',
                colorscale: colormap,
                showscale: true,
                name: 'Density'
            };
        } else { // scatter mode
            trace = {
                x: xValues,
                y: yValues,
                type: 'scatter',
                mode: 'markers',
                name: 'Scatter',
                marker: {
                    size: 3,
                    color: timeValues,
                    colorscale: colormap,
                    showscale: true,
                    colorbar: { title: 'Time (s)' },
                    opacity: 0.6
                }
            };
        }
        
        const metrics = recurrenceData.metrics;
        const metricsText = `RR: ${(metrics.recurrenceRate * 100).toFixed(2)}%, DET: ${(metrics.determinism * 100).toFixed(2)}%`;
        
        const layout = {
            title: `Recurrence: ${selectedAreaChannel1.channelName} vs ${selectedAreaChannel2.channelName}`,
            annotations: [{
                text: metricsText,
                showarrow: false,
                font: { size: 12 },
                bgcolor: 'rgba(255, 255, 255, 0.8)',
                bordercolor: 'rgba(0, 0, 0, 0.2)',
                borderwidth: 1,
                borderpad: 4,
                xref: 'paper',
                yref: 'paper',
                x: 0.01,
                y: 0.01
            }],
            xaxis: { title: `${selectedAreaChannel1.channelName} Amplitude (μV)` },
            yaxis: { title: `${selectedAreaChannel2.channelName} Amplitude (μV)` },
            showlegend: false,
            height: 400,
            margin: { l: 50, r: 50, t: 50, b: 50 }
        };
        
        Plotly.newPlot('mainChart', [trace], layout);
        
        // Also update the small recurrence plot
        updateSmallRecurrencePlot(selectedAreaChannel1, selectedAreaChannel2);
    } catch (error) {
        console.error("Error updating recurrence plot:", error);
    } finally {
        // Hide loading indicator
        document.getElementById('loading').style.display = 'none';
    }
}

// Function to send recurrence data selections to the server
async function fetchRecurrenceData(channel1, channel2) {
    if (!eegData || !channel1 || !channel2) return null;
    
    try {
        const url = '/api/eeg/get_recurrence_data';
        
        const requestData = {
            region1: {
                channelName: channel1.channelName,
                startIndex: 0,
                endIndex: channel1.data.length
            },
            region2: {
                channelName: channel2.channelName,
                startIndex: 0,
                endIndex: channel2.data.length
            },
            threshold: recurrenceThreshold
        };
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error("Error fetching recurrence data:", errorData.error);
            return null;
        }
        
        return await response.json();
    } catch (error) {
        console.error("Failed to fetch recurrence data:", error);
        return null;
    }
}

// Create spectrogram
function createSpectrogram(fromSlider = false) {
    if (!eegData || !selectedChannels.length) return;
    
    // This is a placeholder for spectrogram implementation
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

// Create polar plot (small version)
function createPolarPlot() {
    if (!eegData) return;
    
    // Use selected polar channels for small polar plot too
    const channelsToShow = selectedPolarChannels.slice(0, 3); // Show up to 3 for clarity
    
    const traces = [];
    
    channelsToShow.forEach((channelName, idx) => {
        const channelIdx = channelNames.indexOf(channelName);
        if (channelIdx === -1) return;
        
        const channelData = eegData[channelIdx];
        
        // Sample the data to avoid too many points
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

// Create recurrence plot (small version)
function createRecurrencePlot() {
    if (!eegData) return;
    
    // Use first two channels or first channel twice if only one exists
    const channel1Name = recurrenceChannel1 || channelNames[0];
    const channel2Name = recurrenceChannel2 || channel1Name;
    
    const channel1Idx = channelNames.indexOf(channel1Name);
    const channel2Idx = channelNames.indexOf(channel2Name);
    
    if (channel1Idx === -1 || channel2Idx === -1) return;
    
    const channel1Data = eegData[channel1Idx];
    const channel2Data = eegData[channel2Idx];
    
    const xValues = [];
    const yValues = [];
    
    // Sample data for better performance
    const step = Math.max(1, Math.floor(channel1Data.length / 200));
    
    for (let i = 0; i < Math.min(channel1Data.length, channel2Data.length); i += step) {
        xValues.push(channel1Data[i]);
        yValues.push(channel2Data[i]);
    }
    
    const trace = {
        x: xValues,
        y: yValues,
        type: 'scatter',
        mode: 'markers',
        marker: {
            size: 2,
            color: 'red',
            opacity: 0.5
        }
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
            }
        },
        yaxis: { 
            title: { 
                text: `${channel2Name} (μV)`,
                font: { size: 10 }
            }
        },
        showlegend: false,
        height: 300,
        margin: { l: 40, r: 20, t: 40, b: 40 }
    };
    
    Plotly.newPlot('recurrenceChart', [trace], layout);
}

// Update statistics
function updateStatistics() {
    if (!eegData) return;
    
    // Calculate signal duration
    const duration = timePoints[timePoints.length - 1] - timePoints[0];
    
    // Set max time in timeline
    document.getElementById('totalTime').textContent = `${duration.toFixed(1)}s`;
}

// Start animation with boundary checks and frame limiting
function startAnimation() {
    if (isAnimating || !eegData) return;
    
    isAnimating = true;
    animationFrameCount = 0;
    
    // Reset animation if at the end
    if (currentTimeIdx >= timePoints.length - 1) {
        currentTimeIdx = 0;
    }
    
    const timelineSlider = document.getElementById('timelineSlider');
    const progressBar = document.getElementById('progressBar');
    const playPauseBtn = document.getElementById('playPauseBtn');
    
    animationInterval = setInterval(() => {
        // Safety check to prevent infinite animations
        animationFrameCount++;
        if (animationFrameCount > maxFramesToRender) {
            console.warn('Animation frame limit reached, stopping animation');
            stopAnimation();
            playPauseBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Play Animation';
            return;
        }
        
        // Check boundary before incrementing
        if (currentTimeIdx < timePoints.length - 1) {
            // Move to next time point
            currentTimeIdx++;
            
            // Update progress indicators
            updateTimeDisplay();
            const progress = (currentTimeIdx / (timePoints.length - 1)) * 100;
            timelineSlider.value = progress;
            progressBar.style.width = `${progress}%`;
            
            // Update visualizations
            updateVisualizations(true);
        } else {
            // End of data reached
            stopAnimation();
            playPauseBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Play Animation';
        }
    }, animationSpeed);
}

// Stop animation
function stopAnimation() {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
    
    isAnimating = false;
}

// Update time display
function updateTimeDisplay() {
    if (!eegData || currentTimeIdx >= timePoints.length) return;
    
    const currentTime = timePoints[currentTimeIdx];
    document.getElementById('currentTime').textContent = `${currentTime.toFixed(1)}s`;
}

// Reset visualization
function resetVisualization() {
    eegData = null;
    channelNames = [];
    timePoints = [];
    selectedChannels = [];
    selectedPolarChannels = [];
    currentTimeIdx = 0;
    stopAnimation();
    
    // Reset UI elements with null checks
    const noChannelsMessageElement = document.getElementById('noChannelsMessage');
    if (noChannelsMessageElement && noChannelsMessageElement.parentElement) {
        noChannelsMessageElement.parentElement.innerHTML = `
            <div class="col-12 text-muted" id="noChannelsMessage">
                <p>Upload an EEG file to view available channels</p>
            </div>
        `;
    }
    
    // Set wave band powers with null checks
    const alphaPower = document.getElementById('alphaPower');
    if (alphaPower) alphaPower.textContent = '-- μV²';
    
    const betaPower = document.getElementById('betaPower');
    if (betaPower) betaPower.textContent = '-- μV²';
    
    const deltaPower = document.getElementById('deltaPower');
    if (deltaPower) deltaPower.textContent = '-- μV²';
    
    const thetaPower = document.getElementById('thetaPower');
    if (thetaPower) thetaPower.textContent = '-- μV²';
    
    const signalQuality = document.getElementById('signalQuality');
    if (signalQuality) signalQuality.textContent = '--%';
    
    const classificationResult = document.getElementById('classificationResult');
    if (classificationResult) {
        classificationResult.innerHTML = `
            <p class="text-muted">Upload EEG data and click "AI Classification" to see results</p>
        `;
    }
    
    // Clear charts
    if (document.getElementById('mainChart')) {
        Plotly.purge('mainChart');
    }
    
    if (document.getElementById('polarChart')) {
        Plotly.purge('polarChart');
    }
    
    if (document.getElementById('recurrenceChart')) {
        Plotly.purge('recurrenceChart');
    }
    
    if (document.getElementById('brainStateChart')) {
        Plotly.purge('brainStateChart');
    }
    
    const timelineControl = document.getElementById('timelineControl');
    if (timelineControl) {
        timelineControl.style.display = 'none';
    }
    
    // Additional reset for recurrence selections
    selectedAreaChannel1 = null;
    selectedAreaChannel2 = null;
}

// Add this function to set up the drag selection interface
function setupRecurrenceDragSelection() {
    if (!eegData) return;
    
    // Create a special visualization for channel selection with drag boxes
    const traces = [];
    const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'];
    
    // We'll display up to 6 channels for selection
    const channelsToShow = channelNames.slice(0, Math.min(6, channelNames.length));
    
    // Create a subplot with each channel's data
    channelsToShow.forEach((channelName, idx) => {
        const channelIdx = channelNames.indexOf(channelName);
        if (channelIdx === -1) return;
        
        // Sample data for better performance
        const step = Math.max(1, Math.floor(eegData[channelIdx].length / 500));
        const sampledData = [];
        const sampledTime = [];
        
        for (let i = 0; i < eegData[channelIdx].length; i += step) {
            sampledData.push(eegData[channelIdx][i]);
            sampledTime.push(timePoints[i]);
        }
        
        // Create trace for this channel
        traces.push({
            x: sampledTime,
            y: sampledData,
            name: channelName,
            line: {
                color: colors[idx % colors.length],
                width: 1.5
            },
            yaxis: `y${idx + 1}`,
            hoverinfo: 'name+x+y'
        });
    });
    
    // Create layout with subplots
    const layout = {
        title: 'Drag to Select Channel Regions for Comparison',
        grid: {
            rows: channelsToShow.length,
            columns: 1,
            pattern: 'independent',
            roworder: 'top to bottom'
        },
        height: 500,
        margin: { l: 50, r: 10, t: 50, b: 30 },
        showlegend: true,
        legend: { orientation: 'h' },
        dragmode: 'select'
    };
    
    // Add a Y-axis for each channel
    channelsToShow.forEach((_, idx) => {
        layout[`yaxis${idx + 1}`] = {
            title: channelsToShow[idx],
            titlefont: { size: 10 },
            domain: [(channelsToShow.length - idx - 1) / channelsToShow.length, 
                    (channelsToShow.length - idx) / channelsToShow.length],
            tickfont: { size: 9 }
        };
    });
    
    // Plot the channels for selection
    Plotly.newPlot('mainChart', traces, layout).then(function() {
        const mainChart = document.getElementById('mainChart');
        
        // Add selection event listener
        mainChart.on('plotly_selected', function(eventData) {
            if (!eventData) return;
            
            // Determine which subplot was selected
            const pointsArray = eventData.points;
            if (!pointsArray || pointsArray.length === 0) return;
            
            // Group points by curve (channel)
            const selectionsByChannel = {};
            
            pointsArray.forEach(point => {
                const curveNumber = point.curveNumber;
                if (!selectionsByChannel[curveNumber]) {
                    selectionsByChannel[curveNumber] = {
                        channelName: point.data.name,
                        xValues: [],
                        yValues: []
                    };
                }
                selectionsByChannel[curveNumber].xValues.push(point.x);
                selectionsByChannel[curveNumber].yValues.push(point.y);
            });
            
            // Process selections - we need two channels selected
            const selectedCurves = Object.keys(selectionsByChannel);
            
            if (selectedCurves.length === 0) {
                // Nothing selected
                return;
            } else if (selectedCurves.length === 1) {
                // One channel selected - store as first selection
                const selection = selectionsByChannel[selectedCurves[0]];
                selectedAreaChannel1 = {
                    channelName: selection.channelName,
                    data: selection.yValues,
                    time: selection.xValues
                };
                
                // Show feedback to user
                const statusDiv = document.getElementById('recurrenceStatus') || 
                    createStatusElement('recurrenceStatus', 'Channel 1 selected: ' + selection.channelName);
                statusDiv.innerHTML = `Channel 1 selected: <strong>${selection.channelName}</strong> 
                    (${selection.yValues.length} points).<br>Now select a region from another channel.`;
                
            } else if (selectedCurves.length >= 2) {
                // Multiple channels selected - use the first two
                const selection1 = selectionsByChannel[selectedCurves[0]];
                const selection2 = selectionsByChannel[selectedCurves[1]];
                
                selectedAreaChannel1 = {
                    channelName: selection1.channelName,
                    data: selection1.yValues,
                    time: selection1.xValues
                };
                
                selectedAreaChannel2 = {
                    channelName: selection2.channelName,
                    data: selection2.yValues,
                    time: selection2.xValues
                };
                
                // Show feedback
                const statusDiv = document.getElementById('recurrenceStatus') || 
                    createStatusElement('recurrenceStatus', 'Processing...');
                statusDiv.innerHTML = `Comparing: <strong>${selection1.channelName}</strong> vs 
                    <strong>${selection2.channelName}</strong>.<br>Creating recurrence plot...`;
                
                // Update the recurrence plot with selected regions
                setTimeout(() => {
                    updateRecurrencePlotFromSelections();
                    statusDiv.innerHTML = `Recurrence plot created for <strong>${selection1.channelName}</strong> vs 
                        <strong>${selection2.channelName}</strong>.<br>Select new regions to update.`;
                }, 200);
            }
        });
    });
}

// Helper function to create status element for feedback
function createStatusElement(id, initialText) {
    const parentElement = document.querySelector('.visualization-controls') || 
                          document.getElementById('recurrenceControlsSection');
    
    if (!parentElement) return null;
    
    // Create status element
    const statusDiv = document.createElement('div');
    statusDiv.id = id;
    statusDiv.className = 'alert alert-info mt-2 mb-0';
    statusDiv.innerHTML = initialText;
    
    // Add to parent
    parentElement.appendChild(statusDiv);
    
    return statusDiv;
}

// Update these functions to use the backend endpoints
async function updatePolarPlotMain(fromSlider = false) {
    if (!eegData || !selectedPolarChannels.length) return;
    
    // Show loading indicator
    document.getElementById('loading').style.display = 'block';
    
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
            height: 400,
            margin: { l: 40, r: 40, t: 60, b: 40 },
            template: "plotly_white"
        };
        
        Plotly.newPlot('mainChart', traces, layout);
    } catch (error) {
        console.error("Error updating polar plot:", error);
    } finally {
        // Hide loading indicator
        document.getElementById('loading').style.display = 'none';
    }
}

// Update recurrence plot from selections to use backend
async function updateRecurrencePlotFromSelections() {
    if (!selectedAreaChannel1 || !selectedAreaChannel2) {
        return;
    }
    
    // Show loading indicator
    document.getElementById('loading').style.display = 'block';
    
    try {
        // Get recurrence data from server
        const recurrenceData = await fetchRecurrenceData(selectedAreaChannel1, selectedAreaChannel2);
        
        if (!recurrenceData) {
            console.error("Failed to get recurrence data");
            return;
        }
        
        const xValues = recurrenceData.channel1.data;
        const yValues = recurrenceData.channel2.data;
        const timeValues = recurrenceData.channel1.time || Array(xValues.length).fill(0).map((_, i) => i);
        
        // Get selected mode and colormap
        const mode = document.getElementById('recurrenceMode')?.value || 'scatter';
        const colormap = document.getElementById('recurrenceColormap')?.value || 'Viridis';
        
        let trace;
        
        if (mode === 'heatmap') {
            trace = {
                x: xValues,
                y: yValues,
                type: 'histogram2d',
                colorscale: colormap,
                showscale: true,
                name: 'Density'
            };
        } else { // scatter mode
            trace = {
                x: xValues,
                y: yValues,
                type: 'scatter',
                mode: 'markers',
                name: 'Scatter',
                marker: {
                    size: 3,
                    color: timeValues,
                    colorscale: colormap,
                    showscale: true,
                    colorbar: { title: 'Time (s)' },
                    opacity: 0.6
                }
            };
        }
        
        const metrics = recurrenceData.metrics;
        const metricsText = `RR: ${(metrics.recurrenceRate * 100).toFixed(2)}%, DET: ${(metrics.determinism * 100).toFixed(2)}%`;
        
        const layout = {
            title: `Recurrence: ${selectedAreaChannel1.channelName} vs ${selectedAreaChannel2.channelName}`,
            annotations: [{
                text: metricsText,
                showarrow: false,
                font: { size: 12 },
                bgcolor: 'rgba(255, 255, 255, 0.8)',
                bordercolor: 'rgba(0, 0, 0, 0.2)',
                borderwidth: 1,
                borderpad: 4,
                xref: 'paper',
                yref: 'paper',
                x: 0.01,
                y: 0.01
            }],
            xaxis: { title: `${selectedAreaChannel1.channelName} Amplitude (μV)` },
            yaxis: { title: `${selectedAreaChannel2.channelName} Amplitude (μV)` },
            showlegend: false,
            height: 400,
            margin: { l: 50, r: 50, t: 50, b: 50 }
        };
        
        Plotly.newPlot('mainChart', [trace], layout);
        
        // Also update the small recurrence plot
        updateSmallRecurrencePlot(selectedAreaChannel1, selectedAreaChannel2);
    } catch (error) {
        console.error("Error updating recurrence plot:", error);
    } finally {
        // Hide loading indicator
        document.getElementById('loading').style.display = 'none';
    }
}

// Modify the recurrence controls to hide dropdowns and add instructions
function modifyRecurrenceControlsHTML() {
    const recurrenceControls = document.getElementById('recurrenceControlsSection');
    if (!recurrenceControls) return;
    
    // Hide the channel dropdowns since we'll use drag selection
    const channel1Col = document.getElementById('recurrenceChannel1')?.closest('.col-md-3');
    const channel2Col = document.getElementById('recurrenceChannel2')?.closest('.col-md-3');
    
    if (channel1Col) channel1Col.style.display = 'none';
    if (channel2Col) channel2Col.style.display = 'none';
    
    // Add instructions if they don't exist yet
    if (!document.getElementById('recurrenceInstructions')) {
        const row = recurrenceControls.querySelector('.row.g-3');
        if (row) {
            const instructions = document.createElement('div');
            instructions.className = 'col-md-6';
            instructions.id = 'recurrenceInstructions';
            instructions.innerHTML = `
                <div class="alert alert-info mb-0">
                    <small><i class="bi bi-info-circle me-1"></i>Select regions from two different channels by dragging on the chart. 
                    Use Shift+Click to select multiple regions.</small>
                </div>
            `;
            
            // Add to the beginning of the row
            row.prepend(instructions);
        }
    }
}

// Call this when loading data
document.addEventListener('DOMContentLoaded', function() {
    // Existing event listeners...
    
    // Add this to the end of your DOMContentLoaded function
    const visualizationMode = document.getElementById('visualizationMode');
    if (visualizationMode) {
        visualizationMode.addEventListener('change', function() {
            if (this.value === 'recurrence') {
                // Modify recurrence controls when switching to recurrence mode
                modifyRecurrenceControlsHTML();
            }
        });
    }
});