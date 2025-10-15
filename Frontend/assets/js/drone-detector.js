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

// Analyze button click
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
        
        // Use the correct endpoint - both should work now
        const response = await fetch('http://127.0.0.1:5000/upload-drone-audio', {
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

// Display results function - Handles scores that can exceed 100%
function displayResults(data) {
    console.log('Displaying YAMNet results:', data);
    
    const { prediction, confidence_scores, top_classes, confidences } = data;
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
                    <h3>🎯 YAMNet Audio Analysis Results</h3>
                    <p class="text-muted">Scores represent sum of class confidences (can exceed 100%)</p>
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
                            <div class="confidence-label">Total Category Score</div>
                            ${maxScore > 1.0 ? '<small class="text-muted">(Sum of multiple class confidences)</small>' : ''}
                        </div>
                        ${prediction === 'DRONE' ? 
                            '<div class="alert alert-success mt-3 mb-0"><strong>Drone activity detected!</strong> Multiple aircraft-related sounds identified.</div>' : 
                            prediction === 'BIRD' ?
                            '<div class="alert alert-warning mt-3 mb-0"><strong>Bird sounds detected.</strong> Multiple bird-related sounds identified.</div>' :
                            '<div class="alert alert-secondary mt-3 mb-0"><strong>Background noise detected.</strong> No significant drone or bird patterns.</div>'
                        }
                    </div>
                </div>
            </div>
            
            <!-- Confidence Scores -->
            <div class="col-md-6 mb-4">
                <div class="card info-card">
                    <div class="card-body">
                        <h5 class="card-title">Category Confidence Scores</h5>
                        <div class="score-explanation mb-3">
                            <small class="text-muted">
                                Scores are sums of individual class confidences from YAMNet's top 10 predictions
                            </small>
                        </div>
                        <div class="confidence-bars">
                            <div class="confidence-bar-item ${prediction === 'DRONE' ? 'active-category' : ''}">
                                <div class="bar-label">Drone</div>
                                <div class="progress">
                                    <div class="progress-bar bg-success" style="width: ${displayDrone}%"></div>
                                </div>
                                <div class="bar-value">${(confidence_scores.drone * 100).toFixed(1)}%</div>
                            </div>
                            <div class="confidence-bar-item ${prediction === 'BIRD' ? 'active-category' : ''}">
                                <div class="bar-label">Bird</div>
                                <div class="progress">
                                    <div class="progress-bar bg-warning" style="width: ${displayBird}%"></div>
                                </div>
                                <div class="bar-value">${(confidence_scores.bird * 100).toFixed(1)}%</div>
                            </div>
                            <div class="confidence-bar-item ${prediction === 'NOISE' ? 'active-category' : ''}">
                                <div class="bar-label">Noise</div>
                                <div class="progress">
                                    <div class="progress-bar bg-secondary" style="width: ${displayNoise}%"></div>
                                </div>
                                <div class="bar-value">${(confidence_scores.noise * 100).toFixed(1)}%</div>
                            </div>
                        </div>
                        <div class="mt-3">
                            <small class="text-muted">Detection threshold: > 10% total category score</small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Category Class Confidences
    if (confidences) {
        resultsHTML += `
            <div class="row mt-4">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title">Individual Class Confidences</h5>
                            <div class="class-confidences">
        `;
        
        // Show drone classes
        const droneClasses = ['Aircraft', 'Helicopter', 'Fixed-wing aircraft, airplane', 'Propeller, airscrew', 'Motor vehicle (road)'];
        resultsHTML += `<div class="category-section"><h6>Drone Classes</h6>`;
        droneClasses.forEach(className => {
            const confidence = confidences[className] || 0;
            const confidencePercent = (confidence * 100).toFixed(1);
            if (confidence > 0) {
                resultsHTML += `
                    <div class="class-confidence-item">
                        <span class="class-name">${className}</span>
                        <div class="class-confidence-bar">
                            <div class="confidence-bar bg-success" style="width: ${confidencePercent}%"></div>
                        </div>
                        <span class="class-confidence-value">${confidencePercent}%</span>
                    </div>
                `;
            }
        });
        resultsHTML += `</div>`;
        
        // Show bird classes
        const birdClasses = ['Bird', 'Bird vocalization, bird call, bird song', 'Chirp, tweet', 'Caw', 'Crow', 'Pigeon, dove'];
        resultsHTML += `<div class="category-section"><h6>Bird Classes</h6>`;
        birdClasses.forEach(className => {
            const confidence = confidences[className] || 0;
            const confidencePercent = (confidence * 100).toFixed(1);
            if (confidence > 0) {
                resultsHTML += `
                    <div class="class-confidence-item">
                        <span class="class-name">${className}</span>
                        <div class="class-confidence-bar">
                            <div class="confidence-bar bg-warning" style="width: ${confidencePercent}%"></div>
                        </div>
                        <span class="class-confidence-value">${confidencePercent}%</span>
                    </div>
                `;
            }
        });
        resultsHTML += `</div>`;
        
        // Show noise classes
        const noiseClasses = ['Wind noise (microphone)', 'Static', 'White noise', 'Pink noise', 'Hum', 'Environmental noise'];
        resultsHTML += `<div class="category-section"><h6>Noise Classes</h6>`;
        noiseClasses.forEach(className => {
            const confidence = confidences[className] || 0;
            const confidencePercent = (confidence * 100).toFixed(1);
            if (confidence > 0) {
                resultsHTML += `
                    <div class="class-confidence-item">
                        <span class="class-name">${className}</span>
                        <div class="class-confidence-bar">
                            <div class="confidence-bar bg-secondary" style="width: ${confidencePercent}%"></div>
                        </div>
                        <span class="class-confidence-value">${confidencePercent}%</span>
                    </div>
                `;
            }
        });
        resultsHTML += `</div>`;
        
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
                            <h5 class="card-title">Top 5 YAMNet Detections</h5>
                            <div class="top-classes">
        `;
        
        top_classes.forEach(([className, confidence], index) => {
            const confidencePercent = (confidence * 100).toFixed(1);
            const category = getCategoryForClass(className);
            let badgeClass = 'bg-secondary';
            let badgeText = 'Other';
            
            if (category === 'drone') {
                badgeClass = 'bg-success';
                badgeText = 'Drone';
            } else if (category === 'bird') {
                badgeClass = 'bg-warning';
                badgeText = 'Bird';
            } else if (category === 'noise') {
                badgeClass = 'bg-info';
                badgeText = 'Noise';
            }
            
            resultsHTML += `
                <div class="top-class-item ${category}">
                    <span class="class-name">
                        <strong>${index + 1}.</strong> ${className}
                        <span class="badge ${badgeClass}">${badgeText}</span>
                    </span>
                    <div class="class-confidence">
                        <div class="progress">
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
    if (data.audio_info) {
        resultsHTML += `
            <div class="row mt-4">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title">Audio Information</h5>
                            <div class="audio-info-grid">
                                <div class="audio-info-item">
                                    <span class="info-label">File Type:</span>
                                    <span class="info-value">${data.audio_info.file_type}</span>
                                </div>
                                <div class="audio-info-item">
                                    <span class="info-label">File Size:</span>
                                    <span class="info-value">${data.audio_info.file_size}</span>
                                </div>
                                <div class="audio-info-item">
                                    <span class="info-label">Analysis Time:</span>
                                    <span class="info-value">${data.audio_info.analysis_time}</span>
                                </div>
                                <div class="audio-info-item">
                                    <span class="info-label">Model:</span>
                                    <span class="info-value">YAMNet (TensorFlow Hub)</span>
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
    const droneClasses = ['Aircraft', 'Helicopter', 'Fixed-wing aircraft, airplane', 'Propeller, airscrew', 'Motor vehicle (road)'];
    const birdClasses = ['Bird', 'Bird vocalization, bird call, bird song', 'Chirp, tweet', 'Caw', 'Crow', 'Pigeon, dove'];
    const noiseClasses = ['Wind noise (microphone)', 'Static', 'White noise', 'Pink noise', 'Hum', 'Environmental noise'];
    
    const lowerClassName = className.toLowerCase();
    
    if (droneClasses.some(cls => lowerClassName.includes(cls.toLowerCase()))) return 'drone';
    if (birdClasses.some(cls => lowerClassName.includes(cls.toLowerCase()))) return 'bird';
    if (noiseClasses.some(cls => lowerClassName.includes(cls.toLowerCase()))) return 'noise';
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

// Export results button (placeholder)
exportResultsBtn.addEventListener('click', function() {
    alert('Export feature coming soon!');
});

// Advanced analysis button (placeholder)
advancedAnalysisBtn.addEventListener('click', function() {
    alert('Advanced analysis feature coming soon!');
});
