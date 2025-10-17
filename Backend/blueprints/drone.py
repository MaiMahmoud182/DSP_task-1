from flask import Blueprint, request, jsonify
import logging
from datetime import datetime
import random

# Create blueprint
drone_bp = Blueprint('drone', __name__, url_prefix='/api/drone')

# Drone detection configuration
DRONE_CLASSES = [
    'Aircraft', 'Helicopter', 'Fixed-wing aircraft, airplane',
    'Propeller, airscrew', 'Motor vehicle (road)'
]

BIRD_CLASSES = [
    'Bird', 'Bird vocalization, bird call, bird song',
    'Chirp, tweet', 'Caw', 'Crow', 'Pigeon, dove'
]

NOISE_CLASSES = [
    'Wind noise (microphone)', 'Static', 'White noise',
    'Pink noise', 'Hum', 'Environmental noise'
]

OTHER_CLASSES = [
    'Speech', 'Music', 'Vehicle', 'Engine', 'Tools', 'Drill',
    'Buzz', 'Rain', 'Water', 'Wind', 'Footsteps', 'Silence',
    'Conversation', 'Laughter', 'Clapping'
]

ALL_CLASSES = DRONE_CLASSES + BIRD_CLASSES + NOISE_CLASSES + OTHER_CLASSES

# Configure logger
logger = logging.getLogger(__name__)

def init_drone_blueprint(app):
    """Initialize Drone blueprint"""
    return drone_bp

def allowed_file_audio(filename):
    if '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()
    return ext in {'mp3', 'wav', 'ogg', 'm4a', 'flac'}

def simulate_yamnet_analysis(filename, file_size):
    """Simulate YAMNet analysis with proper confidence score distribution"""
    
    # Create consistent results based on filename
    file_hash = sum(ord(c) for c in filename) % 100
    random.seed(file_hash)
    
    # Determine pattern type based on filename
    filename_lower = filename.lower()
    if "drone" in filename_lower or "helicopter" in filename_lower or "aircraft" in filename_lower:
        pattern = 'drone'
    elif "bird" in filename_lower or "chirp" in filename_lower or "crow" in filename_lower:
        pattern = 'bird'
    elif "noise" in filename_lower or "static" in filename_lower or "wind" in filename_lower:
        pattern = 'noise'
    else:
        # Random distribution
        if file_hash < 30:
            pattern = 'drone'
        elif file_hash < 60:
            pattern = 'bird'
        else:
            pattern = 'noise'
    
    # Generate top 10 class predictions with proper probability distribution
    base_scores = []
    remaining_prob = 0.9
    
    for i in range(10):
        if i == 9:
            # Last score gets whatever remains
            score = remaining_prob
        else:
            # Generate decreasing scores (typical for classification models)
            max_score = remaining_prob * 0.8  # Leave some for remaining classes
            score = random.uniform(0.05, max_score)
            remaining_prob -= score
        base_scores.append(score)
    
    # Shuffle and sort to get typical distribution (highest first)
    random.shuffle(base_scores)
    base_scores.sort(reverse=True)
    
    # Now assign these scores to classes based on pattern
    top_classes = []
    drone_score = 0.0
    bird_score = 0.0
    noise_score = 0.0
    
    # Available classes for each pattern (we'll pick from these)
    if pattern == 'drone':
        primary_classes = DRONE_CLASSES
        secondary_classes = NOISE_CLASSES + OTHER_CLASSES
        tertiary_classes = BIRD_CLASSES
    elif pattern == 'bird':
        primary_classes = BIRD_CLASSES
        secondary_classes = NOISE_CLASSES + OTHER_CLASSES
        tertiary_classes = DRONE_CLASSES
    else:  # noise
        primary_classes = NOISE_CLASSES
        secondary_classes = OTHER_CLASSES
        tertiary_classes = DRONE_CLASSES + BIRD_CLASSES
    
    # Assign scores to classes
    for i, score in enumerate(base_scores):
        if i < 3:  # Top 3 scores go to primary classes
            class_name = random.choice(primary_classes)
        elif i < 7:  # Next 4 scores go to secondary classes
            class_name = random.choice(secondary_classes)
        else:  # Last 3 scores go to tertiary classes
            class_name = random.choice(tertiary_classes)
        
        # Add some small random variation
        final_score = score * random.uniform(0.9, 1.1)
        final_score = max(0.01, min(0.5, final_score))  # Keep in reasonable range
        
        top_classes.append((class_name, final_score))
        
        # Sum scores for categories (EXACTLY like your Python code)
        if any(drone_class.lower() in class_name.lower() for drone_class in DRONE_CLASSES):
            drone_score += final_score
        elif any(bird_class.lower() in class_name.lower() for bird_class in BIRD_CLASSES):
            bird_score += final_score
        elif any(noise_class.lower() in class_name.lower() for noise_class in NOISE_CLASSES):
            noise_score += final_score
    
    # Sort top classes by score (highest first)
    top_classes.sort(key=lambda x: x[1], reverse=True)
    
    # Get top 5 for display
    display_top_classes = top_classes[:5]
    
    # Final prediction (EXACTLY like your Python code)
    max_score = max(drone_score, bird_score, noise_score)
    
    if max_score == drone_score and drone_score > 0.1:
        prediction = "DRONE"
    elif max_score == bird_score and bird_score > 0.1:
        prediction = "BIRD"
    else:
        prediction = "NOISE"
    
    # Create confidences dict for all relevant classes
    confidences = {}
    for class_name in DRONE_CLASSES + BIRD_CLASSES + NOISE_CLASSES:
        # Find if this class was in top predictions
        found_score = 0.0
        for cls, score in top_classes:
            if cls == class_name:
                found_score = score
                break
        confidences[class_name] = found_score
    
    # Debug output
    total_top_score = sum(score for _, score in top_classes)
    logger.info(f"File: {filename}")
    logger.info(f"Pattern: {pattern}, Prediction: {prediction}")
    logger.info(f"Total top 10 score: {total_top_score:.3f}")
    logger.info(f"Category Scores - Drone: {drone_score:.3f}, Bird: {bird_score:.3f}, Noise: {noise_score:.3f}")
    logger.info(f"Top 5 classes: {display_top_classes}")
    
    return {
        'prediction': prediction,
        'confidence_scores': {
            'drone': round(drone_score, 4),
            'bird': round(bird_score, 4),
            'noise': round(noise_score, 4)
        },
        'confidences': {k: round(v, 4) for k, v in confidences.items()},
        'top_classes': [(cls, round(score, 4)) for cls, score in display_top_classes]
    }

