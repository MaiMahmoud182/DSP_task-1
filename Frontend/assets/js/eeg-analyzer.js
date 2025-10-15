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
            const waveFilterSection = document.querySelector('.wave-filter').closest('.row');
            waveFilterSection.insertAdjacentHTML('afterend', recurrenceControlsHTML);
        }
        
        // Add event listeners immediately after creating the HTML
        setTimeout(() => {
            const recChannel1Select = document.getElementById('recurrenceChannel1');
            const recChannel2Select = document.getElementById('recurrenceChannel2');
            const recurrenceModeSelect = document.getElementById('recurrenceMode');
            const recurrenceColormapSelect = document.getElementById('recurrenceColormap');
            const updateRecurrenceBtn = document.getElementById('updateRecurrenceBtn');
            
            if (recChannel1Select) {
                recChannel1Select.addEventListener('change', function() {
                    recurrenceChannel1 = this.value;
                    console.log('Channel 1 changed to:', recurrenceChannel1);
                });
            }
            
            if (recChannel2Select) {
                recChannel2Select.addEventListener('change', function() {
                    recurrenceChannel2 = this.value;
                    console.log('Channel 2 changed to:', recurrenceChannel2);
                });
            }
            
            if (recurrenceModeSelect) {
                recurrenceModeSelect.addEventListener('change', function() {
                    recurrenceMode = this.value;
                    if (eegData) updateRecurrencePlotMain();
                });
            }
            
            if (recurrenceColormapSelect) {
                recurrenceColormapSelect.addEventListener('change', function() {
                    recurrenceColormap = this.value;
                    if (eegData) updateRecurrencePlotMain();
                });
            }
            
            if (updateRecurrenceBtn) {
                updateRecurrenceBtn.addEventListener('click', function() {
                    console.log('Update button clicked');
                    if (eegData && recurrenceChannel1 && recurrenceChannel2) {
                        updateRecurrencePlotMain();
                    } else {
                        alert('Please load data and select channels first');
                    }
                });
            }
        }, 100);
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
        
        console.log('Recurrence dropdowns populated:', recurrenceChannel1, 'vs', recurrenceChannel2);
    }
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
        
        console.log('Recurrence dropdowns populated:', recurrenceChannel1, 'vs', recurrenceChannel2);
    }
}

// Initialize visualizations
function initializeVisualizations() {
    updateVisualizations();
    createPolarPlot();
    createRecurrencePlot();
    
    // Setup controls for small recurrence plot after a short delay to ensure DOM is ready
    setTimeout(() => {
        setupSmallRecurrencePlotControls();
    }, 100);
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
    if (!eegData || !channelNames || channelNames.length === 0) {
        console.warn("Cannot create recurrence plot: no data available");
        return;
    }
    
    // Use the selected channels from the dropdowns
    const channelXSelect = document.getElementById('recurrenceChannelX');
    const channelYSelect = document.getElementById('recurrenceChannelY');
    
    const channel1Name = channelXSelect ? channelXSelect.value : (recurrenceChannelX || channelNames[0]);
    const channel2Name = channelYSelect ? channelYSelect.value : (recurrenceChannelY || (channelNames.length > 1 ? channelNames[1] : channelNames[0]));
    
    const channel1Idx = channelNames.indexOf(channel1Name);
    const channel2Idx = channelNames.indexOf(channel2Name);
    
    if (channel1Idx === -1 || channel2Idx === -1) {
        console.error("Selected channels not found:", channel1Name, channel2Name);
        return;
    }
    
    // Sample data for performance (take every Nth point)
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
        console.log('Small recurrence plot updated with:', channel1Name, 'vs', channel2Name);
    } else {
        console.warn("Recurrence chart element not found");
    }
}

// ============== UPDATE MAIN RECURRENCE PLOT ==============
function updateRecurrencePlotMain(fromSlider = false) {
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
    
    // Determine data range (use window if animating)
    let startIdx = 0;
    let endIdx = Math.min(channel1Data.length, channel2Data.length);
    
    if (isAnimating && timePoints && currentTimeIdx > 0) {
        // Use current animation window
        const windowSize = Math.min(2000, Math.floor(samplingRate * 8)); // 8 seconds window
        startIdx = Math.max(0, currentTimeIdx - Math.floor(windowSize / 2));
        endIdx = Math.min(endIdx, startIdx + windowSize);
        
        // Adjust if at the end
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
            timeValues.push(i / (samplingRate || 250));
        }
    }
    
    // Get visualization mode and settings
    const modeSelect = document.getElementById('recurrenceMode');
    const colormapSelect = document.getElementById('recurrenceColormap');
    const thresholdInput = document.getElementById('recurrenceThreshold');
    
    const mode = modeSelect ? modeSelect.value : recurrenceMode;
    const colormap = colormapSelect ? colormapSelect.value : recurrenceColormap;
    const threshold = thresholdInput ? parseFloat(thresholdInput.value) : recurrenceThreshold;
    
    let traces = [];
    
    if (mode === 'heatmap') {
        // Create 2D histogram (heatmap)
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
        // Create scatter plot
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
        const currentTime = timePoints && timePoints[currentTimeIdx] ? timePoints[currentTimeIdx] : currentTimeIdx / (samplingRate || 250);
        
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
    
    // Create layout
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
    
    // Plot
    const mainChart = document.getElementById('mainChart');
    if (mainChart) {
        Plotly.newPlot('mainChart', traces, layout, config);
    } else {
        console.error("Main chart element not found");
    }
}

