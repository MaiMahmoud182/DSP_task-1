document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('fileInput');
    const fileDisplay = document.getElementById('fileDisplay');
    const uploadBtn = document.getElementById('uploadBtn');
    const detectBtn = document.getElementById('detectBtn');
    const classifyBtn = document.getElementById('classifyBtn');
    const resetBtn = document.getElementById('resetBtn');
    const loading = document.getElementById('loading');
    const resultsSection = document.getElementById('resultsSection');

    // File input display
    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            const file = this.files[0];
            const fileSize = (file.size / (1024 * 1024)).toFixed(2);
            fileDisplay.innerHTML = `
                <i class="bi bi-file-earmark-check me-2 text-success"></i>
                <span>${file.name} (${fileSize} MB)</span>
            `;
        } else {
            fileDisplay.innerHTML = `<i class="bi bi-cloud-upload me-2"></i><span>No file selected</span>`;
        }
    });

    // Upload & Analyze button click
    uploadBtn.addEventListener('click', function() {
        if (!fileInput.files.length) {
            showAlert('Please select a SAR dataset file first', 'warning');
            return;
        }

        const file = fileInput.files[0];
        const fileExtension = file.name.split('.').pop().toLowerCase();
        
        // Validate file type
        const allowedExtensions = ['tif', 'tiff', 'nc'];
        if (!allowedExtensions.includes(fileExtension)) {
            showAlert('Unsupported file type. Please upload TIFF or NetCDF files.', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        // Show loading
        loading.style.display = 'block';
        resultsSection.style.display = 'none';
        
        // Send to Flask backend
        fetch('http://127.0.0.1:5500//api/analyze-sar', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(err.error || `HTTP error! status: ${response.status}`);
                });
            }
            return response.json();
        })
        .then(data => {
            loading.style.display = 'none';
            
            if (data.error) {
                showAlert('Error: ' + data.error, 'error');
                return;
            }

            // Enable buttons
            detectBtn.disabled = false;
            classifyBtn.disabled = false;
            
            // Display results
            displayResults(data);
            showAlert('SAR analysis completed successfully!', 'success');
        })
        .catch(error => {
            loading.style.display = 'none';
            console.error('Error:', error);
            showAlert('An error occurred while processing the file: ' + error.message, 'error');
        });
    });

    // Display results function
    function displayResults(data) {
        resultsSection.style.display = 'block';
        
        let resultsHTML = `
            <div class="visualization-area">
                <h4 class="mb-4">${data.type === 'insar' ? 'InSAR Displacement Analysis' : 'SAR Analysis'} Results</h4>
                
                <!-- File Information -->
                <div class="card mb-4">
                    <div class="card-body">
                        <h5 class="card-title">File Information</h5>
                        <div class="row">
                            <div class="col-md-4">
                                <strong>Filename:</strong> ${data.file_info.filename}
                            </div>
                            <div class="col-md-4">
                                <strong>File Size:</strong> ${data.file_info.size_mb} MB
                            </div>
                            <div class="col-md-4">
                                <strong>Analysis Time:</strong> ${data.file_info.analysis_time}
                            </div>
                        </div>
                        <div class="row mt-2">
                            <div class="col-12">
                                <strong>Analysis Type:</strong> ${data.type === 'insar' ? 'InSAR Displacement' : 'SAR Image'}
                            </div>
                        </div>
                    </div>
                </div>
        `;

        if (data.type === 'insar') {
            // InSAR Results
            resultsHTML += `
                <!-- Displacement Statistics -->
                <div class="card mb-4">
                    <div class="card-body">
                        <h5 class="card-title">Displacement Statistics</h5>
                        <div class="row text-center">
                            <div class="col-md-4 mb-3">
                                <div class="p-3 border rounded bg-primary text-white">
                                    <div class="stat-value">${data.statistics.max_disp} m</div>
                                    <small>Maximum Displacement</small>
                                </div>
                            </div>
                            <div class="col-md-4 mb-3">
                                <div class="p-3 border rounded bg-info text-white">
                                    <div class="stat-value">${data.statistics.min_disp} m</div>
                                    <small>Minimum Displacement</small>
                                </div>
                            </div>
                            <div class="col-md-4 mb-3">
                                <div class="p-3 border rounded bg-success text-white">
                                    <div class="stat-value">${data.statistics.mean_disp} m</div>
                                    <small>Mean Displacement</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- InSAR Visualizations -->
                <h5 class="mb-3">Displacement Visualizations</h5>
                <div class="plot-grid">
                    <div class="plot-card">
                        <h6>Surface Displacement Map</h6>
                        <img src="data:image/png;base64,${data.images.heatmap}" alt="Displacement Heatmap" />
                        <p class="mt-2 text-muted">Color-coded displacement map showing surface deformation in meters.</p>
                    </div>
                    <div class="plot-card">
                        <h6>Displacement Distribution</h6>
                        <img src="data:image/png;base64,${data.images.histogram}" alt="Displacement Histogram" />
                        <p class="mt-2 text-muted">Histogram showing the distribution of displacement values across the scene.</p>
                    </div>
                </div>
            `;
        } else {
            // SAR Results
            resultsHTML += `
                <!-- Metadata Table -->
                <div class="card mb-4">
                    <div class="card-body">
                        <h5 class="card-title">Image Metadata</h5>
                        <div class="table-responsive">
                            <table class="metadata-table">
                                <thead>
                                    <tr>
                                        <th>Property</th>
                                        <th>Value</th>
                                    </tr>
                                </thead>
                                <tbody>
            `;

            // Add metadata rows
            if (data.metadata && data.metadata.length > 0) {
                data.metadata.forEach(item => {
                    // Truncate long values for display
                    let value = String(item.Value);
                    if (value.length > 100) {
                        value = value.substring(0, 100) + '...';
                    }
                    resultsHTML += `
                        <tr>
                            <td><strong>${item.Property}</strong></td>
                            <td>${value}</td>
                        </tr>
                    `;
                });
            } else {
                resultsHTML += `
                    <tr>
                        <td colspan="2" class="text-center text-muted">No metadata available</td>
                    </tr>
                `;
            }

            resultsHTML += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- SAR Visualizations -->
                <h5 class="mb-3">SAR Visualizations</h5>
                <div class="plot-grid">
            `;

            // Add images
            if (data.images) {
                if (data.images.sar_image) {
                    resultsHTML += `
                        <div class="plot-card">
                            <h6>SAR Image (Gray Intensity)</h6>
                            <img src="data:image/png;base64,${data.images.sar_image}" alt="SAR Image" />
                            <p class="mt-2 text-muted">SAR amplitude image in decibel scale.</p>
                        </div>
                    `;
                }
                if (data.images.line_signal) {
                    resultsHTML += `
                        <div class="plot-card">
                            <h6>Center Line Signal</h6>
                            <img src="data:image/png;base64,${data.images.line_signal}" alt="Line Signal" />
                            <p class="mt-2 text-muted">Intensity profile along the center line of the image.</p>
                        </div>
                    `;
                }
                if (data.images.fft_spectrum) {
                    resultsHTML += `
                        <div class="plot-card">
                            <h6>FFT Spectrum</h6>
                            <img src="data:image/png;base64,${data.images.fft_spectrum}" alt="FFT Spectrum" />
                            <p class="mt-2 text-muted">
                                Frequency spectrum analysis.
                                ${data.dominant_frequency ? `<br><strong>Dominant Frequency:</strong> ${data.dominant_frequency.toFixed(6)}` : ''}
                            </p>
                        </div>
                    `;
                }
            }

            resultsHTML += `
                </div>
                
                <!-- Additional Info -->
                <div class="row mt-4">
                    <div class="col-md-6">
                        <div class="alert alert-success">
                            <h6><i class="bi bi-check-circle me-2"></i>Analysis Complete</h6>
                            <p class="mb-0">SAR dataset processed successfully.</p>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="alert alert-info">
                            <h6><i class="bi bi-info-circle me-2"></i>Image Information</h6>
                            <p class="mb-0">Original: ${data.image_size || 'N/A'}<br>
                            Processed: ${data.cropped_size || 'N/A'}</p>
                        </div>
                    </div>
                </div>
            `;
        }

        resultsHTML += `
            </div>
        `;

        resultsSection.innerHTML = resultsHTML;
    }

    // Alert function
    function showAlert(message, type) {
        const alertClass = type === 'error' ? 'alert-danger' : 
                          type === 'warning' ? 'alert-warning' : 'alert-success';
        
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert ${alertClass} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        // Insert at the top of the container
        const container = document.querySelector('.container');
        container.insertBefore(alertDiv, container.firstChild);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentElement) {
                alertDiv.remove();
            }
        }, 5000);
    }

    // Reset functionality
    resetBtn.addEventListener('click', function() {
        fileInput.value = '';
        fileDisplay.innerHTML = `<i class="bi bi-cloud-upload me-2"></i><span>No file selected</span>`;
        detectBtn.disabled = true;
        classifyBtn.disabled = true;
        resultsSection.style.display = 'none';
        loading.style.display = 'none';
        
        // Remove any existing alerts
        document.querySelectorAll('.alert').forEach(alert => alert.remove());
    });

    // Export functionality
    document.getElementById('exportResultsBtn').addEventListener('click', function() {
        if (!fileInput.files.length) {
            showAlert('Please analyze a file first', 'warning');
            return;
        }
        showAlert('Export functionality would be implemented here', 'info');
    });

    // Initialize AOS animations
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 1000,
            easing: 'ease-in-out',
            once: true,
            mirror: false
        });
    }
});