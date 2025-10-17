// DOM Elements
const fileInput = document.getElementById('fileInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const playAudioBtn = document.getElementById('playAudioBtn');
const advancedAnalysisBtn = document.getElementById('advancedAnalysisBtn');
const resetBtn = document.getElementById('resetBtn');
const exportResultsBtn = document.getElementById('exportResultsBtn');
const loading = document.getElementById('loading');
const resultsSection = document.getElementById('resultsSection');
const audioPlayer = document.getElementById('audioPlayer');

// Audio info elements
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const fileDuration = document.getElementById('fileDuration');
const fileFormat = document.getElementById('fileFormat');

// File input display
const fileDisplay = document.getElementById('fileDisplay');

// Update file display when file is selected
fileInput.addEventListener('change', function() {
    if (this.files.length > 0) {
        const file = this.files[0];
        fileDisplay.innerHTML = `<i class="bi bi-file-earmark-music me-2"></i><span>${file.name}</span>`;
        
        // Update audio info
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);
        fileFormat.textContent = file.type || 'Unknown';
        fileDuration.textContent = 'Calculating...';
        
        // Enable play button if it's an audio file
        playAudioBtn.disabled = !file.type.startsWith('audio/');
        
        // Create object URL for audio playback
        if (file.type.startsWith('audio/')) {
            const objectUrl = URL.createObjectURL(file);
            audioPlayer.src = objectUrl;
            
            // Try to get duration
            audioPlayer.addEventListener('loadedmetadata', function() {
                if (audioPlayer.duration && isFinite(audioPlayer.duration)) {
                    fileDuration.textContent = formatDuration(audioPlayer.duration);
                } else {
                    fileDuration.textContent = 'Unknown';
                }
            });
            
            // If metadata already loaded
            if (audioPlayer.duration && isFinite(audioPlayer.duration)) {
                fileDuration.textContent = formatDuration(audioPlayer.duration);
            }
        }
    } else {
        fileDisplay.innerHTML = `<i class="bi bi-cloud-upload me-2"></i><span>Choose File</span>`;
        resetAudioInfo();
    }
});

// Play audio button
playAudioBtn.addEventListener('click', function() {
    if (audioPlayer.src && audioPlayer.src.startsWith('blob:')) {
        audioPlayer.play().catch(e => {
            console.error('Error playing audio:', e);
            alert('Error playing audio file');
        });
    }
});

// Reset button
resetBtn.addEventListener('click', function() {
    fileInput.value = '';
    fileDisplay.innerHTML = `<i class="bi bi-cloud-upload me-2"></i><span>Choose File</span>`;
    resultsSection.style.display = 'none';
    resetAudioInfo();
    playAudioBtn.disabled = true;
    advancedAnalysisBtn.disabled = true;
    if (audioPlayer.src) {
        URL.revokeObjectURL(audioPlayer.src);
        audioPlayer.src = '';
    }
});

