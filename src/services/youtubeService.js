const fs = require('fs');
const { createYoutubeService } = require('../config/youtube');
const config = require('../config/config');
const logger = require('../utils/logger');
const tokenService = require('./tokenService');

// YouTube max file size: 256GB
const MAX_YOUTUBE_FILE_SIZE = 256 * 1024 * 1024 * 1024;

class YouTubeService {
  // Upload video to YouTube
  async uploadVideo(user, videoData, filePath) {
    try {
      logger.info(`Starting YouTube upload for user: ${user.email}`);

      // Validate file exists and get size
      if (!fs.existsSync(filePath)) {
        throw new Error('Video file not found');
      }

      const fileStats = fs.statSync(filePath);
      const fileSizeGB = (fileStats.size / (1024 * 1024 * 1024)).toFixed(2);

      if (fileStats.size > MAX_YOUTUBE_FILE_SIZE) {
        throw new Error(`Video file too large: ${fileSizeGB}GB (YouTube limit: 256GB)`);
      }

      logger.info(`File size: ${fileSizeGB}GB`);

      // Get valid tokens (will refresh if needed and handle auth errors)
      let tokens;
      try {
        tokens = await tokenService.getValidTokens(user._id);
      } catch (tokenError) {
        // Token error thrown by tokenService will mark user as inactive
        throw tokenError;
      }

      // Create YouTube service with user's tokens
      const youtube = createYoutubeService(tokens);

      // Prepare video metadata with proper escaping
      const videoMetadata = {
        snippet: {
          title: this.sanitizeMetadata(videoData.title),
          description: this.sanitizeMetadata(
            videoData.description || `Uploaded via Auto-Uploader\n\nOriginal filename: ${videoData.filename}`
          ),
          tags: this.validateAndFormatTags(config.youtube.tags),
          categoryId: String(config.youtube.category)
        },
        status: {
          privacyStatus: this.validatePrivacyStatus(config.youtube.privacy),
          selfDeclaredMadeForKids: false
        }
      };

      logger.info(`Uploading video: ${videoData.title}`);

      // Upload video with timeout
      const uploadPromise = youtube.videos.insert(
        {
          part: ['snippet', 'status'],
          requestBody: videoMetadata,
          media: {
            body: fs.createReadStream(filePath)
          }
        },
        {
          timeout: 3600000 // 1 hour timeout for upload
        }
      );

      // Set a separate timeout for the entire upload process
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('YouTube upload timeout after 1 hour'));
        }, 3600000);
      });

      const response = await Promise.race([uploadPromise, timeoutPromise]);

      const youtubeVideoId = response.data.id;
      const videoUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;

      logger.info(`Video uploaded successfully: ${videoUrl}`);

      return {
        success: true,
        youtubeVideoId,
        videoUrl,
        data: response.data
      };
    } catch (error) {
      logger.error(`YouTube upload failed: ${error.message}`);

      // Check if it's a quota error
      if (error.code === 403 || error.message.includes('quota')) {
        throw new Error('YouTube API quota exceeded - please try again later');
      }

      // Check if it's an auth error
      if (error.code === 401 || error.message.includes('invalid_grant')) {
        throw new Error('YouTube authentication failed - user needs to re-authenticate');
      }

      // Check for file-related errors
      if (error.message.includes('ENOENT') || error.message.includes('file not found')) {
        throw new Error('Video file was deleted before upload completed');
      }

      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  // Get user's YouTube channel info
  async getChannelInfo(tokens) {
    try {
      const youtube = createYoutubeService(tokens);

      const response = await youtube.channels.list({
        part: ['snippet', 'contentDetails', 'statistics'],
        mine: true
      });

      if (response.data.items && response.data.items.length > 0) {
        const channel = response.data.items[0];
        return {
          channelId: channel.id,
          channelTitle: channel.snippet.title,
          channelDescription: channel.snippet.description,
          subscriberCount: channel.statistics.subscriberCount,
          videoCount: channel.statistics.videoCount
        };
      }

      throw new Error('No channel found for this account');
    } catch (error) {
      logger.error('Failed to get channel info:', error.message);
      throw error;
    }
  }

  // Sanitize metadata to prevent injection and API errors
  sanitizeMetadata(text) {
    if (!text) return '';
    
    // Remove control characters
    let sanitized = text.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Limit length (YouTube limits: title 100 chars, description 5000 chars)
    if (text.includes('\n')) {
      // This is likely description
      sanitized = sanitized.substring(0, 5000);
    } else {
      // This is likely title
      sanitized = sanitized.substring(0, 100);
    }
    
    return sanitized.trim();
  }

  // Validate and format tags
  validateAndFormatTags(tags) {
    if (!tags) return [];
    
    let tagArray = Array.isArray(tags) ? tags : String(tags).split(',');
    
    return tagArray
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0 && tag.length <= 30)
      .slice(0, 30); // YouTube allows max 30 tags
  }

  // Validate privacy status
  validatePrivacyStatus(status) {
    const validStatuses = ['public', 'private', 'unlisted'];
    const normalizedStatus = String(status).toLowerCase();
    
    if (!validStatuses.includes(normalizedStatus)) {
      logger.warn(`Invalid privacy status: ${status}, defaulting to 'public'`);
      return 'public';
    }
    
    return normalizedStatus;
  }
}

module.exports = new YouTubeService();