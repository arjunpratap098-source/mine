const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  channelId: {
    type: String,
    required: true,
    unique: true
  },
  channelTitle: {
    type: String,
    required: true
  },
  tokens: {
    access_token: String,
    refresh_token: String,
    scope: String,
    token_type: String,
    expiry_date: Number
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUploadDate: {
    type: Date,
    default: null
  },
  totalUploads: {
    type: Number,
    default: 0
  },
  failedUploads: {
    type: Number,
    default: 0
  },
  registeredAt: {
    type: Date,
    default: Date.now
  },
  lastTokenRefresh: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
userSchema.index({ isActive: 1, lastUploadDate: 1 });
userSchema.index({ channelId: 1 });

module.exports = mongoose.model('User', userSchema);