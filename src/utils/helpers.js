const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

/**
 * Ensure downloads directory exists and return its path
 */
const ensureDownloadsDir = () => {
  const downloadsDir = path.join(__dirname, '../../downloads');
  
  try {
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
      logger.info(`Created downloads directory: ${downloadsDir}`);
    }
    return downloadsDir;
  } catch (error) {
    logger.error(`Failed to create downloads directory: ${error.message}`);
    throw error;
  }
};

/**
 * Clean up downloaded file
 */
const cleanupFile = async (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      await fs.remove(filePath);
      logger.info(`Cleaned up file: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Failed to cleanup file ${filePath}: ${error.message}`);
    return false;
  }
};

/**
 * Format duration from seconds to human readable format
 */
const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
};

/**
 * Get file size in human readable format
 */
const getFileSize = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    const bytes = stats.size;
    
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  } catch (error) {
    logger.error(`Failed to get file size: ${error.message}`);
    return 'Unknown';
  }
};

/**
 * Validate video file exists and is readable
 */
const validateVideoFile = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('Video file does not exist');
    }
    
    const stats = await fs.stat(filePath);
    
    if (stats.size === 0) {
      throw new Error('Video file is empty');
    }
    
    if (stats.size < 1024) { // Less than 1KB
      throw new Error('Video file is too small');
    }
    
    return true;
  } catch (error) {
    logger.error(`Video file validation failed: ${error.message}`);
    throw error;
  }
};

/**
 * Sanitize filename for safe storage
 */
const sanitizeFilename = (filename) => {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 200); // Limit length
};

/**
 * Sleep/delay utility
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry function with exponential backoff
 */
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        logger.warn(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
};

module.exports = {
  ensureDownloadsDir,
  cleanupFile,
  formatDuration,
  getFileSize,
  validateVideoFile,
  sanitizeFilename,
  sleep,
  retryWithBackoff
};