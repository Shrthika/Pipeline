const mongoose = require('mongoose');
const MediaTaskSchema = new mongoose.Schema({
  taskId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  originalName: { type: String, required: true },
  storagePath: { type: String, required: true },
  mimeType: { type: String, required: true },
  fileSize: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'], 
    default: 'pending' 
  },
  analysisResults: {
    blurDetected: { type: Boolean, default: false },
    brightnessLevel: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    isScreenshot: { type: Boolean, default: false },
    isValidVehiclePlate: { type: Boolean, default: false },
    extractedText: { type: String, default: '' },
    isDuplicate: { type: Boolean, default: false },
    dimensionsValid: { type: Boolean, default: true },
    isPhotoOfPhotoOrEdited: { type: Boolean, default: false },
    imageDimensions: { type: String, default: '' },
    confidenceScore: { type: Number, default: 0.85 }
  },
  fileHash: { type: String, index: true },
  failureReason: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
module.exports = mongoose.model('MediaTask', MediaTaskSchema);