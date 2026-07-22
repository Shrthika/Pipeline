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
    confidenceScore: 1.0,
    vehicleType: 'Auto-Rickshaw (Three-Wheeler)',
    pythonPlateText: 'Not Found',
    pythonPlateConfidence: 0
  };

  try {
    const fileBuffer = fs.readFileSync(imagePath);
    const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    const existingMatch = await MediaTask.findOne({ fileHash: hash, status: 'completed' });

    if (existingMatch) {
      results.isDuplicate = true;
    }
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const stats = await image.stats();

    results.imageDimensions = `${metadata.width}x${metadata.height}`;

    if (metadata.width < 480 || metadata.height < 480) {
      results.dimensionsValid = false;
    }
    const rMean = stats.channels[0].mean;
    const gMean = stats.channels[1].mean;
    const bMean = stats.channels[2].mean;
    const averageLuminance = 0.2126 * rMean + 0.7152 * gMean + 0.0722 * bMean;

    if (averageLuminance < 45) {
      results.brightnessLevel = 'low';
    } else if (averageLuminance > 215) {
      results.brightnessLevel = 'high';
    }
    const variance = stats.channels.reduce((acc, ch) => acc + (ch.stdev * ch.stdev), 0) / stats.channels.length;
    if (variance < 1100) {
      results.blurDetected = true;
    }

    if (metadata.width && metadata.height) {
      const aspectRatio = (metadata.height / metadata.width).toFixed(2);
      if (['2.16', '2.22'].includes(aspectRatio)) {
        results.isScreenshot = true;
      }
    }
    try {
      const exifData = await exifr.parse(imagePath).catch(() => null);
      if (exifData && exifData.Software) {
        if (/(photoshop|gimp|adobe|pixelmator|corel|canva)/i.test(exifData.Software)) {
          results.isPhotoOfPhotoOrEdited = true;
        }
      }
    } catch (metaErr) {
  
    }

  
    const fullOcr = await Tesseract.recognize(imagePath, 'eng');
    const rawText = fullOcr.data.text || '';
    results.extractedText = rawText.trim();

  
    const cropTop = Math.floor(metadata.height * 0.70); 
    const cropHeight = metadata.height - cropTop;

    const binarizedCropBuffer = await sharp(imagePath)
      .extract({ left: 0, top: cropTop, width: metadata.width, height: cropHeight })
      .resize({ width: metadata.width * 3 }) 
      .grayscale()
      .linear(1.5, -50) 
      .threshold(128)   
      .toBuffer();

    const cropOcr = await Tesseract.recognize(binarizedCropBuffer, 'eng');
    const cropText = cropOcr.data.text || '';

    const indianPlateRegex = /[A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{4}/;

    
    const normalizeString = (str) => {
      return str
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .replace(/O/g, '0')
        .replace(/I/g, '1')
        .replace(/L/g, '1')
        .replace(/Z/g, '2')
        .replace(/S/g, '5');
    };

  
    const fullCondensedText = normalizeString(rawText);
    const cropCondensedText = normalizeString(cropText);

    let match = cropCondensedText.match(indianPlateRegex) || fullCondensedText.match(indianPlateRegex);

    
    if (!match) {
      const lines = cropText.split('\n').map(l => normalizeString(l)).filter(Boolean);
      for (let i = 0; i < lines.length - 1; i++) {
        const combinedTwoLines = lines[i] + lines[i + 1];
        match = combinedTwoLines.match(indianPlateRegex);
        if (match) break;
      }
    }

    if (match) {
      results.isValidVehiclePlate = true;
      results.pythonPlateText = match[0];
    } else {
      
      const fallbackMatch = (cropCondensedText + fullCondensedText).match(/(MH|DL|KA|TN|KL|HR|UP|GJ|RJ|WB|TS|AP)\d{2}[A-Z]{1,3}\d{4}/);
      if (fallbackMatch) {
        results.isValidVehiclePlate = true;
        results.pythonPlateText = fallbackMatch[0];
      }
    }

  
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
    console.error(`Error during image heuristic analysis:`, error);
    throw new Error(`Analysis engine failed: ${error.message}`);
  }
}

module.exports = { processImageHeuristics };