require('dotenv').config();

// Initialize logger first
let logger;
try {
  logger = require('./src/utils/logger');
} catch (err) {
  console.error('Failed to initialize logger:', err);
  process.exit(1);
}

const app = require('./src/app');
const connectDB = require('./src/config/database');
const uploadJob = require('./src/jobs/uploadJob');

const PORT = process.env.PORT || 4000;

// Ensure required environment variables
const requiredEnvVars = [
  'MONGODB_URI',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'EMAIL_USER',
  'EMAIL_PASS'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Validate optional but important variables
if (!process.env.REPORT_EMAIL) {
  logger.warn('REPORT_EMAIL not set, reports will be sent to EMAIL_USER');
}

// Initialize application
const startServer = async () => {
  let server;
  
  try {
    // Connect to database
    logger.info('Connecting to MongoDB...');
    await connectDB();
    logger.info('✅ MongoDB connected');

    // Start cron job for scheduled uploads
    try {
      uploadJob.start();
      logger.info('✅ Upload job scheduled');
    } catch (cronError) {
      logger.error('Failed to schedule upload job:', cronError.message);
      logger.warn('Server will continue without scheduled uploads');
    }

    // Start server
    server = app.listen(PORT, '0.0.0.0', () => {
      logger.info('========================================');
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📅 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`⏰ Upload scheduled at: ${process.env.UPLOAD_SCHEDULE_TIME || '17:30'} ${process.env.TIMEZONE || 'Asia/Kolkata'}`);
      logger.info(`🔗 OAuth URL: http://localhost:${PORT}/auth/login`);
      logger.info(`📊 Upload Job Status:`, uploadJob.getStatus());
      logger.info('========================================');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }

  // Graceful shutdown handlers
  const gracefulShutdown = () => {
    logger.info('Shutting down gracefully...');
    
    // Stop cron job
    if (uploadJob) {
      uploadJob.stop();
      logger.info('Upload job stopped');
    }
    
    // Close server
    if (server) {
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
      
      // Force exit after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after 30 seconds');
        process.exit(1);
      }, 30000);
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    gracefulShutdown();
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
};

// Start the application
startServer();