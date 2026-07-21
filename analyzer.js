const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const exifr = require('exifr');
const fs = require('fs');
const crypto = require('crypto');
const MediaTask = require('./models/MediaTask');
async function processImageHeuristics(imagePath) {
  const results = {
    blurDetected: false,
    brightnessLevel: 'normal',
    isScreenshot: false,
    isValidVehiclePlate: false,
    extractedText: '',
    isDuplicate: false,
    dimensionsValid: true,
    isPhotoOfPhotoOrEdited: false,
    imageDimensions: '',
    confidenceScore: 1.0
  };
  try {
    // --- 1. Duplicate Check via MD5 Hash ---
    const fileBuffer = fs.readFileSync(imagePath);
    const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    const existingMatch = await MediaTask.findOne({ fileHash: hash, status: 'completed' });

    if (existingMatch) {
      results.isDuplicate = true;
    }

    // --- 2. Image Metadata & Dimensions ---
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const stats = await image.stats();

    results.imageDimensions = `${metadata.width}x${metadata.height}`;

    if (metadata.width < 480 || metadata.height < 480) {
      results.dimensionsValid = false;
    }

    // --- 3. Luminance / Brightness Check ---
    const rMean = stats.channels[0].mean;
    const gMean = stats.channels[1].mean;
    const bMean = stats.channels[2].mean;
    const averageLuminance = 0.2126 * rMean + 0.7152 * gMean + 0.0722 * bMean;

    if (averageLuminance < 45) {
      results.brightnessLevel = 'low';
    } else if (averageLuminance > 215) {
      results.brightnessLevel = 'high';
    }

    // --- 4. Blur Detection ---
    const variance = stats.channels.reduce((acc, ch) => acc + (ch.stdev * ch.stdev), 0) / stats.channels.length;
    if (variance < 1100) {
      results.blurDetected = true;
    }

    // --- 5. Aspect Ratio / Screenshot Check ---
    if (metadata.width && metadata.height) {
      const aspectRatio = (metadata.height / metadata.width).toFixed(2);
      if (['2.16', '2.22'].includes(aspectRatio)) {
        results.isScreenshot = true;
      }
    }

    // --- 6. EXIF Metadata Check ---
    try {
      const exifData = await exifr.parse(imagePath).catch(() => null);
      if (exifData && exifData.Software) {
        if (/(photoshop|gimp|adobe|pixelmator|corel|canva)/i.test(exifData.Software)) {
          results.isPhotoOfPhotoOrEdited = true;
        }
      }
    } catch (metaErr) {
      // Silently ignore EXIF parsing errors
    }

    // --- 7. OCR & License Plate Regex ---
    const ocrResult = await Tesseract.recognize(imagePath, 'eng');
    const rawText = ocrResult.data.text || '';
    results.extractedText = rawText.trim();

    // Remove all whitespace and non-alphanumeric noise to join split plate characters
    const condensedText = rawText.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Standard Indian Vehicle Plate Regex (e.g., MH12NW8556, TN05BT5754)
    const indianPlateRegex = /[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}/;

    // Fuzzy OCR character swap pass
    const normalizedText = condensedText
      .replace(/O/g, '0')
      .replace(/I/g, '1')
      .replace(/L/g, '1')
      .replace(/Z/g, '2')
      .replace(/S/g, '5');

    if (indianPlateRegex.test(condensedText) || indianPlateRegex.test(normalizedText)) {
      results.isValidVehiclePlate = true;
    } else {
      results.isValidVehiclePlate = false;
    }

    // --- 8. Final Score Calculation ---
    let score = 1.0;

    if (results.isDuplicate) score -= 0.30;
    if (!results.dimensionsValid) score -= 0.10;
    if (results.brightnessLevel !== 'normal') score -= 0.10;
    if (results.blurDetected) score -= 0.15;
    if (results.isScreenshot) score -= 0.10;
    if (results.isPhotoOfPhotoOrEdited) score -= 0.15;
    if (!results.isValidVehiclePlate) score -= 0.15;

    results.confidenceScore = parseFloat(Math.max(0, Math.min(score, 1.0)).toFixed(2));

    return { results, hash };
  } catch (error) {
    console.error(`Error during complex image heuristic analysis:`, error);
    throw new Error(`Analysis engine failed: ${error.message}`);
  }
}

module.exports = { processImageHeuristics };