const { oauth2Client } = require('../config/youtube');
const User = require('../models/User');
const logger = require('../utils/logger');

class TokenService {
  // Refresh access token if expired
  async refreshTokenIfNeeded(user) {
    try {
      // Check if token is expired or will expire in next 5 minutes
      const expiryDate = user.tokens.expiry_date;
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      if (!expiryDate || now >= (expiryDate - fiveMinutes)) {
        logger.info(`Refreshing token for user: ${user.email}`);
        
        oauth2Client.setCredentials({
          refresh_token: user.tokens.refresh_token
        });

        const { credentials } = await oauth2Client.refreshAccessToken();
        
        // Update user tokens
        user.tokens = {
          ...user.tokens,
          access_token: credentials.access_token,
          expiry_date: credentials.expiry_date
        };
        user.lastTokenRefresh = new Date();
        await user.save();

        logger.info(`Token refreshed successfully for: ${user.email}`);
        return user.tokens;
      }

      return user.tokens;
    } catch (error) {
      logger.error(`Token refresh failed for ${user.email}:`, error.message);
      throw new Error(`User authentication token expired. Please re-authenticate by visiting /auth/login`);
    }
  }

  // Check if user tokens are valid
  async validateUserTokens(userId) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.tokens || !user.tokens.refresh_token) {
        logger.warn(`Invalid tokens for user ${userId}`);
        return false;
      }

      await this.refreshTokenIfNeeded(user);
      return true;
    } catch (error) {
      logger.error(`Token validation failed:`, error.message);
      return false;
    }
  }

  // Get valid tokens for a user
  async getValidTokens(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.tokens || !user.tokens.refresh_token) {
      throw new Error('User tokens not found. User needs to re-authenticate.');
    }

    try {
      return await this.refreshTokenIfNeeded(user);
    } catch (error) {
      // Mark user as inactive if token refresh fails
      user.isActive = false;
      await user.save();
      logger.warn(`User ${user.email} marked as inactive due to token error`);
      throw error;
    }
  }
}

module.exports = new TokenService();