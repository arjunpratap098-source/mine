const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');
const { ensureDownloadsDir } = require('../utils/helpers');

// Max video file size: 256GB (YouTube limit)
const MAX_VIDEO_SIZE = 256 * 1024 * 1024 * 1024;

class VideoService {
  constructor() {
    this.mainServerUrl = config.mainServer.url;
  }

  // Get next pending video from main server
  async getNextVideo() {
    try {
      const url = `${this.mainServerUrl}${config.mainServer.endpoints.nextVideo}`;
      logger.info(`Fetching next video from: ${url}`);

      const response = await axios.get(url, {
        timeout: 30000 // 30 second timeout
      });

      if (response.data.success && response.data.data) {
        const videoData = response.data.data;
        
        // Validate required fields
        if (!videoData.id || !videoData.title || !videoData.filename || !videoData.downloadUrl) {
          throw new Error('Invalid video data received from server');
        }

        logger.info(`Found video: ${videoData.title}`);
        return videoData;
      }

      return null;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        logger.info('No pending videos available');
        return null;
      }
      if (error.code === 'ECONNABORTED') {
        throw new Error('Main server connection timeout');
      }
      logger.error('Error fetching next video:', error.message);
      throw error;
    }
  }

  // Download video from signed URL
  async downloadVideo(videoData) {
    const downloadsDir = ensureDownloadsDir();
    const filePath = path.join(downloadsDir, `${videoData.id}_${videoData.filename}`);

    try {
      logger.info(`Downloading video: ${videoData.title}`);

      const response = await axios({
        method: 'GET',
        url: videoData.downloadUrl,
        responseType: 'stream',
        timeout: 600000, // 10 minute timeout for large files
        maxContentLength: MAX_VIDEO_SIZE,
        maxRedirects: 5
      });

      // Check content-length header
      const contentLength = parseInt(response.headers['content-length'], 10);
      if (contentLength > MAX_VIDEO_SIZE) {
        throw new Error(`Video file too large: ${contentLength} bytes (max: ${MAX_VIDEO_SIZE} bytes)`);
      }

      const writer = fs.createWriteStream(filePath);
      
      let downloadedBytes = 0;
      let lastLogTime = Date.now();

      // Track download progress
      response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        
        // Log progress every 10 seconds
        if (Date.now() - lastLogTime > 10000) {
          const percent = contentLength ? ((downloadedBytes / contentLength) * 100).toFixed(2) : '?';
          logger.info(`Download progress: ${percent}% (${downloadedBytes} bytes)`);
          lastLogTime = Date.now();
        }
      });

      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          logger.info(`Video downloaded successfully: ${filePath}`);
          resolve(filePath);
        });

        writer.on('error', (error) => {
          logger.error(`Write error during download: ${error.message}`);
          fs.removeSync(filePath); // Clean up incomplete file
          reject(error);
        });

        response.data.on('error', (error) => {
          logger.error(`Stream error during download: ${error.message}`);
          writer.destroy();
          fs.removeSync(filePath); // Clean up incomplete file
          reject(error);
        });

        // Overall timeout for download
        const downloadTimeout = setTimeout(() => {
          writer.destroy();
          fs.removeSync(filePath);
          reject(new Error('Download timeout - took too long'));
        }, 900000); // 15 minute absolute timeout

        writer.on('finish', () => clearTimeout(downloadTimeout));
        writer.on('error', () => clearTimeout(downloadTimeout));
      });
    } catch (error) {
      logger.error(`Failed to download video: ${error.message}`);
      
      // Clean up any partial file
      try {
        if (fs.existsSync(filePath)) {
          fs.removeSync(filePath);
        }
      } catch (cleanupError) {
        logger.error(`Failed to cleanup partial download: ${cleanupError.message}`);
      }

      throw error;
    }
  }

  // Mark video as downloaded on main server
  async markAsDownloaded(videoId) {
    try {
      const url = `${this.mainServerUrl}${config.mainServer.endpoints.markDownloaded.replace(':id', videoId)}`;
      logger.info(`Marking video as downloaded: ${videoId}`);

      await axios.post(url, {}, {
        timeout: 30000
      });

      logger.info(`Video marked as downloaded: ${videoId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to mark video as downloaded: ${error.message}`);
      // Don't throw - this is non-critical
      return false;
    }
  }
}

module.exports = new VideoService();