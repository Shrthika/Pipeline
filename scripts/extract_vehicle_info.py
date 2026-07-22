import sys
import json
import os
import cv2
import numpy as np
import warnings

# Suppress Python & PyTorch warning logs
warnings.filterwarnings('ignore')
os.environ['YOLO_VERBOSE'] = 'False'

import easyocr
from ultralytics import YOLO

# Initialize EasyOCR reader silently
reader = easyocr.Reader(['en'], gpu=False, verbose=False)

# Load standard YOLOv8 model
model = YOLO('yolov8n.pt') 

def preprocess_plate_crop(crop):
    """Enhance low-resolution plate text before OCR."""
    if crop is None or crop.size == 0:
        return crop
    
    # 1. Convert to grayscale
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    
    # 2. Upscale 2x for better character recognition
    resized = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    
    # 3. Apply Adaptive Thresholding
    thresh = cv2.adaptiveThreshold(
        resized, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    
    # 4. Convert back to 3-channel (BGR) so EasyOCR handles it properly
    processed_bgr = cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR)
    return processed_bgr

def analyze_image(image_path):
    results = {
        "vehicleType": "Unknown",
        "pythonPlateText": "Not Found"
    }

    if not os.path.exists(image_path):
        return results

    img = cv2.imread(image_path)
    if img is None:
        return results

    # 1. Run YOLO Object Detection
    yolo_results = model(image_path, verbose=False)[0]
    
    detected_classes = []

    for box in yolo_results.boxes:
        cls_id = int(box.cls[0])
        class_name = model.names[cls_id]
        confidence = float(box.conf[0])

        if confidence > 0.25:
            detected_classes.append(class_name)

    # Vehicle classification logic
    if 'car' in detected_classes:
        results["vehicleType"] = "Car"
    elif 'bus' in detected_classes:
        results["vehicleType"] = "Bus"
    elif 'truck' in detected_classes:
        results["vehicleType"] = "Truck"
    elif 'motorcycle' in detected_classes or 'bicycle' in detected_classes:
        results["vehicleType"] = "Auto-Rickshaw / Two-Wheeler"
    else:
        # Fallback default if image contains a vehicle not labeled in standard COCO
        results["vehicleType"] = "Auto-Rickshaw (Three-Wheeler)"

    # 2. Extract Plate Region & Apply EasyOCR
    h, w, _ = img.shape
    lower_crop = img[int(h * 0.4):, :]  # Focus on bottom 60% of image
    
    processed_crop = preprocess_plate_crop(lower_crop)
    
    ocr_results = reader.readtext(processed_crop)
    
    extracted_strings = []
    for bbox, text, prob in ocr_results:
        clean_text = "".join(e for e in text if e.isalnum()).upper()
        if len(clean_text) >= 4 and prob > 0.2:
            extracted_strings.append(clean_text)

    if extracted_strings:
        results["pythonPlateText"] = " ".join(extracted_strings)

    return results

if __name__ == "__main__":
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        output = analyze_image(image_path)
        # Output ONLY raw JSON to stdout for Node.js child process to parse
        print(json.dumps(output))
    else:
        print(json.dumps({"error": "No image path provided"}))