# ============== DRONE API ROUTES ==============

@drone_bp.route('/health', methods=['GET'])
def drone_health_check():
    """Health check for Drone module"""
    return jsonify({
        'status': 'healthy',
        'message': 'Drone Detection API is running!'
    })

@drone_bp.route('/detect', methods=['POST'])
def detect_drone():
    """Detect drone from audio"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    try:
        if not allowed_file_audio(file.filename):
            return jsonify({'error': 'Unsupported file format. Use MP3, WAV, or OGG'}), 400
        
        # Read file to get size
        file_content = file.read()
        file_size = len(file_content)
        
        # Generate detection results matching your Python logic
        results = simulate_yamnet_analysis(file.filename, file_size)
        
        return jsonify({
            'success': True,
            'prediction': results['prediction'],
            'confidence_scores': results['confidence_scores'],
            'confidences': results['confidences'],
            'top_classes': results['top_classes'],
            'audio_info': {
                'file_type': file.filename.split('.')[-1].upper(),
                'file_size': f"{file_size} bytes", 
                'analysis_time': datetime.now().strftime("%H:%M:%S")
            }
        })
        
    except Exception as e:
        logger.error(f"Drone detection error: {str(e)}")
        return jsonify({'error': f'Failed to process audio: {str(e)}'}), 500

@drone_bp.route('/analyze', methods=['POST'])
def analyze_audio():
    """Analyze audio file for drone detection"""
    return detect_drone()  # Alias for detect endpoint

@drone_bp.route('/classes', methods=['GET'])
def get_detection_classes():
    """Get available detection classes"""
    return jsonify({
        'drone_classes': DRONE_CLASSES,
        'bird_classes': BIRD_CLASSES,
        'noise_classes': NOISE_CLASSES,
        'other_classes': OTHER_CLASSES
    })