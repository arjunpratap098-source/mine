const mongoose = require('mongoose');

const uploadLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  videoId: {
    type: String, // Video ID from main server
    required: true
  },
  youtubeVideoId: {
    type: String, // YouTube video ID after upload
    default: null
  },
  videoTitle: {
    type: String,
    required: true
  },
  videoFilename: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'downloading', 'uploading', 'success', 'failed'],
    default: 'pending'
  },
  errorMessage: {
    type: String,
    default: null
  },
  uploadedAt: {
    type: Date,
    default: null
  },
  duration: {
    type: Number, // Upload duration in seconds
    default: null
  }
}, {
  timestamps: true
});

// Indexes
uploadLogSchema.index({ userId: 1, createdAt: -1 });
uploadLogSchema.index({ status: 1 });
uploadLogSchema.index({ uploadedAt: -1 });

module.exports = mongoose.model('UploadLog', uploadLogSchema);