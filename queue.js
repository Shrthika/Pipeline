const EventEmitter = require('events');
const fs = require('fs');
const MediaTask = require('./models/MediaTask');
const { processImageHeuristics } = require('./analyzer');

const queueEvents = new EventEmitter();

const taskQueue = [];
let isProcessing = false;

async function processQueue() {

    if (isProcessing) return;

    if (taskQueue.length === 0) {
        console.log("[Queue] Waiting for tasks...");
        return;
    }

    isProcessing = true;

    const taskId = taskQueue.shift();

    console.log("=================================");
    console.log("[Queue] Processing:", taskId);

    try {

        const task = await MediaTask.findOneAndUpdate(
            { taskId },
            { status: "processing" },
            { new: true }
        );

        if (!task) {
            throw new Error("Task not found.");
        }

        console.log("[Queue] File:", task.storagePath);

        if (!fs.existsSync(task.storagePath)) {
            throw new Error("Uploaded image does not exist.");
        }

        console.log("[Queue] Analyzer started...");

        const { results, hash } =
            await processImageHeuristics(task.storagePath);

        console.log("[Queue] Analyzer finished.");

        await MediaTask.findOneAndUpdate(
            { taskId },
            {
                status: "completed",
                analysisResults: results,
                fileHash: hash
            }
        );

        console.log("[Queue] Task Completed");

    }
    catch (err) {

        console.error("[Queue] ERROR");
        console.error(err);

        await MediaTask.findOneAndUpdate(
            { taskId },
            {
                status: "failed",
                failureReason: err.message
            }
        ).catch(console.error);

    }

    isProcessing = false;

    setImmediate(processQueue);

}

queueEvents.on("addTask", (taskId) => {

    console.log("[Queue] New Task:", taskId);

    taskQueue.push(taskId);

    processQueue();

});

module.exports = {
    queueEvents
};