
const EventEmitter = require('events');
const MediaTask = require('./models/MediaTask');
const { processImageHeuristics } = require('./analyzer');
const queueEvents = new EventEmitter();
const taskQueue = [];
let isProcessing = false;
async function processQueue() {
  if (isProcessing) {
    console.log('[Queue Engine] Worker is currently busy. Waiting...');
    return;
  }
  if (taskQueue.length === 0) {
    console.log('[Queue Engine] Queue is now empty. Worker sleeping.');
    return;
  }
  isProcessing = true;
  const taskId = taskQueue.shift();
  console.log(`[Queue Engine] Starting processing for Task ID: ${taskId}`);
  try {
    const updatedTask = await MediaTask.findOneAndUpdate(
      { taskId }, 
      { status: 'processing' },
      { new: true }
    );
    if (!updatedTask) {
      console.error(`[Queue Engine] Failed to find task doc in DB for ID: ${taskId}`);
      isProcessing = false;
      setImmediate(processQueue);
      return;
    }
    console.log(`[Queue Engine] Status updated to 'processing' in DB for: ${taskId}`);
    console.log(`[Queue Engine] Invoking 7-point analysis engine for: ${updatedTask.storagePath}`);
    const { results, hash } = await processImageHeuristics(updatedTask.storagePath);
    console.log(`[Queue Engine] Analysis extraction completed successfully for: ${taskId}`);
    await MediaTask.findOneAndUpdate(
      { taskId },
      { 
        status: 'completed', 
        analysisResults: results,
        fileHash: hash
      }
    );
    console.log(`[Queue Engine] Task ${taskId} successfully saved as 'completed'.`);
  } catch (error) {
    console.error(`[Queue Engine] CRITICAL FAILURE on Task ${taskId}:`, error.message);
    await MediaTask.findOneAndUpdate(
      { taskId },
      { status: 'failed', failureReason: error.message }
    ).catch(dbErr => console.error('[Queue Engine] Secondary DB update crash:', dbErr));
  }
  isProcessing = false;
  setImmediate(processQueue);
}
queueEvents.on('addTask', (taskId) => {
  console.log(`[Queue Event] 'addTask' event intercepted for ID: ${taskId}`);
  taskQueue.push(taskId);
  processQueue();
});
module.exports = { queueEvents };