import cv2
import easyocr
import re
from ultralytics import YOLO
vehicle_model = YOLO("yolov8n.pt")
ocr_reader = easyocr.Reader(['en'], gpu=False) 

VEHICLE_CLASSES = {
    2: "Car",
    3: "Motorcycle",
    5: "Bus",
    7: "Truck"
}

def clean_license_text(text_list):
    """Clean OCR output and format license plate string using Regex."""
    full_text = "".join(text_list).upper()
    cleaned = re.sub(r'[^A-Z0-9]', '', full_text)
    return cleaned
def process_vehicle_image(image_path):
    img = cv2.imread(image_path)
    if img is None:
        print("Error: Could not load image.")
        return
    results = vehicle_model(img)[0]
    detected_vehicles = []

    for box in results.boxes:
        cls_id = int(box.cls[0])
        if cls_id in VEHICLE_CLASSES:
            vehicle_type = VEHICLE_CLASSES[cls_id]
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            detected_vehicles.append({
                "type": vehicle_type,
                "bbox": (x1, y1, x2, y2)
            })
            
            cv2.rectangle(img, (x1, y1), (x2, y2), (255, 0, 0), 2)
            cv2.putText(img, vehicle_type, (x1, y1 - 10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 0, 0), 2)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    ocr_results = ocr_reader.readtext(gray)

    license_plates = []
    
    for (bbox, text, prob) in ocr_results:
        
        if prob > 0.3:
            cleaned_text = clean_license_text([text])
        
            if len(cleaned_text) >= 6:
                license_plates.append((cleaned_text, prob, bbox))
    print("=" * 40)
    print("DETECTION & OCR SUMMARY")
    print("=" * 40)
    
    if detected_vehicles:
        print(f"Vehicle Type Detected: {detected_vehicles[0]['type']}")
    else:
        print("Vehicle Type Detected: Unknown / Not Found")

    if license_plates:
        for plate, conf, bbox in license_plates:
            print(f"Number Plate Extracted : {plate} (Confidence: {conf:.2f})")
    else:
        print("Number Plate Extracted : No text recognized")
    print("=" * 40)
process_vehicle_image("vehicle_test.jpg")