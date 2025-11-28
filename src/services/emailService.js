const transporter = require('../config/email');
const config = require('../config/config');
const logger = require('../utils/logger');
const moment = require('moment-timezone');
const { retryWithBackoff } = require('../utils/helpers');

class EmailService {
  // Send daily upload report with retry logic
  async sendUploadReport(results) {
    try {
      const { successful, failed, totalUsers, noVideos } = results;
      
      const successCount = successful.length;
      const failCount = failed.length;
      const totalAttempts = successCount + failCount;

      // Generate HTML report
      const htmlContent = this.generateReportHTML(results);

      const subject = noVideos 
        ? `YouTube Upload Report - No Videos Available (${moment().tz(config.upload.timezone).format('YYYY-MM-DD')})`
        : `YouTube Upload Report - ${successCount}/${totalAttempts} Successful (${moment().tz(config.upload.timezone).format('YYYY-MM-DD')})`;

      const mailOptions = {
        from: config.email.user,
        to: config.email.reportEmail,
        subject: subject,
        html: htmlContent
      };

      // Retry with exponential backoff
      await retryWithBackoff(
        async () => {
          await transporter.sendMail(mailOptions);
        },
        3, // max retries
        1000 // base delay 1s
      );

      logger.info('Upload report sent successfully');
      return true;
    } catch (error) {
      logger.error('Failed to send upload report after retries:', error.message);
      // Don't throw - allow process to continue even if email fails
      return false;
    }
  }

  // Send error notification email with retry logic
  async sendErrorNotification(userEmail, videoTitle, errorMessage) {
    try {
      const mailOptions = {
        from: config.email.user,
        to: config.email.reportEmail,
        subject: `YouTube Upload Failed - ${userEmail}`,
        html: `
          <h2>Upload Error Notification</h2>
          <p><strong>User:</strong> ${userEmail}</p>
          <p><strong>Video:</strong> ${videoTitle}</p>
          <p><strong>Error:</strong> ${errorMessage}</p>
          <p><strong>Time:</strong> ${moment().tz(config.upload.timezone).format('YYYY-MM-DD HH:mm:ss')}</p>
          <hr>
          <p style="color: #666;">This is an automated notification from YouTube Auto-Uploader.</p>
        `
      };

      // Retry with exponential backoff
      await retryWithBackoff(
        async () => {
          await transporter.sendMail(mailOptions);
        },
        3, // max retries
        1000 // base delay 1s
      );

      logger.info(`Error notification sent for ${userEmail}`);
      return true;
    } catch (error) {
      logger.error('Failed to send error notification after retries:', error.message);
      // Don't throw - allow process to continue
      return false;
    }
  }

  // Send re-authentication required email
  async sendReAuthenticationRequired(userEmail, channelTitle) {
    try {
      // Use environment variable for base URL, fallback to Render URL
      const baseUrl = process.env.GOOGLE_REDIRECT_URI 
        ? process.env.GOOGLE_REDIRECT_URI.replace('/auth/youtube/callback', '')
        : 'https://mine-a3cc.onrender.com';

      const mailOptions = {
        from: config.email.user,
        to: userEmail,
        subject: 'YouTube Auto-Uploader - Re-authentication Required',
        html: `
          <h2>Re-authentication Required</h2>
          <p>Hi,</p>
          <p>Your YouTube channel "<strong>${channelTitle}</strong>" requires re-authentication to continue automated uploads.</p>
          <p>Please visit the link below to re-authorize your account:</p>
          <p><a href="${baseUrl}/auth/login" style="background: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Re-authenticate Now</a></p>
          <p style="color: #666; margin-top: 30px; font-size: 12px;">This is an automated notification from YouTube Auto-Uploader system.</p>
        `
      };

      await retryWithBackoff(
        async () => {
          await transporter.sendMail(mailOptions);
        },
        2,
        500
      );

      logger.info(`Re-authentication email sent to ${userEmail}`);
      return true;
    } catch (error) {
      logger.error('Failed to send re-authentication email:', error.message);
      return false;
    }
  }

  // Generate HTML report
  generateReportHTML(results) {
    const { successful, failed, totalUsers, noVideos } = results;
    const timestamp = moment().tz(config.upload.timezone).format('YYYY-MM-DD HH:mm:ss');

    if (noVideos) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { background: #f0f0f0; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .summary { background: #fff3cd; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📊 YouTube Auto-Uploader Report</h1>
            <p><strong>Date:</strong> ${timestamp}</p>
          </div>
          
          <div class="summary">
            <h2>⚠️ No Videos Available</h2>
            <p>No pending videos were available on the main server at upload time.</p>
            <p><strong>Active Users:</strong> ${totalUsers}</p>
          </div>

          <div class="footer">
            <p>This is an automated report from YouTube Auto-Uploader system.</p>
          </div>
        </body>
        </html>
      `;
    }

    const successHTML = successful.map(item => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${this.escapeHtml(item.userEmail)}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${this.escapeHtml(item.videoTitle)}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">
          <a href="${item.videoUrl}" target="_blank">View Video</a>
        </td>
        <td style="padding: 8px; border: 1px solid #ddd;">${item.duration}</td>
      </tr>
    `).join('');

    const failedHTML = failed.map(item => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${this.escapeHtml(item.userEmail)}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${this.escapeHtml(item.videoTitle || 'N/A')}</td>
        <td style="padding: 8px; border: 1px solid #ddd; color: #d32f2f;">${this.escapeHtml(item.error)}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px; }
          .header { background: #f0f0f0; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
          .stat-card { background: white; padding: 15px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
          .stat-value { font-size: 32px; font-weight: bold; margin: 10px 0; }
          .success { color: #4caf50; }
          .failed { color: #f44336; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; background: white; }
          th { background: #2196F3; color: white; padding: 12px; text-align: left; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📊 YouTube Auto-Uploader Daily Report</h1>
          <p><strong>Date:</strong> ${timestamp}</p>
        </div>
        
        <div class="summary">
          <div class="stat-card">
            <div>Total Users</div>
            <div class="stat-value">${totalUsers}</div>
          </div>
          <div class="stat-card">
            <div>Attempted</div>
            <div class="stat-value">${successful.length + failed.length}</div>
          </div>
          <div class="stat-card">
            <div>Successful</div>
            <div class="stat-value success">${successful.length}</div>
          </div>
          <div class="stat-card">
            <div>Failed</div>
            <div class="stat-value failed">${failed.length}</div>
          </div>
        </div>

        ${successful.length > 0 ? `
          <h2 style="color: #4caf50;">✅ Successful Uploads (${successful.length})</h2>
          <table>
            <thead>
              <tr>
                <th>User Email</th>
                <th>Video Title</th>
                <th>YouTube Link</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              ${successHTML}
            </tbody>
          </table>
        ` : ''}

        ${failed.length > 0 ? `
          <h2 style="color: #f44336;">❌ Failed Uploads (${failed.length})</h2>
          <table>
            <thead>
              <tr>
                <th>User Email</th>
                <th>Video Title</th>
                <th>Error Message</th>
              </tr>
            </thead>
            <tbody>
              ${failedHTML}
            </tbody>
          </table>
        ` : ''}

        <div class="footer">
          <p>This is an automated report from YouTube Auto-Uploader system.</p>
          <p>If you notice any issues, please check the application logs for more details.</p>
        </div>
      </body>
      </html>
    `;
  }

  // Escape HTML to prevent injection
  escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

module.exports = new EmailService();