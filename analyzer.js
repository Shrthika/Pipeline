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

        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image not found: ${imagePath}`);
        }

        console.log("=================================");
        console.log("[Analyzer] Starting Analysis");
        console.log("[Analyzer] Image:", imagePath);

        const fileBuffer = fs.readFileSync(imagePath);

        const hash = crypto
            .createHash('md5')
            .update(fileBuffer)
            .digest('hex');

        const existingMatch = await MediaTask.findOne({
            fileHash: hash,
            status: "completed"
        });

        if (existingMatch) {
            results.isDuplicate = true;
        }

        console.log("[Analyzer] Reading Metadata...");

        const image = sharp(imagePath);

        const metadata = await image.metadata();

        const stats = await image.stats();

        results.imageDimensions =
            `${metadata.width}x${metadata.height}`;

        if (
            metadata.width < 480 ||
            metadata.height < 480
        ) {
            results.dimensionsValid = false;
        }

        const rMean = stats.channels[0].mean;
        const gMean = stats.channels[1].mean;
        const bMean = stats.channels[2].mean;

        const averageLuminance =
            0.2126 * rMean +
            0.7152 * gMean +
            0.0722 * bMean;

        if (averageLuminance < 45)
            results.brightnessLevel = "low";

        else if (averageLuminance > 215)
            results.brightnessLevel = "high";

        const variance =
            stats.channels.reduce(
                (acc, ch) => acc + (ch.stdev * ch.stdev),
                0
            ) / stats.channels.length;

        if (variance < 1100)
            results.blurDetected = true;

        if (metadata.width && metadata.height) {

            const aspectRatio =
                (metadata.height / metadata.width)
                .toFixed(2);

            if (["2.16", "2.22"].includes(aspectRatio)) {
                results.isScreenshot = true;
            }
        }

        console.log("[Analyzer] Reading EXIF...");

        try {

            const exifData =
                await exifr.parse(imagePath).catch(() => null);

            if (
                exifData &&
                exifData.Software &&
                /(photoshop|gimp|adobe|pixelmator|corel|canva)/i.test(exifData.Software)
            ) {
                results.isPhotoOfPhotoOrEdited = true;
            }

        } catch (err) {
            console.log("[Analyzer] EXIF skipped");
        }

        console.log("[Analyzer] Starting Full OCR...");

        const fullOcr = await Promise.race([

            Tesseract.recognize(imagePath, "eng", {
                logger: m => console.log(m)
            }),

            new Promise((_, reject) =>
                setTimeout(() =>
                    reject(new Error("OCR Timeout")),
                    30000
                )
            )

        ]);

        console.log("[Analyzer] Full OCR Completed");

        const rawText =
            fullOcr.data.text || "";

        results.extractedText =
            rawText.trim();

        console.log("[Analyzer] Preparing Plate Region...");

        const cropTop =
            Math.floor(metadata.height * 0.70);

        const cropHeight =
            metadata.height - cropTop;

        const binarizedCropBuffer =
            await sharp(imagePath)
                .extract({
                    left: 0,
                    top: cropTop,
                    width: metadata.width,
                    height: cropHeight
                })
                .resize({
                    width: Math.min(metadata.width * 2, 1200)
                })
                .grayscale()
                .linear(1.5, -50)
                .threshold(128)
                .toBuffer();

        console.log("[Analyzer] Starting Plate OCR...");

        const cropOcr = await Promise.race([

            Tesseract.recognize(
                binarizedCropBuffer,
                "eng",
                {
                    logger: m => console.log(m)
                }
            ),

            new Promise((_, reject) =>
                setTimeout(() =>
                    reject(new Error("Plate OCR Timeout")),
                    30000
                )
            )

        ]);

        console.log("[Analyzer] Plate OCR Completed");

        const cropText =
            cropOcr.data.text || "";results.extractedText =
    rawText.trim();
    const indianPlateRegex =
    /[A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{4}/;

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

let match =
    cropCondensedText.match(indianPlateRegex) ||
    fullCondensedText.match(indianPlateRegex);

if (!match) {

    const lines = cropText
        .split('\n')
        .map(line => normalizeString(line))
        .filter(Boolean);

    for (let i = 0; i < lines.length - 1; i++) {

        const combined =
            lines[i] + lines[i + 1];

        match = combined.match(indianPlateRegex);

        if (match) break;
    }

}

if (match) {

    results.isValidVehiclePlate = true;
    results.pythonPlateText = match[0];

}
else {

    const fallback =
        (cropCondensedText + fullCondensedText)
            .match(
                /(MH|DL|KA|TN|KL|HR|UP|GJ|RJ|WB|TS|AP)\d{2}[A-Z]{1,3}\d{4}/
            );

    if (fallback) {

        results.isValidVehiclePlate = true;
        results.pythonPlateText = fallback[0];

    }

}

let score = 1.0;

if (results.isDuplicate)
    score -= 0.30;

if (!results.dimensionsValid)
    score -= 0.10;

if (results.brightnessLevel !== "normal")
    score -= 0.10;

if (results.blurDetected)
    score -= 0.15;

if (results.isScreenshot)
    score -= 0.10;

if (results.isPhotoOfPhotoOrEdited)
    score -= 0.15;

if (!results.isValidVehiclePlate)
    score -= 0.15;

results.confidenceScore =
    Number(
        Math.max(
            0,
            Math.min(score, 1)
        ).toFixed(2)
    );

console.log("[Analyzer] Analysis Completed Successfully");

return {
    results,
    hash
};

}
catch (error) {

    console.error("=================================");
    console.error("[Analyzer] ERROR");
    console.error(error);
    console.error("=================================");

    throw new Error(
        `Analysis engine failed: ${error.message}`
    );

}

}

module.exports = {
    processImageHeuristics
};