// ============== HELPER FUNCTIONS ==============

// Calculate correlation coefficient
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

// Calculate mutual information (simplified)
function calculateMutualInformation(x, y) {
    if (!x || !y || x.length !== y.length || x.length === 0) return 0;
    
    // Use binning approach for mutual information
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
    
    // Create joint histogram
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
    
    // Calculate mutual information
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
    
    return Math.max(0, mi); // Ensure non-negative
}

// Update small recurrence plot when channels change
function updateSmallRecurrencePlot() {
    if (!eegData || !channelNames || channelNames.length === 0) return;
    
    const channelXSelect = document.getElementById('recurrenceChannelX');
    const channelYSelect = document.getElementById('recurrenceChannelY');
    
    if (channelXSelect) {
        recurrenceChannelX = channelXSelect.value;
    }
    
    if (channelYSelect) {
        recurrenceChannelY = channelYSelect.value;
    }
    
    // Recreate the small plot with new selections
    createRecurrencePlot();
}

// ============== EVENT LISTENERS ==============
function setupRecurrenceEventListeners() {
    // Main recurrence plot controls
    const recChannel1Select = document.getElementById('recurrenceChannel1');
    const recChannel2Select = document.getElementById('recurrenceChannel2');
    const recurrenceModeSelect = document.getElementById('recurrenceMode');
    const recurrenceColormapSelect = document.getElementById('recurrenceColormap');
    const recurrenceThresholdInput = document.getElementById('recurrenceThreshold');
    const updateRecurrenceBtn = document.getElementById('updateRecurrenceBtn');
    
    // Small recurrence plot controls
    const channelXSelect = document.getElementById('recurrenceChannelX');
    const channelYSelect = document.getElementById('recurrenceChannelY');
    
    // Main recurrence channel 1
    if (recChannel1Select) {
        recChannel1Select.addEventListener('change', function() {
            recurrenceChannel1 = this.value;
            const visualizationMode = document.getElementById('visualizationMode');
            if (eegData && visualizationMode && visualizationMode.value === 'recurrence') {
                updateRecurrencePlotMain();
            }
        });
    }
    
    // Main recurrence channel 2
    if (recChannel2Select) {
        recChannel2Select.addEventListener('change', function() {
            recurrenceChannel2 = this.value;
            const visualizationMode = document.getElementById('visualizationMode');
            if (eegData && visualizationMode && visualizationMode.value === 'recurrence') {
                updateRecurrencePlotMain();
            }
        });
    }
    
    // Recurrence mode (scatter/heatmap)
    if (recurrenceModeSelect) {
        recurrenceModeSelect.addEventListener('change', function() {
            recurrenceMode = this.value;
            const visualizationMode = document.getElementById('visualizationMode');
            if (eegData && visualizationMode && visualizationMode.value === 'recurrence') {
                updateRecurrencePlotMain();
            }
        });
    }
    
    // Recurrence colormap
    if (recurrenceColormapSelect) {
        recurrenceColormapSelect.addEventListener('change', function() {
            recurrenceColormap = this.value;
            const visualizationMode = document.getElementById('visualizationMode');
            if (eegData && visualizationMode && visualizationMode.value === 'recurrence') {
                updateRecurrencePlotMain();
            }
        });
    }
    
    // Recurrence threshold
    if (recurrenceThresholdInput) {
        recurrenceThresholdInput.addEventListener('change', function() {
            recurrenceThreshold = parseFloat(this.value) || 0.1;
            const visualizationMode = document.getElementById('visualizationMode');
            if (eegData && visualizationMode && visualizationMode.value === 'recurrence') {
                updateRecurrencePlotMain();
            }
        });
    }
    
    // Update button
    if (updateRecurrenceBtn) {
        updateRecurrenceBtn.addEventListener('click', function() {
            if (eegData) {
                updateRecurrencePlotMain();
            }
        });
    }
    
    // Small recurrence plot - Channel X
    if (channelXSelect) {
        channelXSelect.addEventListener('change', function() {
            recurrenceChannelX = this.value;
            updateSmallRecurrencePlot();
        });
    }
    
    // Small recurrence plot - Channel Y
    if (channelYSelect) {
        channelYSelect.addEventListener('change', function() {
            recurrenceChannelY = this.value;
            updateSmallRecurrencePlot();
        });
    }
    
    console.log("Recurrence event listeners set up");
}

