from flask import Blueprint, request, jsonify
import os
import numpy as np
import logging
from tifffile import TiffFile
import xarray as xr

# Create blueprint
sar_bp = Blueprint('sar', __name__, url_prefix='/api/sar')

# SAR Configuration
ALLOWED_SAR_EXT = {'.tif', '.tiff', '.nc', '.TIFF'}

def init_sar_blueprint(app):
    """Initialize SAR blueprint"""
    return sar_bp

@sar_bp.route('/health', methods=['GET'])
def sar_health_check():
    """Health check for SAR module"""
    return jsonify({
        'status': 'healthy',
        'message': 'SAR Analysis API is running!'
    })

@sar_bp.route('/analyze', methods=['POST'])
def analyze_sar():
    """Analyze SAR data"""
    # Your existing SAR analysis logic here
    pass

def allowed_sar_file(filename):
    if '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()
    return ext in ALLOWED_SAR_EXT

def process_insar_file(file_path):
    # Your existing InSAR processing logic
    pass

logger = logging.getLogger(__name__)