// Analyze button click - UPDATED FOR BLUEPRINT STRUCTURE
analyzeBtn.addEventListener('click', async function() {
    if (!fileInput.files.length) {
        alert('Please select an audio file first');
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    // Show loading
    loading.style.display = 'block';
    resultsSection.style.display = 'none';
    analyzeBtn.disabled = true;
    
    console.log('Sending file to server:', file.name, 'Size:', file.size, 'Type:', file.type);
    
    try {
        // Send to Flask backend with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        // UPDATED: Use the new blueprint endpoint
        const response = await fetch('http://127.0.0.1:5000/api/drone/detect', {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        console.log('Response status:', response.status, 'OK:', response.ok);
        
        if (!response.ok) {
            let errorText = '';
            try {
                // Try JSON first
                const errorData = await response.clone().json();
                errorText = errorData.error || JSON.stringify(errorData);
            } catch {
                // Fallback to text if not JSON
                errorText = await response.text();
            }
            throw new Error(errorText || `Server error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Response data:', data);
        
        loading.style.display = 'none';
        analyzeBtn.disabled = false;
        
        if (data.error) {
            alert('Error: ' + data.error);
            return;
        }

        // Enable advanced analysis button
        advancedAnalysisBtn.disabled = false;
        
        // Display results directly from YAMNet analysis
        displayResults(data);
        
    } catch (error) {
        console.error('Fetch error:', error);
        loading.style.display = 'none';
        analyzeBtn.disabled = false;
        
        if (error.name === 'AbortError') {
            alert('Error: Request timed out. Please try again.');
        } else {
            alert('Error: ' + (error.message || 'Failed to process file'));
        }
    }
});

// NEW: Function to get available detection classes
async function loadDetectionClasses() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/drone/classes');
        if (response.ok) {
            const data = await response.json();
            console.log('Available detection classes:', data);
            return data;
        }
    } catch (error) {
        console.error('Failed to load detection classes:', error);
    }
    return null;
}

// Display results function - Handles scores that can exceed 100%
function displayResults(data) {
    console.log('Displaying YAMNet results:', data);
    
    const { prediction, confidence_scores, top_classes, confidences, audio_info } = data;
    const maxScore = Math.max(confidence_scores.drone, confidence_scores.bird, confidence_scores.noise);
    
    // Calculate percentage for display (cap at 100% for visualization)
    const displayDrone = Math.min(100, (confidence_scores.drone * 100));
    const displayBird = Math.min(100, (confidence_scores.bird * 100));
    const displayNoise = Math.min(100, (confidence_scores.noise * 100));
    const displayMax = Math.min(100, (maxScore * 100));
    
    // Show results section
    resultsSection.style.display = 'block';
    
    // Create results HTML
    let resultsHTML = `
        <div class="row">
            <div class="col-12">
                <div class="results-header text-center mb-4">
                    <h3>🎯 Drone Detection Analysis Results</h3>
                    <p class="text-muted">Powered by YAMNet Audio Classification</p>
                </div>
            </div>
        </div>
        
        <div class="row">
            <!-- Main Result -->
            <div class="col-md-6 mb-4">
                <div class="card result-card ${prediction === 'DRONE' ? 'drone-detected' : prediction === 'BIRD' ? 'bird-detected' : 'noise-detected'}">
                    <div class="card-body text-center">
                        <div class="result-icon mb-3">
                            ${prediction === 'DRONE' ? '🚁' : prediction === 'BIRD' ? '🐦' : '🔇'}
                        </div>
                        <h4 class="card-title">${prediction === 'DRONE' ? '🚁 DRONE DETECTED' : prediction === 'BIRD' ? '🐦 BIRD DETECTED' : '🔇 BACKGROUND NOISE'}</h4>
                        <div class="confidence-display">
                            <div class="confidence-value ${prediction === 'DRONE' ? 'text-success' : prediction === 'BIRD' ? 'text-warning' : 'text-secondary'}">
                                ${(maxScore * 100).toFixed(1)}%
                            </div>
                            <div class="confidence-label">Category Confidence</div>
                        </div>
                        ${prediction === 'DRONE' ? 
                            '<div class="alert alert-success mt-3 mb-0"><strong>Drone activity detected!</strong> Aircraft-related sounds identified in the audio.</div>' : 
                            prediction === 'BIRD' ?
                            '<div class="alert alert-warning mt-3 mb-0"><strong>Bird sounds detected.</strong> Bird-related vocalizations identified.</div>' :
                            '<div class="alert alert-secondary mt-3 mb-0"><strong>Background noise detected.</strong> No significant drone or bird patterns found.</div>'
                        }
                    </div>
                </div>
            </div>
            
            <!-- Confidence Scores -->
            <div class="col-md-6 mb-4">
                <div class="card info-card">
                    <div class="card-body">
                        <h5 class="card-title">Detection Confidence Scores</h5>
                        <div class="score-explanation mb-3">
                            <small class="text-muted">
                                Scores represent confidence levels for each category
                            </small>
                        </div>
                        <div class="confidence-bars">
                            <div class="confidence-bar-item ${prediction === 'DRONE' ? 'active-category' : ''}">
                                <div class="bar-label">
                                    <i class="bi bi-airplane me-1"></i>Drone
                                </div>
                                <div class="progress">
                                    <div class="progress-bar bg-success" style="width: ${displayDrone}%"></div>
                                </div>
                                <div class="bar-value">${(confidence_scores.drone * 100).toFixed(1)}%</div>
                            </div>
                            <div class="confidence-bar-item ${prediction === 'BIRD' ? 'active-category' : ''}">
                                <div class="bar-label">
                                    <i class="bi bi-bird me-1"></i>Bird
                                </div>
                                <div class="progress">
                                    <div class="progress-bar bg-warning" style="width: ${displayBird}%"></div>
                                </div>
                                <div class="bar-value">${(confidence_scores.bird * 100).toFixed(1)}%</div>
                            </div>
                            <div class="confidence-bar-item ${prediction === 'NOISE' ? 'active-category' : ''}">
                                <div class="bar-label">
                                    <i class="bi bi-volume-mute me-1"></i>Noise
                                </div>
                                <div class="progress">
                                    <div class="progress-bar bg-secondary" style="width: ${displayNoise}%"></div>
                                </div>
                                <div class="bar-value">${(confidence_scores.noise * 100).toFixed(1)}%</div>
                            </div>
                        </div>
                        <div class="mt-3">
                            <small class="text-muted">Detection threshold: > 10% category confidence</small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Individual Class Confidences
    if (confidences && Object.keys(confidences).length > 0) {
        resultsHTML += `
            <div class="row mt-4">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title">Detailed Class Analysis</h5>
                            <div class="class-confidences">
        `;
        
        // Group classes by category
        const droneClasses = [];
        const birdClasses = [];
        const noiseClasses = [];
        const otherClasses = [];
        
        Object.entries(confidences).forEach(([className, confidence]) => {
            if (confidence > 0) {
                const category = getCategoryForClass(className);
                const item = { className, confidence, confidencePercent: (confidence * 100).toFixed(1) };
                
                switch(category) {
                    case 'drone':
                        droneClasses.push(item);
                        break;
                    case 'bird':
                        birdClasses.push(item);
                        break;
                    case 'noise':
                        noiseClasses.push(item);
                        break;
                    default:
                        otherClasses.push(item);
                }
            }
        });
        
        // Sort by confidence (descending)
        const sortByConfidence = (a, b) => b.confidence - a.confidence;
        droneClasses.sort(sortByConfidence);
        birdClasses.sort(sortByConfidence);
        noiseClasses.sort(sortByConfidence);
        otherClasses.sort(sortByConfidence);
        
        // Display drone classes
        if (droneClasses.length > 0) {
            resultsHTML += `
                <div class="category-section">
                    <h6><i class="bi bi-airplane text-success me-2"></i>Drone-Related Classes</h6>
            `;
            droneClasses.forEach(item => {
                resultsHTML += `
                    <div class="class-confidence-item">
                        <span class="class-name">${item.className}</span>
                        <div class="class-confidence-bar">
                            <div class="confidence-bar bg-success" style="width: ${item.confidencePercent}%"></div>
                        </div>
                        <span class="class-confidence-value">${item.confidencePercent}%</span>
                    </div>
                `;
            });
            resultsHTML += `</div>`;
        }
        
        // Display bird classes
        if (birdClasses.length > 0) {
            resultsHTML += `
                <div class="category-section">
                    <h6><i class="bi bi-bird text-warning me-2"></i>Bird-Related Classes</h6>
            `;
            birdClasses.forEach(item => {
                resultsHTML += `
                    <div class="class-confidence-item">
                        <span class="class-name">${item.className}</span>
                        <div class="class-confidence-bar">
                            <div class="confidence-bar bg-warning" style="width: ${item.confidencePercent}%"></div>
                        </div>
                        <span class="class-confidence-value">${item.confidencePercent}%</span>
                    </div>
                `;
            });
            resultsHTML += `</div>`;
        }
        
        // Display noise classes
        if (noiseClasses.length > 0) {
            resultsHTML += `
                <div class="category-section">
                    <h6><i class="bi bi-volume-mute text-secondary me-2"></i>Noise Classes</h6>
            `;
            noiseClasses.forEach(item => {
                resultsHTML += `
                    <div class="class-confidence-item">
                        <span class="class-name">${item.className}</span>
                        <div class="class-confidence-bar">
                            <div class="confidence-bar bg-secondary" style="width: ${item.confidencePercent}%"></div>
                        </div>
                        <span class="class-confidence-value">${item.confidencePercent}%</span>
                    </div>
                `;
            });
            resultsHTML += `</div>`;
        }
        
        resultsHTML += `
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Top Detected Classes
    if (top_classes && top_classes.length > 0) {
        resultsHTML += `
            <div class="row mt-4">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title">Top 5 Detected Sounds</h5>
                            <div class="top-classes">
        `;
        
        top_classes.forEach(([className, confidence], index) => {
            const confidencePercent = (confidence * 100).toFixed(1);
            const category = getCategoryForClass(className);
            let badgeClass = 'bg-secondary';
            let badgeText = 'Other';
            let icon = 'bi-music-note';
            
            if (category === 'drone') {
                badgeClass = 'bg-success';
                badgeText = 'Drone';
                icon = 'bi-airplane';
            } else if (category === 'bird') {
                badgeClass = 'bg-warning';
                badgeText = 'Bird';
                icon = 'bi-bird';
            } else if (category === 'noise') {
                badgeClass = 'bg-info';
                badgeText = 'Noise';
                icon = 'bi-volume-mute';
            }
            
            resultsHTML += `
                <div class="top-class-item ${category}">
                    <span class="class-name">
                        <i class="bi ${icon} me-2"></i>
                        <strong>${index + 1}.</strong> ${className}
                        <span class="badge ${badgeClass} ms-2">${badgeText}</span>
                    </span>
                    <div class="class-confidence">
                        <div class="progress" style="width: 150px;">
                            <div class="progress-bar ${badgeClass}" 
                                 role="progressbar" 
                                 style="width: ${confidencePercent}%">
                            </div>
                        </div>
                        <span class="confidence-percent">
                            ${confidencePercent}%
                        </span>
                    </div>
                </div>
            `;
        });
        
        resultsHTML += `
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Audio Information
    if (audio_info) {
        resultsHTML += `
            <div class="row mt-4">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title">Analysis Information</h5>
                            <div class="audio-info-grid">
                                <div class="audio-info-item">
                                    <span class="info-label">File Type:</span>
                                    <span class="info-value">${audio_info.file_type}</span>
                                </div>
                                <div class="audio-info-item">
                                    <span class="info-label">File Size:</span>
                                    <span class="info-value">${audio_info.file_size}</span>
                                </div>
                                <div class="audio-info-item">
                                    <span class="info-label">Analysis Time:</span>
                                    <span class="info-value">${audio_info.analysis_time}</span>
                                </div>
                                <div class="audio-info-item">
                                    <span class="info-label">Detection Model:</span>
                                    <span class="info-value">YAMNet Audio Classification</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Set the results HTML
    resultsSection.innerHTML = resultsHTML;
    
    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Helper function to get category for a class
function getCategoryForClass(className) {
    const droneClasses = ['aircraft', 'helicopter', 'fixed-wing', 'propeller', 'airscrew', 'motor vehicle', 'engine'];
    const birdClasses = ['bird', 'vocalization', 'chirp', 'tweet', 'caw', 'crow', 'pigeon', 'dove', 'song'];
    const noiseClasses = ['wind', 'static', 'white noise', 'pink noise', 'hum', 'environmental', 'background'];
    
    const lowerClassName = className.toLowerCase();
    
    if (droneClasses.some(cls => lowerClassName.includes(cls))) return 'drone';
    if (birdClasses.some(cls => lowerClassName.includes(cls))) return 'bird';
    if (noiseClasses.some(cls => lowerClassName.includes(cls))) return 'noise';
    return 'other';
}

// Utility functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function resetAudioInfo() {
    fileName.textContent = '-';
    fileSize.textContent = '-';
    fileDuration.textContent = '-';
    fileFormat.textContent = '-';
}

// Export results button
exportResultsBtn.addEventListener('click', function() {
    if (!fileInput.files.length) {
        alert('Please analyze a file first');
        return;
    }
    
    // Create a simple export of the results
    const exportData = {
        fileName: fileInput.files[0].name,
        analysisTime: new Date().toLocaleString(),
        results: resultsSection.textContent
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drone-analysis-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('Results exported successfully!');
});

// Advanced analysis button
advancedAnalysisBtn.addEventListener('click', function() {
    alert('Advanced spectral analysis and pattern recognition features coming soon!');
});

// Load available classes when page loads
document.addEventListener('DOMContentLoaded', function() {
    loadDetectionClasses().then(classes => {
        if (classes) {
            console.log('Detection classes loaded successfully');
        }
    });
});