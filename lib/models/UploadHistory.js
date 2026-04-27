/**
 * UploadHistory.js
 * Mongoose model for upload history entries
 */

const mongoose = require('mongoose');

const uploadHistorySchema = new mongoose.Schema({
  fileType: {
    type: String,
    enum: ['video', 'image', 'thumbnail', 'file'],
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  hash: {
    type: String,
    index: true
  },
  url: {
    type: String
  },
  imageUrl: {
    type: String
  },
  thumbnailUrl: {
    type: String
  },
  fileSize: {
    type: Number
  },
  success: {
    type: Boolean,
    default: true
  },
  error: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// TTL index: automatically delete documents older than 2 days
uploadHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 24 * 60 * 60 });

module.exports = mongoose.model('UploadHistory', uploadHistorySchema);
