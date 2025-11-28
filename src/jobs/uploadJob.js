const cron = require('node-cron');
const moment = require('moment-timezone');
const User = require('../models/User');
const UploadLog = require('../models/UploadLog');
const videoService = require('../services/videoService');
const youtubeService = require('../services/youtubeService');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const config = require('../config/config');
const { cleanupFile, formatDuration, validateVideoFile } = require('../utils/helpers');

class UploadJob {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
    this.skippedCycles = 0;
  }

  // Check database connection
  async checkDatabaseConnection() {
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState !== 1) {
        throw new Error('Database connection not ready');
      }
      return true;
    } catch (error) {
      logger.error('Database connection check failed:', error.message);
      return false;
    }
  }

  // Main upload process
  async processUploads() {
    if (this.isRunning) {
      this.skippedCycles++;
      logger.warn(`Upload job already running, skipping this cycle (${this.skippedCycles} skipped)`);
      
      if (this.skippedCycles >= 3) {
        logger.error('Upload job skipped 3 times in a row. Check for stuck processes.');
        this.skippedCycles = 0;
      }
      return;
    }

    this.isRunning = true;
    this.skippedCycles = 0;
    const startTime = Date.now();

    logger.info('========================================');
    logger.info('Starting daily upload job');
    logger.info(`Time: ${moment().tz(config.upload.timezone).format('YYYY-MM-DD HH:mm:ss')}`);
    logger.info('========================================');

    const results = {
      successful: [],
      failed: [],
      totalUsers: 0,
      noVideos: false,
      dbError: false
    };

    try {
      // Check database connection first
      const dbConnected = await this.checkDatabaseConnection();
      if (!dbConnected) {
        results.dbError = true;
        logger.error('Database not connected, aborting upload cycle');
        await emailService.sendUploadReport(results);
        return;
      }

      // Get all active users, sorted by last upload date (round-robin)
      const users = await User.find({ isActive: true })
        .sort({ lastUploadDate: 1 })
        .limit(100) // Safety limit to prevent excessive queries
        .exec();

      results.totalUsers = users.length;

      if (users.length === 0) {
        logger.warn('No active users found');
        await emailService.sendUploadReport(results);
        return;
      }

      logger.info(`Found ${users.length} active users`);

      // Process one video per user (round-robin)
      for (const user of users) {
        try {
          await this.processUserUpload(user, results);
        } catch (error) {
          logger.error(`Error processing user ${user.email}:`, error.message);
          results.failed.push({
            userEmail: user.email,
            videoTitle: 'N/A',
            error: error.message
          });
        }
      }

      // Send email report
      logger.info('Sending upload report...');
      await emailService.sendUploadReport(results);

    } catch (error) {
      logger.error('Upload job critical error:', error);
      // Try to send error notification
      try {
        await emailService.sendUploadReport(results);
      } catch (emailError) {
        logger.error('Failed to send error report:', emailError.message);
      }
    } finally {
      this.isRunning = false;
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.info('========================================');
      logger.info(`Upload job completed in ${duration}s`);
      logger.info(`Successful: ${results.successful.length}, Failed: ${results.failed.length}`);
      logger.info('========================================');
    }
  }

  // Process upload for a single user
  async processUserUpload(user, results) {
    let videoData = null;
    let filePath = null;
    let uploadLog = null;

    try {
      logger.info(`Processing upload for: ${user.email} (${user.channelTitle})`);

      // Get next video from main server
      videoData = await videoService.getNextVideo();

      if (!videoData) {
        logger.info(`No videos available for ${user.email}`);
        results.noVideos = true;
        return;
      }

      // Create upload log
      uploadLog = new UploadLog({
        userId: user._id,
        videoId: videoData.id,
        videoTitle: videoData.title,
        videoFilename: videoData.filename,
        status: 'downloading'
      });
      await uploadLog.save();

      // Download video
      logger.info(`Downloading: ${videoData.title}`);
      filePath = await videoService.downloadVideo(videoData);
      
      // Validate video file
      try {
        await validateVideoFile(filePath);
      } catch (validationError) {
        throw new Error(`Video file validation failed: ${validationError.message}`);
      }

      uploadLog.status = 'uploading';
      await uploadLog.save();

      // Upload to YouTube
      const uploadStartTime = Date.now();
      const uploadResult = await youtubeService.uploadVideo(user, videoData, filePath);
      const uploadDuration = Math.floor((Date.now() - uploadStartTime) / 1000);

      // Update upload log
      uploadLog.status = 'success';
      uploadLog.youtubeVideoId = uploadResult.youtubeVideoId;
      uploadLog.uploadedAt = new Date();
      uploadLog.duration = uploadDuration;
      await uploadLog.save();

      // Update user stats
      user.lastUploadDate = new Date();
      user.totalUploads += 1;
      await user.save();

      // Mark as downloaded and delete from main server
      await videoService.markAsDownloaded(videoData.id);

      // Clean up downloaded file with verification
      const cleanupSuccess = await cleanupFile(filePath);
      if (!cleanupSuccess) {
        logger.warn(`File cleanup incomplete for ${filePath}`);
      }

      // Add to successful results
      results.successful.push({
        userEmail: user.email,
        videoTitle: videoData.title,
        videoUrl: uploadResult.videoUrl,
        duration: formatDuration(uploadDuration)
      });

      logger.info(`✅ Successfully uploaded for ${user.email}: ${uploadResult.videoUrl}`);

    } catch (error) {
      logger.error(`❌ Upload failed for ${user.email}:`, error.message);

      // Update upload log
      if (uploadLog) {
        uploadLog.status = 'failed';
        uploadLog.errorMessage = error.message;
        try {
          await uploadLog.save();
        } catch (logError) {
          logger.error('Failed to save error log:', logError.message);
        }
      }

      // Update user stats
      user.failedUploads += 1;
      try {
        await user.save();
      } catch (userError) {
        logger.error('Failed to update user stats:', userError.message);
      }

      // Clean up file if it exists
      if (filePath) {
        await cleanupFile(filePath);
      }

      // Check if error is authentication-related
      if (error.message.includes('authentication') || error.message.includes('re-authenticate')) {
        logger.warn(`User ${user.email} needs re-authentication`);
        await emailService.sendReAuthenticationRequired(user.email, user.channelTitle);
      } else {
        // Send error notification for other errors
        await emailService.sendErrorNotification(
          user.email,
          videoData?.title || 'Unknown',
          error.message
        );
      }

      // Add to failed results
      results.failed.push({
        userEmail: user.email,
        videoTitle: videoData?.title || 'Unknown',
        error: error.message
      });
    }
  }

  // Start the cron job
  start() {
    try {
      // Validate timezone
      const validTimezones = moment.tz.names();
      if (!validTimezones.includes(config.upload.timezone)) {
        throw new Error(`Invalid timezone: ${config.upload.timezone}. Valid timezones: ${validTimezones.join(', ').substring(0, 100)}...`);
      }

      // Parse schedule time (HH:mm format)
      const [hour, minute] = config.upload.scheduleTime.split(':');
      
      if (!hour || !minute || isNaN(hour) || isNaN(minute)) {
        throw new Error(`Invalid schedule time format: ${config.upload.scheduleTime}. Use HH:mm format.`);
      }

      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        throw new Error(`Invalid schedule time values: ${config.upload.scheduleTime}. Hour must be 0-23, minute must be 0-59.`);
      }

      const cronExpression = `${minute} ${hour} * * *`;

      logger.info(`Scheduling upload job: ${cronExpression} (${config.upload.timezone})`);

      // Schedule the job
      this.cronJob = cron.schedule(cronExpression, async () => {
        await this.processUploads();
      }, {
        timezone: config.upload.timezone
      });

      logger.info(`✅ Upload job scheduled for ${config.upload.scheduleTime} ${config.upload.timezone}`);
    } catch (error) {
      logger.error('Failed to schedule upload job:', error.message);
      throw error;
    }
  }

  // Manual trigger for testing
  async runNow() {
    logger.info('Manual trigger: Running upload job now...');
    await this.processUploads();
  }

  // Stop the cron job
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Upload job stopped');
    }
  }

  // Get job status
  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.cronJob !== null,
      skippedCycles: this.skippedCycles
    };
  }
}

module.exports = new UploadJob();