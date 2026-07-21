# Intelligent Media Processing Pipeline
## Overview
The Intelligent Media Processing Pipeline is a backend application built using Node.js, Express, and MongoDB that accepts vehicle image uploads and processes them asynchronously.
Each uploaded image is assigned a unique processing ID, stored locally, and analyzed in the background without blocking the upload request.
The system performs multiple heuristic-based quality checks, extracts text using OCR, validates Indian vehicle registration numbers, and stores the analysis results in MongoDB.
---
# Features
- Upload vehicle images through REST APIs
- Generate unique processing IDs using UUID
- Store uploaded images locally
- Store metadata and processing status in MongoDB
- Asynchronous background image processing
- Blur detection
- Brightness analysis
- Screenshot detection
- OCR using Tesseract.js
- Indian vehicle number plate validation
- Metadata extraction using Exifr
- Status API
- Analysis Results API
- Analytics API
---
# Technologies Used
## Backend
- Node.js
- Express.js
## Database
- MongoDB
- Mongoose
## Libraries
- Multer
- Sharp
- Tesseract.js
- Exifr
- UUID
- dotenv
---
# Architecture
Client
↓
POST /upload
↓
Express Server
↓
Store metadata (Pending)
↓
MongoDB
↓
EventEmitter Queue
↓
Background Worker
↓
Image Analyzer
↓
Sharp + Tesseract.js + Exifr
↓
Update Database
↓
GET /status
---
# Processing Flow
1. Client uploads an image.
2. Multer stores the image locally.
3. A UUID is generated for tracking.
4. Metadata is stored in MongoDB with status `pending`.
5. The task is added to an EventEmitter-based queue.
6. Background processing begins.
7. The analyzer performs:
   - Brightness Analysis
   - Blur Detection
   - Screenshot Detection
   - OCR Extraction
   - Number Plate Validation
   - Metadata Extraction
8. Results are saved back to MongoDB.
9. Client retrieves processing status and analysis results using REST APIs.
---
# Image Analysis
## Blur Detection
Uses Sharp to analyze image sharpness using pixel variance heuristics.
## Brightness Analysis
Calculates average image luminance to detect low-light images.
## Screenshot Detection
Detects common screenshot resolutions and aspect ratios.
## OCR
Extracts text from uploaded images using Tesseract.js.
## Number Plate Validation
Matches OCR output against the Indian registration number format using Regular Expressions.
## Metadata Extraction
Extracts available EXIF metadata using Exifr.
---
# API Endpoints
## Upload Image
POST /api/upload
Returns
- Task ID
- Processing Status
---
## Get Processing Status
GET /api/tasks/:taskId
---
## Get Analysis Results
GET /api/tasks/:taskId
---
## Get Analytics
GET /api/analytics
---
# Database
Each task stores:
- Task ID
- File Name
- Upload Time
- Processing Status
- Analysis Results
- Failure Reason
---
# AI Usage Disclosure
AI tools used:
- ChatGPT
- GitHub Copilot
AI assisted with:
- Image processing heuristics
- OCR integration examples
- Regular expression validation
- API structure improvements
- Queue design ideas
Validation Process:
- Reviewed all generated code before integration.
- Tested endpoints using Postman.
- Verified MongoDB updates after every processing stage.
- Modified AI-generated suggestions where necessary to fit project requirements.
---
# Engineering Decisions
The project uses an EventEmitter-based in-memory queue instead of Redis/BullMQ.
Reason:
- Simpler setup
- No additional infrastructure
- Satisfies asynchronous processing requirements
- Suitable for assignment-scale deployments
For production systems, BullMQ or RabbitMQ would be preferred to provide persistence, retries, and distributed processing.
---
# Trade-offs
Current implementation intentionally simplifies:
- In-memory queue
- Local file storage
- Single-process worker
Future production improvements:
- Redis + BullMQ
- Retry mechanism
- Docker support
- Cloud storage
- Distributed workers
- Duplicate image detection
- Confidence scoring
- Automated testing
---
# Running the Project
## Install
npm install
## Configure
Create a .env file
PORT=5000
MONGO_URI=your_mongodb_connection
## Run
node server.js
or
nodemon server.js
---
# Conclusion
This project demonstrates asynchronous backend processing, REST API development, image analysis, OCR integration, MongoDB persistence, and engineering decision-making while keeping the architecture modular and easy to extend.