// ============== RESET VISUALIZATION ==============
function resetVisualization() {
    // Reset current time index
    currentTimeIdx = 0;
    
    // Stop any ongoing animation
    if (isAnimating) {
        stopAnimation();
    }
    
    // Clear all charts
    const charts = ['mainChart', 'polarChart', 'recurrenceChart'];
    charts.forEach(chartId => {
        try {
            const chartElement = document.getElementById(chartId);
            if (chartElement && chartElement.data) {
                Plotly.purge(chartElement);
            }
        } catch (e) {
            console.warn(`Could not purge ${chartId}:`, e);
        }
    });
    
    // Reset UI elements
    const timelineSlider = document.getElementById('timelineSlider');
    if (timelineSlider) {
        timelineSlider.value = 0;
    }
    
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        progressBar.style.width = '0%';
    }
    
    // Reset time display
    updateTimeDisplay();
    
    console.log("Visualization reset complete");
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

// ============== UPDATE TIME DISPLAY ==============
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

// ============== UPDATE STATISTICS ==============
function updateStatistics() {
    if (!eegData || !channelNames || channelNames.length === 0) {
        console.warn("No data available for statistics");
        return;
    }
    
    // Get or create statistics display element
    let statsContainer = document.getElementById('statisticsContainer');
    
    if (!statsContainer) {
        // Create statistics container if it doesn't exist
        statsContainer = document.createElement('div');
        statsContainer.id = 'statisticsContainer';
        statsContainer.className = 'row mb-3';
        
        // Try to find a good place to insert it
        const mainContent = document.querySelector('.card-body') || 
                           document.querySelector('.container') || 
                           document.body;
        
        // Insert after channel selection if it exists
        const channelSelection = document.getElementById('channelSelectionContainer');
        if (channelSelection) {
            channelSelection.insertAdjacentElement('afterend', statsContainer);
        } else {
            mainContent.appendChild(statsContainer);
        }
    }
    
    // Calculate statistics for all channels
    const stats = calculateChannelStatistics();
    
    // Create statistics HTML
    statsContainer.innerHTML = `
        <div class="col-12">
            <div class="card">
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
    
    // Add some CSS for stat boxes if not already present
    if (!document.getElementById('statsStyles')) {
        const styleTag = document.createElement('style');
        styleTag.id = 'statsStyles';
        styleTag.innerHTML = `
            .stat-box {
                padding: 15px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 8px;
                color: white;
                text-align: center;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .stat-box small {
                color: rgba(255, 255, 255, 0.8);
                font-size: 0.75rem;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .stat-box h4, .stat-box h5 {
                color: white;
                font-weight: 600;
                margin-top: 5px;
            }
        `;
        document.head.appendChild(styleTag);
    }
}

// ============== CALCULATE CHANNEL STATISTICS ==============
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
    
    // Calculate sampling rate
    let samplingRate = 250; // Default
    if (timePoints.length > 1) {
        const timeDiff = timePoints[1] - timePoints[0];
        samplingRate = timeDiff > 0 ? Math.round(1 / timeDiff) : 250;
    }
    
    // Calculate statistics across all channels
    let allValues = [];
    let sumAmplitude = 0;
    let maxAmplitude = -Infinity;
    let minAmplitude = Infinity;
    
    // Collect all values from all channels
    eegData.forEach(channelData => {
        channelData.forEach(value => {
            allValues.push(Math.abs(value)); // Use absolute values for amplitude
            sumAmplitude += Math.abs(value);
            maxAmplitude = Math.max(maxAmplitude, Math.abs(value));
            minAmplitude = Math.min(minAmplitude, Math.abs(value));
        });
    });
    
    const totalValues = allValues.length;
    const avgAmplitude = totalValues > 0 ? sumAmplitude / totalValues : 0;
    
    // Calculate standard deviation
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

// ============== STOP ANIMATION ==============
function stopAnimation() {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
    isAnimating = false;
    animationFrameCount = 0;
    
    // Update UI
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn) {
        playPauseBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Play Animation';
    }
    
    console.log('Animation stopped');
}

// ============== START ANIMATION ==============
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
        // Safety check
        animationFrameCount++;
        if (animationFrameCount > maxFramesToRender) {
            console.warn('Animation frame limit reached, stopping animation');
            stopAnimation();
            if (playPauseBtn) playPauseBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Play Animation';
            return;
        }
        
        // Simple step size
        const adaptiveStep = Math.max(1, Math.floor(timePoints.length / 5000));
        
        // Check boundary before incrementing
        if (currentTimeIdx < timePoints.length - adaptiveStep * 10) {
            // Move to next time point
            currentTimeIdx += adaptiveStep;
            
            // Update progress indicators
            updateTimeDisplay();
            const progress = (currentTimeIdx / (timePoints.length - 1)) * 100;
            if (timelineSlider) timelineSlider.value = progress;
            if (progressBar) progressBar.style.width = `${progress}%`;
            
            // Update visualizations
            const visualizationMode = document.getElementById('visualizationMode');
            const currentMode = visualizationMode ? visualizationMode.value : 'multichannel';
            
            if (currentMode === 'polar') {
                updatePolarPlotMain(true);
            } else if (currentMode === 'recurrence') {
                updateRecurrencePlotMain(true);
            } else {
                updateVisualizations(true);
            }
            
            // Update small polar plot periodically
            if (animationFrameCount % 5 === 0) {
                createPolarPlot();
            }
            
        } else {
            // End of data reached
            stopAnimation();
            if (playPauseBtn) playPauseBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Play Animation';
        }
    }, animationSpeed);
}

// ============== SETUP SMALL RECURRENCE PLOT CONTROLS ==============
function setupSmallRecurrencePlotControls() {
    // Find or create the recurrence chart container
    const recurrenceChartContainer = document.getElementById('recurrenceChart')?.parentElement;
    if (!recurrenceChartContainer) {
        console.warn("Recurrence chart container not found");
        return;
    }
    
    // Check if controls already exist
    if (document.getElementById('smallRecurrenceControls')) {
        console.log("Small recurrence controls already exist");
        return;
    }
    
    // Create controls for small recurrence plot
    const controlsDiv = document.createElement('div');
    controlsDiv.id = 'smallRecurrenceControls';
    controlsDiv.className = 'mt-2';
    controlsDiv.innerHTML = `
        <div class="row g-2">
            <div class="col-6">
                <label class="form-label" style="font-size: 0.85rem;">Channel X</label>
                <select id="recurrenceChannelX" class="form-select form-select-sm">
                    <!-- Will be populated dynamically -->
                </select>
            </div>
            <div class="col-6">
                <label class="form-label" style="font-size: 0.85rem;">Channel Y</label>
                <select id="recurrenceChannelY" class="form-select form-select-sm">
                    <!-- Will be populated dynamically -->
                </select>
            </div>
        </div>
    `;
    
    // Insert after the recurrence chart
    recurrenceChartContainer.appendChild(controlsDiv);
    
    // Populate the dropdowns
    populateSmallRecurrenceDropdowns();
    
    // Add event listeners
    const channelXSelect = document.getElementById('recurrenceChannelX');
    const channelYSelect = document.getElementById('recurrenceChannelY');
    
    if (channelXSelect) {
        channelXSelect.addEventListener('change', function() {
            recurrenceChannelX = this.value;
            console.log('Small recurrence Channel X changed to:', recurrenceChannelX);
            createRecurrencePlot(); // Update the small plot
        });
    }
    
    if (channelYSelect) {
        channelYSelect.addEventListener('change', function() {
            recurrenceChannelY = this.value;
            console.log('Small recurrence Channel Y changed to:', recurrenceChannelY);
            createRecurrencePlot(); // Update the small plot
        });
    }
    
    console.log("Small recurrence controls set up successfully");
}

// ============== POPULATE SMALL RECURRENCE DROPDOWNS ==============
function populateSmallRecurrenceDropdowns() {
    const channelXSelect = document.getElementById('recurrenceChannelX');
    const channelYSelect = document.getElementById('recurrenceChannelY');
    
    if (!channelXSelect || !channelYSelect) {
        console.warn("Small recurrence dropdowns not found in DOM");
        return;
    }
    
    if (!channelNames || channelNames.length === 0) {
        console.warn("No channel names available");
        return;
    }
    
    // Clear existing options
    channelXSelect.innerHTML = '';
    channelYSelect.innerHTML = '';
    
    // Add options for each channel
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
    
    // Set default selections
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
    
    console.log('Small recurrence dropdowns populated:', recurrenceChannelX, 'vs', recurrenceChannelY);
}