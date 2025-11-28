const { oauth2Client, getAuthUrl } = require('../config/youtube');
const User = require('../models/User');
const youtubeService = require('../services/youtubeService');
const logger = require('../utils/logger');

// Step 1: Redirect user to Google OAuth consent screen
exports.initiateAuth = (req, res) => {
  try {
    const authUrl = getAuthUrl();
    logger.info('Generated OAuth URL, redirecting user...');
    
    // For web app, redirect directly to Google OAuth
    res.redirect(authUrl);
  } catch (error) {
    logger.error('Error generating auth URL:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1 style="color: #f44336;">❌ Error</h1>
          <p>${this.escapeHtml(error.message)}</p>
        </body>
      </html>
    `);
  }
};

// Step 2: Handle OAuth callback
exports.handleCallback = async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1 style="color: #f44336;">❌ Authorization Failed</h1>
            <p>Error: ${this.escapeHtml(error)}</p>
            <p>Please try again from the beginning.</p>
            <a href="/auth/login" style="background: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">Try Again</a>
          </body>
        </html>
      `);
    }

    if (!code) {
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1 style="color: #f44336;">❌ Authorization Failed</h1>
            <p>No authorization code received.</p>
            <p>Please try again from the beginning.</p>
            <a href="/auth/login" style="background: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">Try Again</a>
          </body>
        </html>
      `);
    }

    logger.info('Received OAuth callback with code');

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    logger.info('Tokens obtained successfully');

    if (!tokens) {
      throw new Error('Failed to obtain tokens from Google');
    }

    // Get user's channel info
    oauth2Client.setCredentials(tokens);
    const channelInfo = await youtubeService.getChannelInfo(tokens);

    // Validate channel info
    if (!channelInfo || !channelInfo.channelId) {
      throw new Error('Failed to retrieve channel information');
    }

    // Determine user email - Google OAuth should provide it via ID token
    let userEmail = null;
    
    if (tokens.id_token) {
      // Decode ID token to get email
      try {
        const base64Url = tokens.id_token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          Buffer.from(base64, 'base64')
            .toString('utf-8')
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const decoded = JSON.parse(jsonPayload);
        userEmail = decoded.email;
      } catch (decodeError) {
        logger.warn('Failed to decode ID token:', decodeError.message);
      }
    }

    // Fallback: use a generated email if we can't extract it
    if (!userEmail) {
      logger.warn('Could not extract email from token, generating placeholder');
      userEmail = `${channelInfo.channelId}@youtube.user`;
    }

    logger.info(`Processing user: ${userEmail}, Channel: ${channelInfo.channelId}`);

    // Check if user already exists
    let user = await User.findOne({ channelId: channelInfo.channelId });

    if (user) {
      // Update existing user
      user.tokens = tokens;
      user.email = userEmail; // Update email in case it changed
      user.channelTitle = channelInfo.channelTitle;
      user.isActive = true;
      user.lastTokenRefresh = new Date();
      await user.save();
      logger.info(`Updated existing user: ${user.email}`);
    } else {
      // Create new user
      user = new User({
        email: userEmail,
        channelId: channelInfo.channelId,
        channelTitle: channelInfo.channelTitle,
        tokens: tokens,
        isActive: true
      });
      await user.save();
      logger.info(`Created new user: ${user.email}`);
    }

    // Success response
    res.send(`
      <html>
        <head>
          <style>
            body { font-family: Arial; padding: 40px; text-align: center; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 10px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #4caf50; }
            .info { background: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .channel { font-size: 18px; font-weight: bold; color: #333; margin: 10px 0; }
            .note { color: #666; font-size: 14px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Authorization Successful!</h1>
            <p>Your YouTube account has been successfully connected to the auto-uploader system.</p>
            
            <div class="info">
              <div class="channel">Channel: ${this.escapeHtml(channelInfo.channelTitle)}</div>
              <div>Email: ${this.escapeHtml(user.email)}</div>
              <div>Channel ID: ${this.escapeHtml(channelInfo.channelId)}</div>
            </div>

            <h3>What happens next?</h3>
            <p>✓ Videos will be automatically uploaded to your channel daily at ${process.env.UPLOAD_SCHEDULE_TIME || '5:30 PM'} IST</p>
            <p>✓ You'll receive email reports after each upload cycle</p>
            <p>✓ One video will be uploaded to your channel per day (round-robin distribution)</p>

            <div class="note">
              <p>You can now safely close this window.</p>
              <p>Make sure your YouTube channel is properly configured to accept uploads.</p>
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1 style="color: #f44336;">❌ Authorization Failed</h1>
          <p>${this.escapeHtml(error.message)}</p>
          <p>Please try again or contact support.</p>
          <a href="/auth/login" style="background: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">Try Again</a>
        </body>
      </html>
    `);
  }
};

// Get all registered users with pagination
exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Validate pagination params
    if (limit > 100) {
      return res.status(400).json({
        success: false,
        message: 'Limit cannot exceed 100'
      });
    }

    if (page < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page must be greater than 0'
      });
    }

    const totalUsers = await User.countDocuments();
    const users = await User.find()
      .select('-tokens')
      .sort({ registeredAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
    
    res.json({
      success: true,
      data: users,
      pagination: {
        total: totalUsers,
        page: page,
        limit: limit,
        pages: Math.ceil(totalUsers / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Deactivate user
exports.deactivateUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId format
    if (!userId || userId.length !== 24) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { isActive: false },
      { new: true }
    ).select('-tokens');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    logger.info(`User deactivated: ${user.email}`);

    res.json({
      success: true,
      message: 'User deactivated successfully',
      data: user
    });
  } catch (error) {
    logger.error('Error deactivating user:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Helper method to escape HTML
exports.escapeHtml = function(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
};