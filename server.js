require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const MediaTask = require('./models/MediaTask');
const { queueEvents } = require('./queue');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/media_pipeline';
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueSuffix);
  }
});
const upload = multer({ storage });

app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded.' });
    }

    const taskId = uuidv4();
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    const newTask = new MediaTask({
      taskId: taskId, 
      originalName: req.file.originalname,
      storagePath: req.file.path,
      imageUrl: imageUrl,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      status: 'pending'
    });

    await newTask.save();
    queueEvents.emit('addTask', taskId);

    return res.status(202).json({
      message: 'Image uploaded and queued for processing.',
      taskId: taskId,
      imageUrl: imageUrl,
      status: 'pending'
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await MediaTask.findOne({ taskId: taskId });

    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const responsePayload = {
      taskId: task.taskId,
      status: task.status,
      imageUrl: task.imageUrl || `${req.protocol}://${req.get('host')}/${task.storagePath}`,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    };

    if (task.status === 'completed') {
      responsePayload.analysisResults = task.analysisResults;
    } else if (task.status === 'failed') {
      responsePayload.failureReason = task.failureReason;
    }

    return res.status(200).json(responsePayload);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics', async (req, res) => {
  try {
    const totalTasks = await MediaTask.countDocuments();
    const statusCounts = await MediaTask.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const breakdown = { completed: 0, pending: 0, processing: 0, failed: 0 };
    statusCounts.forEach(item => {
      if (item._id) breakdown[item._id] = item.count;
    });

    return res.status(200).json({
      totalTasks,
      statusBreakdown: breakdown
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));